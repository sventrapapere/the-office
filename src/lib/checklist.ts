// Checklist + registro abitudini — stesso formato dei file della v1 (vedi CLAUDE.md, protocollo dashboard).
import { norm } from './md'

export const CHECK_PATH = '04 Checklist/Checklist.md'
export const LOG_PATH = '04 Checklist/Registro abitudini.md'
export const INBOX_DIR = '00 Inbox'
export const DOW_L = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
export const DOW_S = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayKey = () => ymd(new Date())
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const fromKey = (k: string) => new Date(k + 'T00:00:00')

export type Kind = 'daily' | 'todo' | 'spesa'
export interface Item { title: string; done: boolean; days: number[]; doneAt: string | null; since?: string; due?: string; note: string[] }
export interface SecBlock { type: 'sec'; kind: Kind; heading: string; items: Item[]; tail: string[] }
export interface RawBlock { type: 'raw'; lines: string[] }
export type Block = SecBlock | RawBlock
export type Doc = Block[]

const KIND_BY_HEAD: Record<string, Kind> = { 'ogni giorno': 'daily', abitudini: 'daily', 'da fare': 'todo', 'lista della spesa': 'spesa', spesa: 'spesa' }
const HEAD: Record<Kind, string> = { daily: 'Ogni giorno', todo: 'Da fare', spesa: 'Lista della spesa' }

export function parseItem(s: string, checked: boolean): Item {
  const it: Item = { title: '', done: !!checked, days: [], doneAt: null, note: [] }
  s = s.replace(/\[giorni::\s*([^\]]*)\]/i, (_, g: string) => {
    it.days = g.split(/[,\s]+/).map((x) => DOW_S.indexOf(x.trim().toLowerCase().slice(0, 3))).filter((n) => n >= 0)
    return ''
  })
  s = s.replace(/\[dal::\s*(\d{4}-\d{2}-\d{2})\s*\]/i, (_, d) => { it.since = d; return '' })
  s = s.replace(/✅\s*(\d{4}-\d{2}-\d{2})/, (_, d) => { it.doneAt = d; return '' })
  // scadenza nel formato del plugin Tasks di Obsidian: 📅 AAAA-MM-GG
  s = s.replace(/📅\s*(\d{4}-\d{2}-\d{2})/, (_, d) => { it.due = d; return '' })
  it.title = s.trim()
  return it
}

export function parseChecklist(text: string): Doc {
  const lines = norm(text).split('\n')
  const blocks: Doc = []
  let cur: Block = { type: 'raw', lines: [] }
  blocks.push(cur)
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/)
    if (h) {
      const kind = KIND_BY_HEAD[h[1].toLowerCase()]
      cur = kind ? { type: 'sec', kind, heading: h[1], items: [], tail: [] } : { type: 'raw', lines: [line] }
      blocks.push(cur)
      continue
    }
    if (cur.type === 'raw') { cur.lines.push(line); continue }
    const m = line.match(/^[-*]\s+(?:\[([ xX])\]\s+)?(.*)$/)
    if (m) { cur.items.push(parseItem(m[2], m[1] ? m[1].toLowerCase() === 'x' : false)); continue }
    if (/^(\t| {2,})\S/.test(line) && cur.items.length) { cur.items[cur.items.length - 1].note.push(line.replace(/^(\t| {1,4})/, '')); continue }
    if (line.trim() === '') continue
    cur.tail.push(line)
  }
  for (const k of ['daily', 'todo', 'spesa'] as Kind[])
    if (!blocks.some((b) => b.type === 'sec' && b.kind === k)) blocks.push({ type: 'sec', kind: k, heading: HEAD[k], items: [], tail: [] })
  return blocks
}

export function serItem(it: Item, kind: Kind): string {
  let s = kind === 'daily' ? '- ' : '- [' + (it.done ? 'x' : ' ') + '] '
  s += it.title
  if (kind === 'daily' && it.days.length && it.days.length < 7) s += ' [giorni:: ' + [1, 2, 3, 4, 5, 6, 0].filter((d) => it.days.includes(d)).map((d) => DOW_S[d]).join(', ') + ']'
  if (kind === 'daily' && it.since) s += ' [dal:: ' + it.since + ']'
  if (kind === 'todo' && it.due) s += ' 📅 ' + it.due
  if (kind === 'todo' && it.done && it.doneAt) s += ' ✅ ' + it.doneAt
  const note = it.note.filter((l, i, a) => !(i === a.length - 1 && l.trim() === ''))
  return [s, ...note.map((l) => '    ' + l)].join('\n')
}

export function serializeChecklist(blocks: Doc): string {
  return (
    blocks
      .map((b) => (b.type === 'raw' ? b.lines.join('\n').replace(/\s+$/, '') : ['## ' + b.heading, ...b.items.map((i) => serItem(i, b.kind)), ...b.tail].join('\n')))
      .filter((p) => p !== '')
      .join('\n\n') + '\n'
  )
}

export const sec = (doc: Doc, kind: Kind) => doc.find((b): b is SecBlock => b.type === 'sec' && b.kind === kind)!

export const defaultCheck = () =>
  `---\ntitle: "Checklist"\ncreated: ${todayKey()}\nlang: it\nstatus: processed\ntags: [checklist, dashboard]\n---\n\n# Checklist\n\n## Ogni giorno\n\n## Da fare\n\n## Lista della spesa\n`

