import { create } from 'zustand'
import { toast } from 'sonner'
import type { Vault, SyncState } from './vault/types'
import type { SyncReport } from './vault/sync'
import { toNote, type Note, norm, setFM } from './lib/md'
import {
  CHECK_PATH, LOG_PATH, INBOX_DIR, parseChecklist, serializeChecklist, parseLog, serializeLog, defaultCheck, defaultLog, sec, todayKey, pad,
  type Doc, type Log, type Kind, type Item,
} from './lib/checklist'

export type SectionId = 'home' | 'note' | 'film' | 'libri' | 'ricette' | 'miniature' | 'giappone' | 'impostazioni'

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  homeCards: Record<string, boolean>
  pinned: SectionId[]
  /** Ordine delle sezioni nel menu (id) e sezioni nascoste. */
  order: SectionId[]
  hidden: SectionId[]
  sectionColors: boolean
  density: 'comoda' | 'compatta'
}

const SETTINGS_KEY = 'theoffice:settings'
const defaultSettings: Settings = {
  theme: 'dark',
  homeCards: { cattura: true, abitudini: true, dafare: true, costanza: true, spesa: true, recenti: true },
  pinned: ['note', 'film', 'ricette'],
  order: [],
  hidden: [],
  sectionColors: true,
  density: 'comoda',
}
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...defaultSettings, ...s, homeCards: { ...defaultSettings.homeCards, ...(s.homeCards || {}) } }
  } catch {
    return defaultSettings
  }
}

interface Reader {
  path: string
  editing: boolean
  head?: string
}

interface State {
  vault: Vault | null
  notes: Note[]
  check: Doc
  log: Log
  loaded: boolean
  error: string | null
  route: SectionId
  reader: Reader | null
  stack: string[]
  searchOpen: boolean
  captureOpen: boolean
  claudeOpen: boolean
  settings: Settings
  /** Sincronizzazione PC ↔ online (solo app desktop collegata a Supabase). */
  sync: { state: SyncState; last?: SyncReport } | null
  needsConnect: boolean
  setVault(v: Vault): Promise<void>
  refresh(): Promise<void>
  go(r: SectionId): void
  open(path: string, head?: string): void
  back(): void
  closeReader(): void
  setEditing(on: boolean): void
  set<K extends keyof State>(k: K, v: State[K]): void
  saveSettings(p: Partial<Settings>): void
  // scritture
  write(path: string, text: string, opts?: { undoLabel?: string; quiet?: boolean }): Promise<void>
  mutateCheck(fn: (d: Doc) => void, undoLabel?: string): Promise<void>
  toggleHabit(title: string, key?: string): Promise<void>
  addItem(kind: Kind, title: string, opts?: { days?: number[]; due?: string; note?: string[] }): Promise<void>
  updateItem(kind: Kind, index: number, patch: Partial<Item>): Promise<void>
  createNote(path: string, text: string, opts?: { edit?: boolean; label?: string }): Promise<string>
  moveNote(path: string, dir: string): Promise<void>
  deleteNote(path: string): Promise<void>
  toggleItem(kind: Kind, index: number): Promise<void>
  removeItem(kind: Kind, index: number): Promise<void>
  capture(text: string, kind: 'nota' | Kind, opts?: { dir?: string; due?: string }): Promise<void>
  setField(path: string, key: string, value: string | boolean | number | null, label?: string): Promise<void>
}

let busy: Promise<unknown> = Promise.resolve()
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = busy.then(fn, fn)
  busy = p.catch(() => {})
  return p
}

const fail = (e: unknown) => {
  console.error(e)
  toast.error('Non sono riuscito a salvare', { description: String((e as Error)?.message || e) })
}

/**
 * Navigazione nella cronologia: ogni schermata (sezione o nota aperta) ha il suo indirizzo
 *   #/film            sezione
 *   #/film/n/<nota>    nota aperta dalla sezione (con /<titoletto> opzionale)
 * così il tasto "indietro" del mouse, il gesto indietro di Android e il pulsante ‹ tornano
 * alla schermata precedente, una alla volta.
 */
