/**
 * Dati della sezione Giappone, tutti in note del vault:
 * - "10 Giappone/Voli/AAAA-MM-GG.md": una nota per ogni controllo del task programmato dei voli (frontmatter con i prezzi)
 * - "10 Giappone/Viaggio.md": parametri del budget e checklist "Pronti a partire"
 * - "10 Giappone/Giappone — Itinerario e cose da skippare.md": sezioni Da vedere / Da valutare / Da skippare
 * - "10 Giappone/Acquisti Giappone.md": sezione Da comprare
 * - "03 Conoscenza/Giapponese — Frasi di sopravvivenza.md": frasario (tabelle e elenchi "**it** = ja")
 */
import { fmStr, type Note } from './md'

export const JP = '10 Giappone'
export const FLIGHTS = JP + '/Voli/'
export const TRIP = JP + '/Viaggio.md'
export const ITIN = JP + '/Giappone — Itinerario e cose da skippare.md'
export const BUY = JP + '/Acquisti Giappone.md'
export const PHRASES = '03 Conoscenza/Giapponese — Frasi di sopravvivenza.md'

export const MONTHS = ['ott', 'nov', 'dic', 'gen', 'feb', 'mar', 'apr'] as const
export const PREFERRED = new Set(['ott', 'nov', 'feb', 'mar'])
export const SOGLIA_DIRETTO = 1100
export const SOGLIA_SCALO = 600

const num = (v: unknown) => { const x = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return isNaN(x) ? null : x }

export interface Check {
  path: string; date: string
  direct: number | null; directText: string; directLink: string
  stop: number | null; stopText: string; stopLink: string
  months: Record<string, number | null>; ana: string
}
export function checks(notes: Note[]): Check[] {
  return notes.filter((n) => n.path.startsWith(FLIGHTS) && /^\d{4}-\d{2}-\d{2}/.test(n.name)).map((n) => ({
    path: n.path, date: fmStr(n.fm.data) || n.name.slice(0, 10),
    direct: num(n.fm.diretto_totale), directText: fmStr(n.fm.diretto), directLink: fmStr(n.fm.diretto_link),
    stop: num(n.fm.scalo_totale), stopText: fmStr(n.fm.scalo), stopLink: fmStr(n.fm.scalo_link),
    months: Object.fromEntries(MONTHS.map((m) => [m, num(n.fm[m])])), ana: fmStr(n.fm.ana),
  })).sort((a, b) => b.date.localeCompare(a.date))
}

/** Prossima finestra preferita (ott–nov o feb–mar) rispetto a oggi: inizio, fine e giorni mancanti. */
export function nextWindow(today = new Date()): { label: string; months: string[]; start: Date; days: number; open: boolean } {
  const y = today.getFullYear()
  const wins = [y - 1, y, y + 1].flatMap((yy) => [
    { label: 'ottobre–novembre', months: ['ott', 'nov'], start: new Date(yy, 9, 1), end: new Date(yy, 11, 1) },
    { label: 'febbraio–marzo', months: ['feb', 'mar'], start: new Date(yy, 1, 1), end: new Date(yy, 3, 1) },
  ])
  // almeno 2 settimane di preavviso: una finestra già iniziata vale se ne restano almeno 3 settimane
  const t = +today
  const w = wins.sort((a, b) => +a.start - +b.start).find((w) => +w.end - t > 21 * 864e5)!
  const open = +w.start <= t
  return { label: w.label, months: w.months, start: w.start, days: open ? 0 : Math.ceil((+w.start - t) / 864e5), open }
}

export interface Budget { notti: number; volo: number | null; alloggio: number; trasporti: number; cibo: number; extra: number }
export const tripParams = (n?: Note) => ({
  alloggio: num(n?.fm.alloggio_notte) ?? 0,
  trasporti: num(n?.fm.trasporti_giorno) ?? 0,
  cibo: num(n?.fm.cibo_giorno) ?? 0,
  extra: num(n?.fm.extra) ?? 0,
  giorni: num(n?.fm.giorni) ?? 10,
  partenza: fmStr(n?.fm.partenza),
})
export const budgetTotal = (b: Budget) => (b.volo ?? 0) + b.notti * b.alloggio + (b.notti + 1) * (b.trasporti + b.cibo) + b.extra

