import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Vault, VaultFile, SyncState } from './types'

/**
 * Vault online su Supabase: la sorgente condivisa tra PC e telefono.
 * - tabella `notes` (path, content, deleted, updated_at) — vedi supabase/schema.sql
 * - immagini nel bucket privato `vault`, indicizzate dalla tabella `assets`
 * - offline: le note restano in cache sul dispositivo e le modifiche aspettano in una coda
 */
export interface SupaConfig { url: string; anonKey: string }
const CFG_KEY = 'theoffice:supabase'
const CACHE_KEY = 'theoffice:cache'
const OUTBOX_KEY = 'theoffice:outbox'

/** Progetto "the-office" (Supabase, Francoforte). URL e chiave pubblicabile non sono segreti: l'accesso ai dati lo decide l'account. */
export const DEFAULT_SUPA: SupaConfig = { url: 'https://yaqqigswrdxlptlnhuaz.supabase.co', anonKey: 'sb_publishable_8S5sDKAIDMLM7YUpWhTDVg_kdzFXWOA' }
export const loadSupaConfig = (): SupaConfig => {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); return c?.url && c?.anonKey ? c : DEFAULT_SUPA } catch { return DEFAULT_SUPA }
}
export const saveSupaConfig = (c: SupaConfig | null) => (c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY))

let client: SupabaseClient | null = null
export function supa(cfg = loadSupaConfig()): SupabaseClient | null {
  if (!cfg) return null
  if (!client) client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'theoffice:auth' } })
  return client
}

interface Row { path: string; content: string; deleted: boolean; updated_at: string }
type Outbox = Record<string, { content: string; deleted: boolean; at: number }>

const readJSON = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T } catch { return d } }
const writeJSON = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* pieno: si va avanti senza cache */ } }

/** Nome sicuro per lo Storage (niente accenti o simboli): hash del percorso + estensione. */
export async function assetKey(path: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(path))
  const hex = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex + (path.match(/\.[a-z0-9]{2,5}$/i)?.[0].toLowerCase() || '')
}

export function supabaseVault(device: string, name = 'GONDISHAPUR'): Vault & { flush(): Promise<void>; client: SupabaseClient } {
  const sb = supa()!
  let cache = readJSON<Record<string, { t: string; m: number }>>(CACHE_KEY, {})
  let outbox = readJSON<Outbox>(OUTBOX_KEY, {})
  let state: SyncState = navigator.onLine ? 'ok' : 'offline'
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((f) => f())
  const persist = () => { writeJSON(CACHE_KEY, cache); writeJSON(OUTBOX_KEY, outbox) }
  const urls = new Map<string, Promise<string | null>>()

  async function flush() {
    const items = Object.entries(outbox)
    if (!items.length) { if (state !== 'error') state = navigator.onLine ? 'ok' : 'offline'; return }
    if (!navigator.onLine) { state = 'offline'; return }
    state = 'syncing'
    for (const [path, w] of items) {
      const { error } = await sb.from('notes').upsert({ path, content: w.content, deleted: w.deleted, updated_by: device })
      if (error) { state = /fetch|network/i.test(error.message) ? 'offline' : 'error'; console.warn(error); return }
      if (outbox[path]?.at === w.at) delete outbox[path]
    }
    persist()
    state = 'ok'
  }

  addEventListener('online', () => { flush().then(notify) })
  addEventListener('offline', () => { state = 'offline'; notify() })
  setInterval(() => { if (Object.keys(outbox).length) flush().then(notify) }, 15000)

  async function fetchAll(): Promise<Row[]> {
    const out: Row[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('notes').select('path, content, deleted, updated_at').order('path').range(from, from + 999)
      if (error) throw error
      out.push(...(data as Row[]))
      if (!data || data.length < 1000) break
    }
    return out
  }

  return {
    name,
    kind: 'supabase',
    client: sb,
    flush,
    async list(): Promise<VaultFile[]> {
      try {
        await flush()
        const rows = await fetchAll()
        cache = {}
        for (const r of rows) if (!r.deleted) cache[r.path] = { t: r.content, m: Date.parse(r.updated_at) }
        if (state !== 'error') state = 'ok'
      } catch (e) {
        state = 'offline'
        if (!Object.keys(cache).length) throw e
      }
      for (const [p, w] of Object.entries(outbox)) w.deleted ? delete cache[p] : (cache[p] = { t: w.content, m: w.at })
      persist()
      return Object.entries(cache).map(([path, f]) => ({ path, text: f.t, mtime: f.m }))
    },
    async read(path) {
      if (outbox[path]) return outbox[path].deleted ? null : outbox[path].content
      if (navigator.onLine) {
        const { data, error } = await sb.from('notes').select('content, deleted, updated_at').eq('path', path).maybeSingle()
        if (!error) {
          if (!data || data.deleted) { delete cache[path]; return null }
          cache[path] = { t: data.content, m: Date.parse(data.updated_at) }
          return data.content
        }
      }
      return cache[path]?.t ?? null
    },
    async write(path, content) {
      outbox[path] = { content, deleted: false, at: Date.now() }
      cache[path] = { t: content, m: Date.now() }
      persist()
      await flush()
    },
    async remove(path) {
      outbox[path] = { content: '', deleted: true, at: Date.now() }
      delete cache[path]
      persist()
      await flush()
    },
    async exists(path) {
      if (/\.md$/i.test(path)) return (await this.read(path)) != null
      const { data } = await sb.from('assets').select('path').eq('path', path).maybeSingle()
      return !!data
    },
    url(path) {
      let p = urls.get(path)
      if (!p) {
        p = (async () => {
          const { data } = await sb.from('assets').select('key').eq('path', path).maybeSingle()
          if (!data) return null
          const r = await sb.storage.from('vault').createSignedUrl(data.key, 60 * 60 * 24 * 7)
          return r.data?.signedUrl ?? null
        })().catch(() => null)
        urls.set(path, p)
      }
      return p
    },
    async find(file) {
      const { data } = await sb.from('assets').select('path').ilike('path', '%/' + file.replace(/[%_]/g, '\\$&')).limit(1)
      return data?.[0]?.path ?? null
    },
    watch(cb) {
      listeners.add(cb)
      let t: ReturnType<typeof setTimeout>
      const ch = sb
        .channel('notes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, (msg) => {
          const r = msg.new as Partial<Row> & { updated_by?: string }
          if (r?.updated_by === device && Date.now() - Date.parse(r.updated_at || '') < 5000) return
          clearTimeout(t)
          t = setTimeout(cb, 300)
        })
        .subscribe()
      const onVis = () => { if (document.visibilityState === 'visible') cb() }
      document.addEventListener('visibilitychange', onVis)
      return () => { listeners.delete(cb); sb.removeChannel(ch); document.removeEventListener('visibilitychange', onVis) }
    },
    status: () => state,
  }
}