const ROUTES = ['home', 'note', 'film', 'libri', 'ricette', 'miniature', 'giappone', 'impostazioni']
function parseHash(h = location.hash): { route: SectionId; path?: string; head?: string } {
  const parts = (h || '').replace(/^#\/?/, '').split('/')
  const route = (ROUTES.includes(parts[0]) ? parts[0] : 'home') as SectionId
  if (parts[1] === 'n' && parts[2]) {
    try { return { route, path: decodeURIComponent(parts[2]), head: parts[3] ? decodeURIComponent(parts[3]) : undefined } } catch { /* indirizzo rovinato */ }
  }
  return { route }
}
const hashFor = (route: SectionId, path?: string, head?: string) => '#/' + route + (path ? '/n/' + encodeURIComponent(path) + (head ? '/' + encodeURIComponent(head) : '') : '')
const routeFromHash = (): SectionId => parseHash().route
/** Profondità della voce corrente nella cronologia dell'app (salvata nella voce stessa, sopravvive al ricaricamento). */
let depth = typeof history !== 'undefined' ? (history.state?.d ?? 0) : 0
const trail: string[] = typeof location !== 'undefined' ? [location.hash || '#/home'] : []

export const useStore = create<State>((set, get) => {
  async function load() {
    const v = get().vault
    if (!v) return
    const files = await v.list()
    const notes = files.filter((f) => f.path.toLowerCase().endsWith('.md')).map((f) => toNote(f.path, f.text, f.mtime))
    const ck = files.find((f) => f.path === CHECK_PATH)?.text ?? (await v.read(CHECK_PATH)) ?? defaultCheck()
    const lg = files.find((f) => f.path === LOG_PATH)?.text ?? (await v.read(LOG_PATH)) ?? defaultLog()
    set({ notes, check: parseChecklist(ck), log: parseLog(lg), loaded: true, error: null })
  }

  /** Aggiorna l'indice in memoria dopo una scrittura, senza rileggere tutto. */
  function patchNote(path: string, text: string) {
    const notes = get().notes.filter((n) => n.path !== path)
    if (path.toLowerCase().endsWith('.md')) notes.push(toNote(path, text, Date.now()))
    const extra: Partial<State> = { notes }
    if (path === CHECK_PATH) extra.check = parseChecklist(text)
    if (path === LOG_PATH) extra.log = parseLog(text)
    set(extra as State)
  }

  async function writeRaw(path: string, text: string) {
    await get().vault!.write(path, text)
    patchNote(path, text)
  }

  return {
    vault: null,
    notes: [],
    check: parseChecklist(defaultCheck()),
    log: parseLog(defaultLog()),
    loaded: false,
    error: null,
    route: typeof location !== 'undefined' ? routeFromHash() : 'home',
    reader: null,
    stack: [],
    searchOpen: false,
    captureOpen: false,
    claudeOpen: false,
    settings: typeof localStorage !== 'undefined' ? loadSettings() : defaultSettings,
    sync: null,
    needsConnect: false,

    async setVault(v) {
      set({ vault: v })
      try {
        await load()
      } catch (e) {
        set({ error: String((e as Error)?.message || e), loaded: true })
      }
      v.watch?.(() => get().refresh())
    },
    async refresh() {
      try {
        await load()
      } catch (e) {
        console.warn(e)
      }
    },
    go(r) {
      set({ route: r, reader: null, stack: [] })
      const h = hashFor(r)
      if (location.hash !== h) location.hash = h
    },
    open(path, head) {
      const cur = get().reader
      set({ reader: { path, editing: false, head }, stack: cur && cur.path !== path ? [...get().stack, cur.path] : get().stack })
      const h = hashFor(get().route, path, head)
      if (location.hash !== h) location.hash = h
    },
    back() {
      // torna alla schermata precedente vera (stessa cosa del tasto indietro del mouse o di Android)
      if (depth > 0) { history.back(); return }
      const r = get().reader
      if (r) { set({ reader: null, stack: [] }); history.replaceState({ d: 0 }, '', hashFor(get().route)); trail[0] = location.hash }
    },
    closeReader() {
      set({ reader: null, stack: [] })
      history.replaceState({ d: depth }, '', hashFor(get().route))
    },
    setEditing(on) {
      const r = get().reader
      if (r) set({ reader: { ...r, editing: on } })
    },
    set(k, v) {
      set({ [k]: v } as Partial<State>)
    },
    saveSettings(p) {
      const s = { ...get().settings, ...p }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
      } catch {
        /* storage non disponibile */
      }
      set({ settings: s })
    },

    write(path, text, opts) {
      return serial(async () => {
        const v = get().vault!
        const before = await v.read(path)
        try {
          await writeRaw(path, text)
          if (opts?.undoLabel)
            toast(opts.undoLabel, {
              action: {
                label: 'Annulla',
                onClick: () => serial(async () => (before == null ? v.remove?.(path).then(() => get().refresh()) : writeRaw(path, before))),
              },
            })
        } catch (e) {
          fail(e)
        }
      })
    },

    mutateCheck(fn, undoLabel) {
      return serial(async () => {
        const v = get().vault!
        try {
          const before = (await v.read(CHECK_PATH)) ?? defaultCheck()
          const doc = parseChecklist(before)
          fn(doc)
          await writeRaw(CHECK_PATH, serializeChecklist(doc))
          if (undoLabel) toast(undoLabel, { action: { label: 'Annulla', onClick: () => serial(() => writeRaw(CHECK_PATH, before)) } })
        } catch (e) {
          fail(e)
        }
      })
    },

    toggleHabit(title, key = todayKey()) {
      return serial(async () => {
        const v = get().vault!
        try {
          const before = (await v.read(LOG_PATH)) ?? defaultLog()
          const log = parseLog(before)
          const s = log.days[key] || (log.days[key] = new Set())
          const on = !s.has(title)
          on ? s.add(title) : s.delete(title)
          await writeRaw(LOG_PATH, serializeLog(log))
          if (on) toast('Abitudine segnata', { description: title, action: { label: 'Annulla', onClick: () => serial(() => writeRaw(LOG_PATH, before)) } })
        } catch (e) {
          fail(e)
        }
      })
    },

    addItem(kind, title, opts) {
      const t = title.trim()
      if (!t) return Promise.resolve()
      return get().mutateCheck((d) => {
        const s = sec(d, kind)
        if (s.items.some((x) => x.title === t && !x.done)) return
        const it: Item = { title: t, done: false, days: opts?.days || [], doneAt: null, note: opts?.note || [], due: opts?.due, since: kind === 'daily' ? todayKey() : undefined }
        // come nella v1: le nuove cose da fare vanno prima di quelle già fatte
        const firstDone = kind === 'todo' ? s.items.findIndex((x) => x.done) : -1
        s.items.splice(firstDone < 0 ? s.items.length : firstDone, 0, it)
      })
    },

    async updateItem(kind, index, patch) {
      let old = ''
      await get().mutateCheck((d) => {
        const it = sec(d, kind).items[index]
        if (!it) return
        old = it.title
        Object.assign(it, patch)
      }, 'Modificato')
      // abitudine rinominata: aggiorno anche il registro, così la serie non si perde
      if (kind === 'daily' && patch.title && old && patch.title !== old)
        await serial(async () => {
          const v = get().vault!
          const log = parseLog((await v.read(LOG_PATH)) ?? defaultLog())
          for (const k in log.days) if (log.days[k].has(old)) { log.days[k].delete(old); log.days[k].add(patch.title!) }
          await writeRaw(LOG_PATH, serializeLog(log))
        })
    },

    async createNote(path, text, opts) {
      const v = get().vault!
      let p = path
      for (let i = 2; await v.exists(p); i++) p = path.replace(/\.md$/, ` ${i}.md`)
      await get().write(p, text, { undoLabel: opts?.label })
      get().open(p)
      if (opts?.edit) get().setEditing(true)
      return p
    },

    async moveNote(path, dir) {
      const v = get().vault!
      const name = path.split('/').pop()!
      let to = (dir ? dir + '/' : '') + name
      if (to === path) return
      for (let i = 2; await v.exists(to); i++) to = (dir ? dir + '/' : '') + name.replace(/\.md$/, ` ${i}.md`)
      const text = await v.read(path)
      if (text == null) return
      await serial(async () => {
        try {
          await v.write(to, text)
          try {
            await v.remove!(path)
          } catch {
            toast('Copiata in ' + (dir || 'radice'), { description: 'Per spostare davvero (e cancellare l’originale) aggiorna l’app: rilancia “Installa The Office.cmd”.' })
            return get().refresh()
          }
          await get().refresh()
          toast('Spostata in ' + (dir || 'radice'), { action: { label: 'Annulla', onClick: () => serial(async () => { await v.write(path, text); await v.remove!(to); await get().refresh() }) } })
          const r = get().reader
          if (r?.path === path) set({ reader: { ...r, path: to } })
        } catch (e) { fail(e) }
      })
    },

    async deleteNote(path) {
      const v = get().vault!
      const text = await v.read(path)
      await serial(async () => {
        try {
          await v.remove!(path)
          if (get().reader?.path === path) get().back()
          await get().refresh()
          toast('Nota eliminata', { description: path.split('/').pop()!.replace(/\.md$/, ''), action: text == null ? undefined : { label: 'Annulla', onClick: () => serial(async () => { await v.write(path, text); await get().refresh() }) } })
        } catch {
          toast.error('Non riesco a eliminare la nota', { description: 'Serve l’app aggiornata: rilancia “Installa The Office.cmd”, oppure eliminala da Obsidian.' })
        }
      })
    },

    toggleItem(kind, index) {
      let label = ''
      return get().mutateCheck(
        (d) => {
          const it = sec(d, kind).items[index]
          if (!it) return
          it.done = !it.done
          it.doneAt = it.done ? todayKey() : null
          label = it.done ? (kind === 'spesa' ? 'Preso: ' : 'Fatto: ') + it.title : ''
        },
        undefined,
      ).then(() => {
        if (label) toast(label, { action: { label: 'Annulla', onClick: () => get().mutateCheck((d) => { const it = sec(d, kind).items[index]; if (it) { it.done = false; it.doneAt = null } }) } })
      })
    },

    removeItem(kind, index) {
      let title = ''
      return get().mutateCheck((d) => {
        title = sec(d, kind).items[index]?.title || ''
        sec(d, kind).items.splice(index, 1)
      }, 'Eliminato')
    },

    async capture(text, kind, opts) {
      const t = text.trim()
      if (!t) return
      if (kind !== 'nota') { await get().addItem(kind, t.split('\n')[0], { due: opts?.due, note: t.split('\n').slice(1).filter(Boolean) }); toast(kind === 'todo' ? 'Aggiunta a Da fare' : 'Aggiunta alla spesa', { description: t.split('\n')[0] }); return }
      const d = new Date()
      const stamp = `${todayKey()} ${pad(d.getHours())}.${pad(d.getMinutes())}`
      const first = t.split('\n')[0].replace(/[\\/:*?"<>|#^[\]]/g, '').slice(0, 60).trim() || 'Nota'
      const dir = opts?.dir ?? INBOX_DIR
      let path = `${dir ? dir + '/' : ''}${stamp} — ${first}.md`
      const v = get().vault!
      if (await v.exists(path)) path = path.replace(/\.md$/, ` (${d.getSeconds()}).md`)
      const body = `---\ncreated: ${todayKey()}\nstatus: inbox\ntags: [inbox]\n---\n\n${norm(t)}\n`
      await get().write(path, body, { undoLabel: dir === INBOX_DIR ? 'Salvata in Inbox' : 'Salvata in ' + (dir || 'radice') })
    },

    async setField(path, key, value, label) {
      const v = get().vault!
      const raw = await v.read(path)
      if (raw == null) return
      await get().write(path, setFM(raw, key, value), { undoLabel: label })
    },
  }
})

/** Applica l'indirizzo corrente allo stato (anche quando si torna indietro o avanti nella cronologia). */
function applyHash() {
  const h = location.hash || '#/home'
  if (typeof history.state?.d === 'number') depth = history.state.d
  else { depth += 1; history.replaceState({ d: depth }, '') }
  if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop()
  else if (trail[trail.length - 1] !== h) trail.push(h)
  const { route, path, head } = parseHash(h)
  const st = useStore.getState()
  const stack = trail.slice(0, -1).map((x) => parseHash(x).path).filter((x): x is string => !!x)
  if (path) {
    if (st.route !== route || st.reader?.path !== path || st.reader?.head !== head) useStore.setState({ route, reader: { path, editing: false, head }, stack })
  } else if (st.route !== route || st.reader) useStore.setState({ route, reader: null, stack: [] })
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', applyHash)
  // all'avvio: se l'indirizzo punta a una nota, la riapro
  queueMicrotask(() => { const { path } = parseHash(); if (path) applyHash() })
}

// ───────────── selettori ─────────────
export const inDir = (notes: Note[], dir: string) => notes.filter((n) => n.path.startsWith(dir + '/'))
export const daily = (d: Doc) => sec(d, 'daily').items
export const todos = (d: Doc) => sec(d, 'todo').items
export const spesa = (d: Doc) => sec(d, 'spesa').items
