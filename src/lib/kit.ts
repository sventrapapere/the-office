/**
 * Lettura e scrittura dei file del Kit MESBG (fonte unica, condivisa con l'agente del progetto):
 * - lavorazione.md: "Il punto in una riga", §1 "Avanzamento dei lotti" (tabella), §5 "Schemi scelti", §6 "Prossimi passi"
 * - inventario.md: "Quadro in poche righe", §5 "Lista dei desideri", §6 "Da chiarire"
 * - partite.md: una riga per partita
 * Le modifiche toccano solo la riga o la tabella interessata: il resto del file resta com'è.
 */

export const KIT = '55 Miniature/Kit MESBG'
export const LAV = KIT + '/lavorazione.md'
export const INV = KIT + '/inventario.md'
export const RIC = KIT + '/ricettario-pittura.md'
export const GAMES = KIT + '/partite.md'

export const STAGES = ['Da montare', 'Montati', 'Con primer', 'In pittura', 'Finiti'] as const
export interface Lot { lotto: string; pezzi: number; schema: string; fasi: number[]; passo: number | null; agg: string }

const strip = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim())
const isSep = (l: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(l)

/** Testo fra un titolo (di qualunque livello) e il titolo successivo di livello uguale o superiore. */
function block(text: string, head: RegExp): { start: number; end: number } | null {
  const lines = text.split('\n')
  let off = 0, start = -1, level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/)
    if (m) {
      if (start >= 0 && m[1].length <= level) return { start, end: off }
      if (start < 0 && head.test(m[2])) { start = off + lines[i].length + 1; level = m[1].length }
    }
    off += lines[i].length + 1
  }
  return start >= 0 ? { start, end: text.length } : null
}
const section = (text: string, head: RegExp) => { const b = block(text, head); return b ? text.slice(b.start, b.end) : '' }

// ───────── lavorazione ─────────
export const punto = (lav: string) => section(lav, /^Il punto/i).split('\n').map((l) => l.trim()).filter((l) => l && !/^-{3,}$/.test(l)).join(' ')

export function lots(lav: string): Lot[] {
  const sec = section(lav, /^Avanzamento dei lotti/i)
  const rows = sec.split('\n').filter((l) => /^\s*\|/.test(l) && !isSep(l)).slice(1)
  return rows.map(cells).filter((r) => r[0]).map((r) => ({
    lotto: strip(r[0]), pezzi: parseInt(r[1], 10) || 0, schema: strip(r[2] || '').replace(/^[—–-]$/, ''),
    fasi: [3, 4, 5, 6, 7].map((i) => parseInt(r[i], 10) || 0),
    passo: parseInt(r[8], 10) || null, agg: strip(r[9] || ''),
  }))
}

/** Riscrive una riga della tabella dei lotti (trovata per nome del lotto). */
export function setLot(lav: string, lotto: string, next: Lot): string {
  const b = block(lav, /^Avanzamento dei lotti/i)
  if (!b) return lav
  const sec = lav.slice(b.start, b.end)
  const row = `| ${next.lotto} | ${next.pezzi} | ${next.schema || '—'} | ${next.fasi.join(' | ')} | ${next.passo ?? '—'} | ${next.agg} |`
  const out = sec.split('\n').map((l) => (/^\s*\|/.test(l) && !isSep(l) && strip(cells(l)[0]) === lotto ? row : l)).join('\n')
  return lav.slice(0, b.start) + out + lav.slice(b.end)
}

export interface Scheme { cosa: string; schema: string; fonte: string; manca: string }
export const schemes = (lav: string): Scheme[] =>
  section(lav, /^Schemi scelti/i).split('\n').filter((l) => /^\s*\|/.test(l) && !isSep(l)).slice(1).map(cells)
    .map((r) => ({ cosa: strip(r[0] || ''), schema: strip(r[1] || ''), fonte: strip(r[2] || ''), manca: strip(r[3] || '') }))
    .filter((s) => s.cosa && !/nessuno schema/i.test(s.cosa))

export interface Step { n: number; text: string; done: boolean }
export const nextSteps = (lav: string): Step[] =>
  [...section(lav, /^6\.\s*Prossimi passi/i).matchAll(/^(\d+)\.\s+(.+)$/gm)].map((m) => {
    const done = /^~~/.test(m[2])
    return { n: +m[1], text: m[2].replace(/~~([^~]+)~~/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/\*\*/g, ''), done }
  })

