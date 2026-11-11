import { create } from 'zustand'
import { toast } from 'sonner'
import type { Vault, SyncState } from './vault/types'
import type { SyncReport } from './vault/sync'
import { toNote, type Note, norm, setFM } from './lib/md'
import {
  CHECK_PATH, LOG_PATH, INBOX_DIR, parseChecklist, serializeChecklist, parseLog, serializeLog, defaultCheck, defaultLog, sec, todayKey, pad,
  type Doc, type Log, type Kind,
} from './lib/checklist'

export type SectionId = 'home' | 'note' | 'film' | 'libri' | 'ricette' | 'miniature' | 'giappone' | 'impostazioni'

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  homeCards: Record<string, boolean>
  pinned: SectionId[]
}

const SETTINGS_KEY = 'theoffice:settings'
const defaultSettings: Settings = {
  theme: 'dark',
  homeCards: { cattura: true, abitudini: true, dafare: true, costanza: true, spesa: true, recenti: true },
  pinned: ['note', 'film', 'ricette'],
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
  addItem(kind: Kind, title: string): Promise<void>
  toggleItem(kind: Kind, index: number): Promise<void>
  removeItem(kind: Kind, index: number): Promise<void>
  capture(text: string, kind: 'nota' | Kind): Promise<void>
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

const routeFromHash = (): SectionId => {
  const id = (location.hash || '').replace(/^#\/?/, '').split('/')[0]
  return (['home', 'note', 'film', 'libri', 'ricette', 'miniature', 'giappone', 'impostazioni'].includes(id) ? id : 'home') as SectionId
}

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
      if (location.hash !== '#/' + r) location.hash = '#/' + r
      set({ route: r, reader: null, stack: [] })
    },
    open(path, head) {
      const cur = get().reader
      set({ reader: { path, editing: false, head }, stack: cur && cur.path !== path ? [...get().stack, cur.path] : get().stack })
    },
    back() {
      const st = [...get().stack]
      const prev = st.pop()
      set(prev ? { reader: { path: prev, editing: false }, stack: st } : { reader: null, stack: [] })
    },
    closeReader() {
      set({ reader: null, stack: [] })
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

    addItem(kind, title) {
      const t = title.trim()
      if (!t) return Promise.resolve()
      return get().mutateCheck((d) => {
        sec(d, kind).items.push({ title: t, done: false, days: [], doneAt: null, note: [] })
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

    async capture(text, kind) {
      const t = text.trim()
      if (!t) return
      if (kind !== 'nota') return get().addItem(kind, t)
      const d = new Date()
      const stamp = `${todayKey()} ${pad(d.getHours())}.${pad(d.getMinutes())}`
      const first = t.split('\n')[0].replace(/[\\/:*?"<>|#^[\]]/g, '').slice(0, 60).trim() || 'Nota'
      let path = `${INBOX_DIR}/${stamp} — ${first}.md`
      const v = get().vault!
      if (await v.exists(path)) path = path.replace(/\.md$/, ` (${d.getSeconds()}).md`)
      const body = `---\ncreated: ${todayKey()}\nstatus: inbox\ntags: [inbox]\n---\n\n${norm(t)}\n`
      await get().write(path, body, { undoLabel: 'Salvata in Inbox' })
    },

    async setField(path, key, value, label) {
      const v = get().vault!
      const raw = await v.read(path)
      if (raw == null) return
      await get().write(path, setFM(raw, key, value), { undoLabel: label })
    },
  }
})

if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    const r = routeFromHash()
    if (useStore.getState().route !== r) useStore.setState({ route: r, reader: null, stack: [] })
  })

// ───────────── selettori ─────────────
export const inDir = (notes: Note[], dir: string) => notes.filter((n) => n.path.startsWith(dir + '/'))
export const daily = (d: Doc) => sec(d, 'daily').items
export const todos = (d: Doc) => sec(d, 'todo').items
export const spesa = (d: Doc) => sec(d, 'spesa').items