// ───────────── registro ─────────────
export interface Log { head: string[]; days: Record<string, Set<string>> }

export function parseLog(text: string): Log {
  const head: string[] = []
  const days: Record<string, Set<string>> = {}
  let seen = false
  for (const line of norm(text).split('\n')) {
    const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s*::\s*(.*)$/)
    if (m) {
      seen = true
      const set = days[m[1]] || (days[m[1]] = new Set())
      m[2].split(' · ').map((s) => s.trim()).filter(Boolean).forEach((t) => set.add(t))
    } else if (!seen) head.push(line)
  }
  return { head, days }
}

export function serializeLog(log: Log): string {
  const keys = Object.keys(log.days).filter((k) => log.days[k].size).sort().reverse()
  return log.head.join('\n').replace(/\s+$/, '') + '\n\n' + keys.map((k) => '- ' + k + ' :: ' + [...log.days[k]].join(' · ')).join('\n') + '\n'
}

export const defaultLog = () =>
  `---\ntitle: "Registro abitudini"\ncreated: ${todayKey()}\nlang: it\nstatus: processed\ntags: [checklist, dashboard, abitudini]\n---\n\n# Registro abitudini\n`

// ───────────── calcoli abitudini ─────────────
export const appliesOn = (it: Item, dow: number) => !it.days.length || it.days.includes(dow)
export const isDone = (log: Log, key: string, title: string) => !!log.days[key]?.has(title)

export function streak(log: Log, it: Item, today = new Date()): number {
  let n = 0
  let d = new Date(today)
  if (!isDone(log, ymd(d), it.title)) d = addDays(d, -1)
  for (let i = 0; i < 400; i++) {
    if (!appliesOn(it, d.getDay())) { d = addDays(d, -1); continue }
    if (isDone(log, ymd(d), it.title)) { n++; d = addDays(d, -1) } else break
  }
  return n
}

export function startKey(log: Log, it: Item): string {
  if (it.since) return it.since
  const ks = Object.keys(log.days).sort()
  return ks[0] || todayKey()
}

export function habitsOn(log: Log, daily: Item[], d: Date, filter = 'all'): Item[] {
  const k = ymd(d)
  return daily.filter((it) => appliesOn(it, d.getDay()) && startKey(log, it) <= k && (filter === 'all' || it.title === filter))
}

export function ratioOn(log: Log, daily: Item[], d: Date, filter = 'all'): number | null {
  const hs = habitsOn(log, daily, d, filter)
  if (!hs.length) return null
  const k = ymd(d)
  return hs.filter((h) => isDone(log, k, h.title)).length / hs.length
}

/** Serie di giorni consecutivi con TUTTE le abitudini previste fatte (oggi non interrompe). */
export function calStreaks(log: Log, daily: Item[], filter = 'all', now = new Date()): { cur: number; best: number } {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tk = ymd(today)
  const starts = daily.filter((it) => filter === 'all' || it.title === filter).map((it) => startKey(log, it)).sort()
  if (!starts.length) return { cur: 0, best: 0 }
  let best = 0, run = 0
  for (let d = fromKey(starts[0]); d <= today; d = addDays(d, 1)) {
    const r = ratioOn(log, daily, d, filter)
    if (r === null) continue
    if (r === 1) { run++; best = Math.max(best, run) } else if (ymd(d) !== tk) run = 0
  }
  return { cur: run, best }
}

/** Giorni consecutivi con almeno un'abitudine fatta (indicatore principale della Home). */
export function anyStreak(log: Log, now = new Date()): number {
  let d = new Date(now); d.setHours(0, 0, 0, 0)
  if (!log.days[ymd(d)]?.size) d = addDays(d, -1)
  let n = 0
  while (log.days[ymd(d)]?.size) { n++; d = addDays(d, -1) }
  return n
}

/** Record di giorni consecutivi con almeno un'abitudine fatta. */
export function anyBest(log: Log): number {
  const ks = Object.keys(log.days).filter((k) => log.days[k].size).sort()
  let best = 0, run = 0, prev = ''
  for (const k of ks) {
    run = prev && ymd(addDays(fromKey(prev), 1)) === k ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

export function dateLabel(d = new Date()): string {
  const s = DOW_L[d.getDay()]
  return s[0].toUpperCase() + s.slice(1) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]
}

/** Etichetta di una scadenza: "Oggi", "Domani", "Ieri", giorno della settimana entro 6 giorni, altrimenti "12 nov". */
export function dueLabel(due?: string, today = todayKey()): { text: string; tone: 'late' | 'today' | 'soon' | 'later' | 'none' } {
  if (!due) return { text: 'Senza data', tone: 'none' }
  const d = fromKey(due), t = fromKey(today)
  const diff = Math.round((+d - +t) / 864e5)
  if (diff < -1) return { text: 'scaduta ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3), tone: 'late' }
  if (diff === -1) return { text: 'Ieri', tone: 'late' }
  if (diff === 0) return { text: 'Oggi', tone: 'today' }
  if (diff === 1) return { text: 'Domani', tone: 'soon' }
  if (diff < 7) return { text: DOW_L[d.getDay()].replace(/^./, (c) => c.toUpperCase()), tone: 'soon' }
  return { text: d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3), tone: 'later' }
}