// ───────── inventario ─────────
export const quadro = (inv: string): [string, string][] =>
  section(inv, /^Quadro in poche righe/i).split('\n').filter((l) => /^\s*\|/.test(l) && !isSep(l)).map(cells)
    .filter((r) => strip(r[0] || '')).map((r) => [strip(r[0]), strip(r[1] || '')])

export const wishes = (inv: string) =>
  [...section(inv, /^Lista dei desideri/i).matchAll(/^[-*]\s+(?!\[x\])(?:\[ \]\s+)?(.+)$/gm)].map((m) => {
    const [a, ...b] = m[1].split(/\s+—\s+/)
    return { line: m[0], name: strip(a), note: strip(b.join(' — ')) }
  })

export function addWish(inv: string, line: string): string {
  const b = block(inv, /^Lista dei desideri/i)
  if (!b) return inv.replace(/\s*$/, '\n\n### Lista dei desideri\n\n- ' + line + '\n')
  const sec = inv.slice(b.start, b.end)
  const body = sec.replace(/\s*$/, '')
  return inv.slice(0, b.start) + body + '\n- ' + line + '\n' + sec.slice(body.length).replace(/^\n*/, '\n') + inv.slice(b.end)
}
export function removeWish(inv: string, rawLine: string): string {
  const b = block(inv, /^Lista dei desideri/i)
  if (!b) return inv
  const sec = inv.slice(b.start, b.end).split('\n')
  const i = sec.indexOf(rawLine)
  if (i < 0) return inv
  sec.splice(i, 1)
  return inv.slice(0, b.start) + sec.join('\n') + inv.slice(b.end)
}

export const questions = (inv: string) =>
  [...section(inv, /^6\.\s*Da chiarire/i).matchAll(/^-\s+\[( |x|X)\]\s+(.+)$/gm)].map((m) => ({ line: m[0], done: m[1] !== ' ', text: strip(m[2]) }))

export function toggleQuestion(inv: string, rawLine: string, today: string): string {
  const done = /^-\s+\[[xX]\]/.test(rawLine)
  const next = done ? rawLine.replace(/^-\s+\[[xX]\]/, '- [ ]').replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '') : rawLine.replace(/^-\s+\[ \]/, '- [x]') + ` (${today})`
  const i = inv.indexOf(rawLine)
  return i < 0 ? inv : inv.slice(0, i) + next + inv.slice(i + rawLine.length)
}

// ───────── partite ─────────
export interface Game { line: string; date: string; scen: string; vs: string; res: string; note: string }
export const games = (text: string): Game[] =>
  [...text.matchAll(/^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.*)$/gm)].map((m) => {
    const p = m[2].split(' · ')
    return { line: m[0], date: m[1], scen: p[0] || '', vs: (p[1] || '').replace(/^contro\s+/, ''), res: p[2] || '', note: p.slice(3).join(' · ') }
  }).sort((a, b) => b.date.localeCompare(a.date))

/** Aggiunge la partita in cima al registro (le più recenti prima). */
export function addGame(text: string, g: Omit<Game, 'line'>): string {
  const line = `- ${g.date} · ${g.scen || 'Partita'} · contro ${g.vs || '?'} · ${g.res}${g.note ? ' · ' + g.note : ''}`
  const i = text.search(/^## Registro\s*$/m)
  if (i < 0) return text.replace(/\s*$/, '\n') + line + '\n'
  const after = text.indexOf('\n', i) + 1
  return text.slice(0, after) + '\n' + line + '\n' + text.slice(after).replace(/^\n+/, '')
}

/** Registra uno schema scelto in §5 "Schemi scelti" (sostituisce la riga segnaposto, o aggiorna quella dello stesso «Cosa»). */
export function addScheme(lav: string, s: Scheme): string {
  const b = block(lav, /^Schemi scelti/i)
  if (!b) return lav
  const row = `| ${s.cosa} | ${s.schema} | ${s.fonte} | ${s.manca} |`
  const lines = lav.slice(b.start, b.end).split('\n')
  let done = false
  const out = lines.map((l) => {
    if (done || !/^\s*\|/.test(l) || isSep(l)) return l
    const c = cells(l)
    if (/nessuno schema/i.test(c[0]) || strip(c[0]) === s.cosa) { done = true; return row }
    return l
  })
  if (!done) {
    let last = -1
    out.forEach((l, i) => { if (/^\s*\|/.test(l)) last = i })
    out.splice(last + 1, 0, row)
  }
  return lav.slice(0, b.start) + out.join('\n') + lav.slice(b.end)
}
