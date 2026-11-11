import { toast } from 'sonner'
import { useStore } from '../store'
import type { Vault } from './types'
import { isDesktop, desktopVault } from './desktop'
import { memoryVault } from './memory'
import { supa, supabaseVault, loadSupaConfig, saveSupaConfig, type SupaConfig } from './supabase'
import { createSync, type SyncReport } from './sync'

/**
 * Sceglie da dove leggere le note:
 * - PC (app desktop): la cartella del vault; se è collegato Supabase parte la sincronizzazione.
 * - Telefono: Supabase (con cache e coda offline).
 * - Sviluppo: dati di prova.
 */
let syncer: ReturnType<typeof createSync> | null = null
let syncTimer: ReturnType<typeof setInterval> | null = null

export const encodeCode = (c: SupaConfig) => btoa(unescape(encodeURIComponent(JSON.stringify(c))))
export function decodeCode(code: string): SupaConfig | null {
  try {
    const c = JSON.parse(decodeURIComponent(escape(atob(code.trim()))))
    return c?.url && c?.anonKey ? { url: String(c.url), anonKey: String(c.anonKey) } : null
  } catch { return null }
}

async function signedIn(): Promise<boolean> {
  const sb = supa()
  if (!sb) return false
  const { data } = await sb.auth.getSession()
  return !!data.session
}

function onReport(r: SyncReport) {
  const st = useStore.getState()
  useStore.setState({ sync: { state: r.error ? (navigator.onLine ? 'error' : 'offline') : 'ok', last: r } })
  if (r.pulled || r.merged || r.conflicts.length) st.refresh()
  if (r.conflicts.length) toast('Nota modificata sia qui sia sul telefono', { description: 'Ho tenuto la versione del telefono e salvato quella del PC accanto: ' + r.conflicts.join(', '), duration: 12000 })
}

export async function startDesktopSync(local: Vault) {
  const sb = supa()
  if (!sb || !(await signedIn())) { useStore.setState({ sync: null }); return }
  syncer = createSync(local, sb, onReport)
  useStore.setState({ sync: { state: 'syncing' } })
  const run = () => { useStore.setState((s) => ({ sync: s.sync ? { ...s.sync, state: 'syncing' } : { state: 'syncing' } })); syncer!.run() }
  run()
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(run, 20000)
  let t: ReturnType<typeof setTimeout>
  sb.channel('pc-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (m) => {
      if ((m.new as { updated_by?: string })?.updated_by === 'pc') return
      clearTimeout(t)
      t = setTimeout(run, 400)
    })
    .subscribe()
  local.watch?.(() => { clearTimeout(t); t = setTimeout(run, 1500) })
  addEventListener('online', run)
}

export function syncNow() { syncer?.run() }
export function uploadAssets(progress: (d: number, t: number) => void) { return syncer ? syncer.uploadAllAssets(progress) : Promise.resolve(0) }

export async function boot() {
  const st = useStore.getState()
  try {
    if (isDesktop()) {
      const j = await fetch('/_api/ping').then((r) => r.json()).catch(() => ({}))
      const v = desktopVault(j.vault || 'GONDISHAPUR')
      await st.setVault(v)
      startDesktopSync(v)
      return
    }
    if (await signedIn()) {
      await st.setVault(supabaseVault('telefono'))
      return
    }
    const seed = import.meta.env.DEV ? await fetch('./dev/vault.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) : null
    if (seed) await st.setVault(memoryVault(seed))
    else useStore.setState({ loaded: true, needsConnect: true })
  } catch (e) {
    useStore.setState({ loaded: true, error: String((e as Error)?.message || e) })
  }
}

/** Collega questo dispositivo a Supabase. Restituisce un messaggio d'errore leggibile, o null. */
export async function connect(cfg: SupaConfig, email: string, password: string, create = false): Promise<string | null> {
  saveSupaConfig(cfg)
  const sb = supa(cfg)!
  const res = create ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password })
  if (res.error) {
    const m = res.error.message
    return /invalid login/i.test(m) ? 'Email o password non corrette.' : /confirm/i.test(m) ? 'Conferma prima l’indirizzo email (controlla la posta), poi accedi.' : m
  }
  if (create && !res.data.session) return 'Account creato: conferma l’email dal messaggio che ti è arrivato, poi premi Accedi.'
  location.reload()
  return null
}

export async function disconnect() {
  await supa()?.auth.signOut()
  localStorage.removeItem('theoffice:cache')
  location.reload()
}