// ───────── checklist e liste nelle note ─────────
export interface Item { line: string; done: boolean; name: string; note: string; city: string }
const strip = (s: string) => s.replace(/\*\*/g, '').replace(/\*([^*]+)\*/g, '$1').trim()

/** Voci (con o senza casella) della sezione "## head" di una nota. */
export function items(body: string, head: RegExp): Item[] {
  const m = body.split(/^(?=##\s)/m).find((s) => head.test(s.split('\n')[0].replace(/^##\s+/, '')))
  if (!m) return []
  return [...m.matchAll(/^[-*]\s+(?:\[( |x|X)\]\s+)?(.+)$/gm)].map((x) => {
    const raw = x[2].trim()
    const [a, ...b] = raw.split(/\s+—\s+/)
    const rest = b.join(' — ')
    const city = rest.match(/^([A-ZÀ-Ý][\wÀ-ÿ'’ -]{1,24})\s+·\s+/)?.[1] || ''
    return { line: x[0], done: !!x[1] && x[1] !== ' ', name: strip(a), note: strip(city ? rest.slice(city.length).replace(/^\s+·\s+/, '') : rest), city }
  }).filter((i) => i.name)
}

/** Spunta/despunta una voce: aggiunge la casella se non c'era. */
export function toggleItem(text: string, line: string): string {
  const i = text.indexOf(line)
  if (i < 0) return text
  let next: string
  if (/^[-*]\s+\[[xX]\]/.test(line)) next = line.replace(/\[[xX]\]/, '[ ]')
  else if (/^[-*]\s+\[ \]/.test(line)) next = line.replace('[ ]', '[x]')
  else next = line.replace(/^([-*])\s+/, '$1 [x] ')
  return text.slice(0, i) + next + text.slice(i + line.length)
}

/** Aggiunge una voce in fondo alla sezione "## head" (la crea se manca); toglie un eventuale "- " vuoto. */
export function addItem(text: string, head: string, line: string): string {
  const re = new RegExp('^##\\s+' + head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')
  const m = re.exec(text)
  if (!m) return text.replace(/\s*$/, '\n\n## ' + head + '\n\n- ' + line + '\n')
  const start = m.index + m[0].length
  const nextHead = text.slice(start).search(/^##?\s/m)
  const end = nextHead < 0 ? text.length : start + nextHead
  let sec = text.slice(start, end).replace(/^[-*]\s*$/m, '')
  sec = sec.replace(/\s*$/, '') + '\n- ' + line + '\n\n'
  return text.slice(0, start) + sec.replace(/^\n*/, '\n\n') + text.slice(end).replace(/^\n+/, '')
}

/** Sposta una voce da una sezione a un'altra. */
export function moveItem(text: string, line: string, head: string): string {
  const i = text.indexOf(line)
  if (i < 0) return text
  const without = text.slice(0, i) + text.slice(i + line.length).replace(/^\n/, '')
  return addItem(without, head, line.replace(/^[-*]\s+(?:\[[ xX]\]\s+)?/, ''))
}

// ───────── frasario ─────────
export interface Phrase { it: string; ja: string; note: string; topic: string }
export function phrases(body: string): Phrase[] {
  const out: Phrase[] = []
  for (const sec of body.split(/^(?=##\s)/m)) {
    const topic = sec.match(/^##\s+(.+)$/m)?.[1]?.trim() || ''
    if (/connessioni|da fare/i.test(topic)) continue
    for (const l of sec.split('\n')) {
      const t = l.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/)
      if (t && !/^(italiano|:?-+)/i.test(t[1]) && !/^:?-+:?$/.test(t[2])) out.push({ it: strip(t[1]), ja: strip(t[2]), note: strip(t[3]), topic })
      const li = l.match(/^[-*]\s+\*\*(.+?)\*\*\s*=\s*(.+)$/)
      if (li) out.push({ it: strip(li[1]), ja: strip(li[2]), note: '', topic })
    }
  }
  return out
}
export const phraseOfDay = (ps: Phrase[], d = new Date()) => (ps.length ? ps[Math.floor(+new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % ps.length] : null)
