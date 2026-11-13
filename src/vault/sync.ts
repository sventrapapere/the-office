import type { SupabaseClient } from '@supabase/supabase-js'
import type { Vault } from './types'
import { assetKey } from './supabase'
import { LOG_PATH, parseLog, serializeLog } from '../lib/checklist'
import { parseFM, IMG_EXT } from '../lib/md'

/**
 * Sincronizzazione PC ↔ Supabase, a tre vie (come sync.rs della v1).
 * L'app desktop lavora sulla cartella del vault (Obsidian resta compatibile) e questo modulo
 * tiene allineata la copia online che usa il telefono. Per ogni nota si confrontano:
 *   L = cartella sul PC, R = Supabase, B = ultima versione sincronizzata (hash).
 * Cambiata solo da una parte → vince quella. Cambiata da entrambe → per il Registro abitudini
 * si uniscono le spunte, per le altre note si tiene quella online e si salva la copia del PC
 * accanto ("… (conflitto PC …).md"), così non si perde niente.
 */
export const BASE_KEY = 'theoffice:syncbase'
const SKIP = /^(_dashboard|_templates|\+|30 Archivio lavori|40 Documenti personali)\//

export function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  const s = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

export type Step =
  | { op: 'same'; path: string; h: string | null }
  | { op: 'pull'; path: string; text: string | null }
  | { op: 'push'; path: string; text: string | null }
  | { op: 'merge'; path: string; text: string }
  | { op: 'conflict'; path: string; local: string; remote: string | null }

/** Decide cosa fare per ogni nota. Pura: si testa senza rete. */
export function plan(local: Map<string, string>, remote: Map<string, string | null>, base: Record<string, string>): Step[] {
  const paths = new Set([...local.keys(), ...remote.keys(), ...Object.keys(base)])
  const out: Step[] = []
  for (const path of paths) {
    if (SKIP.test(path)) continue
    const L = local.get(path) ?? null
    const R = remote.has(path) ? remote.get(path)! : null
    const hL = L == null ? null : hash(L)
    const hR = R == null ? null : hash(R)
    const b = base[path] ?? null
    if (hL === hR) { out.push({ op: 'same', path, h: hL }); continue }
    if (hL === b) { out.push({ op: 'pull', path, text: R }); continue }
    if (hR === b) { out.push({ op: 'push', path, text: L }); continue }
    // cambiata da entrambe le parti (o nuova da entrambe)
    if (L == null) { out.push({ op: 'pull', path, text: R }); continue }   // cancellata qui, modificata online: tengo la modifica
    if (R == null) { out.push({ op: 'push', path, text: L }); continue }   // cancellata online, modificata qui: tengo la modifica
    if (path === LOG_PATH) { out.push({ op: 'merge', path, text: mergeLog(L, R) }); continue }
    out.push({ op: 'conflict', path, local: L, remote: R })
  }
  return out
}

/** Registro abitudini: unione delle spunte dei due lati. */
export function mergeLog(a: string, b: string): string {
  const la = parseLog(a), lb = parseLog(b)
  for (const [k, s] of Object.entries(lb.days)) {
    const t = la.days[k] || (la.days[k] = new Set())
    s.forEach((x) => t.add(x))
  }
  return serializeLog(la)
}

export const conflictPath = (path: string, d = new Date()) => {
  const p2 = (n: number) => String(n).padStart(2, '0')
  return path.replace(/\.md$/i, '') + ` (conflitto PC ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}.${p2(d.getMinutes())}).md`
}

/** Immagini citate da una nota (locandina nel frontmatter, ![[…]], ![](…)), come percorsi candidati. */
export function referencedAssets(path: string, text: string): string[] {
  const out = new Set<string>()
  const { fm, body } = parseFM(text)
  if (typeof fm.poster === 'string' && fm.poster && !/^https?:/.test(fm.poster)) out.add('60 Film, serie e anime/' + fm.poster.replace(/^\.?\//, ''))
  // foto delle ricette: percorso dal vault ("70 Ricette/_foto/x.jpg")
  if (typeof fm.foto === 'string' && fm.foto && !/^https?:/.test(fm.foto) && fm.foto.includes('/')) out.add(fm.foto.replace(/^\.?\//, ''))
  for (const m of body.matchAll(/!\[\[([^\]|#]+)/g)) if (IMG_EXT.test(m[1])) out.add(m[1].trim())
  for (const m of body.matchAll(/!\[[^\]]*\]\(<?([^)\s>]+)/g)) if (!/^https?:/i.test(m[1]) && IMG_EXT.test(m[1])) { try { out.add(decodeURI(m[1])) } catch { out.add(m[1]) } }
  return [...out]
}

export interface SyncReport { pulled: number; pushed: number; merged: number; conflicts: string[]; assets: number; at: number; error?: string }

export function createSync(local: Vault, sb: SupabaseClient, onChange: (r: SyncReport) => void) {
  let running = false, again = false
  const loadBase = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(BASE_KEY) || '{}') } catch { return {} } }
  const saveBase = (b: Record<string, string>) => localStorage.setItem(BASE_KEY, JSON.stringify(b))
  const knownAssets = new Set<string>()

  async function remoteAll() {
    const m = new Map<string, string | null>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('notes').select('path, content, deleted').order('path').range(from, from + 999)
      if (error) throw error
      for (const r of data as { path: string; content: string; deleted: boolean }[]) m.set(r.path, r.deleted ? null : r.content)
      if (!data || data.length < 1000) break
    }
    return m
  }

  async function upload(path: string) {
    if (knownAssets.has(path)) return false
    const { data } = await sb.from('assets').select('path').eq('path', path).maybeSingle()
    if (data) { knownAssets.add(path); return false }
    const real = (await local.exists(path)) ? path : await local.find?.(path.split('/').pop()!)
    if (!real) return false
    const u = await local.url(real)
    if (!u) return false
    const blob = await (await fetch(u)).blob()
    const key = await assetKey(path)
    const up = await sb.storage.from('vault').upload(key, blob, { upsert: true, contentType: blob.type || undefined })
    if (up.error) throw up.error
    const ins = await sb.from('assets').upsert({ path, key, size: blob.size })
    if (ins.error) throw ins.error
    knownAssets.add(path)
    return true
  }

  async function once(): Promise<SyncReport> {
    const rep: SyncReport = { pulled: 0, pushed: 0, merged: 0, conflicts: [], assets: 0, at: Date.now() }
    const files = await local.list()
    const L = new Map(files.filter((f) => /\.md$/i.test(f.path)).map((f) => [f.path, f.text]))
    const R = await remoteAll()
    const base = loadBase()
    const push = async (path: string, text: string | null) => {
      const { error } = await sb.from('notes').upsert({ path, content: text ?? '', deleted: text == null, updated_by: 'pc' })
      if (error) throw error
    }
    for (const s of plan(L, R, base)) {
      if (s.op === 'same') { s.h ? (base[s.path] = s.h) : delete base[s.path]; continue }
      if (s.op === 'pull') {
        if (s.text == null) {
          // cancellata online: la tolgo dal PC (serve l'app ≥ 2.0; prima la nota resta e non si ricarica)
          const ok = await local.remove?.(s.path).then(() => true, () => false)
          if (!ok) { base[s.path] = hash(L.get(s.path) ?? ''); continue }
          delete base[s.path]
        }
        else { await local.write(s.path, s.text); base[s.path] = hash(s.text) }
        rep.pulled++
      } else if (s.op === 'push') {
        await push(s.path, s.text)
        s.text == null ? delete base[s.path] : (base[s.path] = hash(s.text))
        rep.pushed++
        if (s.text) for (const a of referencedAssets(s.path, s.text)) if (await upload(a).catch(() => false)) rep.assets++
      } else if (s.op === 'merge') {
        await local.write(s.path, s.text)
        await push(s.path, s.text)
        base[s.path] = hash(s.text)
        rep.merged++
      } else {
        const cp = conflictPath(s.path)
        await local.write(cp, s.local)
        await push(cp, s.local)
        await local.write(s.path, s.remote!)
        base[s.path] = hash(s.remote!)
        base[cp] = hash(s.local)
        rep.conflicts.push(s.path)
      }
      saveBase(base)
    }
    saveBase(base)
    return rep
  }

  async function run() {
    if (running) { again = true; return }
    running = true
    try {
      do { again = false; onChange(await once()) } while (again)
    } catch (e) {
      onChange({ pulled: 0, pushed: 0, merged: 0, conflicts: [], assets: 0, at: Date.now(), error: String((e as Error)?.message || e) })
    } finally { running = false }
  }

  /** Prima volta: carica online tutte le immagini usate dalle note (le locandine dei film, ecc.). */
  async function uploadAllAssets(progress?: (done: number, total: number) => void) {
    const files = (await local.list()).filter((f) => /\.md$/i.test(f.path) && !SKIP.test(f.path))
    const all = [...new Set(files.flatMap((f) => referencedAssets(f.path, f.text)))]
    let n = 0
    for (const a of all) { await upload(a).catch((e) => console.warn(a, e)); progress?.(++n, all.length) }
    return all.length
  }

  return { run, uploadAllAssets }
}
