/**
 * Guide di pittura del ricettario (`ricettario-pittura.md`), nel "Formato standard delle guide" (dal 2026-11-14):
 *   ## Nome — sottotitolo            (o ### se la guida sta sotto un gruppo, es. "## Troll")
 *   **Fonte:** … / **Aspetto:** … / **Oltre ai tuoi colori:** …
 *   ### Immagini di riferimento     (standard: finita da più lati + passaggi; vedi parseRefs)
 *   ### Mix da preparare            (tabella Nome | Ricetta | [Colore della fonte] | Dove)
 *   ### Prima di cominciare         (elenco)
 *   ### Fase 1 — Basi / ### Passaggi …
 *     **1. Titolo** · *zone*
 *     - **Colore:** … - **Diluizione:** … - **Pennello e tecnica:** … - **Come:** … - **Attenzione:** … - **Asciugatura:** …
 * Il parser è tollerante: quello che non riconosce finisce nelle note e si mostra come markdown.
 */

export interface Mix { name: string; recipe: string; where: string; source?: string }
export interface StepFields { colore?: string; diluizione?: string; pennello?: string; come?: string; attenzione?: string; asciugatura?: string }
export interface GuideStep {
  n: number
  title: string
  zone: string
  fields: StepFields
  /** Righe in più dentro il passaggio (elenchi non standard). */
  extra: string[]
  /** "→ *Basette …*": il passaggio rimanda a un'altra guida. */
  goto?: string
  phase: string
}
export interface Phase { title: string; steps: GuideStep[]; note: string }
export interface RefImg { url: string; caption: string; view?: string; steps: number[]; source?: { label: string; url: string }; note?: string }
export interface Refs { finished: RefImg[]; steps: RefImg[]; videos: { title: string; url: string; note: string }[]; missing: string[]; intro: string }
export interface Guide {
  head: string
  title: string
  sub: string
  level: number
  fonte: string
  aspetto: string
  oltre: string
  /** Paragrafi e avvisi in testa che non sono Fonte/Aspetto/Oltre. */
  intro: string
  mixes: Mix[]
  prima: string[]
  /** Altre tabelle utili prima dei passaggi (es. "Per personaggio"). */
  extras: { title: string; md: string }[]
  phases: Phase[]
  steps: GuideStep[]
  refs: Refs
}

const FIELD: Record<string, keyof StepFields> = {
  colore: 'colore', diluizione: 'diluizione', 'pennello e tecnica': 'pennello', pennello: 'pennello', come: 'come', attenzione: 'attenzione', asciugatura: 'asciugatura',
}
const SKIP = /^(formato standard|la tavolozza|tabella delle miscele)/i

const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim())
const isSep = (l: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(l)
const unbold = (s: string) => s.replace(/\*\*/g, '').trim()

interface Head { level: number; text: string; line: number }
function headings(lines: string[]): Head[] {
  const out: Head[] = []
  let fence = false
  lines.forEach((l, i) => {
    if (/^```/.test(l)) fence = !fence
    const m = !fence && l.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (m) out.push({ level: m[1].length, text: m[2], line: i })
  })
  return out
}
const isGuidePart = (t: string) => /^(mix da preparare|passaggi|fase\s+\d|prima di cominciare)/i.test(t)

/** Le guide del ricettario, nell'ordine del file. */
export function parseGuides(text: string): Guide[] {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n')
  const hs = headings(lines)
  const out: Guide[] = []
  hs.forEach((h, i) => {
    if (h.level < 2 || SKIP.test(h.text)) return
    let end = lines.length
    const kids: Head[] = []
    for (let j = i + 1; j < hs.length; j++) {
      if (hs[j].level <= h.level) { end = hs[j].line; break }
      if (hs[j].level === h.level + 1) kids.push(hs[j])
    }
    if (!kids.some((k) => isGuidePart(k.text))) return
    out.push(parseGuide(h, lines.slice(h.line + 1, end), kids.map((k) => ({ ...k, line: k.line - h.line - 1 }))))
  })
  return out
}

function parseGuide(h: Head, body: string[], kids: Head[]): Guide {
  const [title, ...rest] = h.text.split(/\s+—\s+/)
  const g: Guide = {
    head: h.text, title: title.trim(), sub: rest.join(' — ').trim(), level: h.level,
    fonte: '', aspetto: '', oltre: '', intro: '', mixes: [], prima: [], extras: [], phases: [], steps: [],
    refs: { finished: [], steps: [], videos: [], missing: [], intro: '' },
  }
  // testa: fino al primo sottotitolo
  const top = body.slice(0, kids[0]?.line ?? body.length)
  const intro: string[] = []
  for (const l of top) {
    const m = l.match(/^\*\*(Fonte(?: principale)?|Aspetto|Oltre ai tuoi colori):\*\*\s*(.*)$/i)
    if (m) {
      const k = m[1].toLowerCase()
      if (k.startsWith('fonte')) g.fonte = m[2]
      else if (k === 'aspetto') g.aspetto = m[2]
      else g.oltre = m[2]
    } else if (!/^-{3,}\s*$/.test(l)) intro.push(l)
  }
  g.intro = intro.join('\n').trim()

  kids.forEach((k, i) => {
    const sec = body.slice(k.line + 1, kids[i + 1]?.line ?? body.length).filter((l) => !/^-{3,}\s*$/.test(l))
    const t = k.text
    if (/^immagini di riferimento/i.test(t)) g.refs = parseRefs(sec.join('\n'))
    else if (/^mix da preparare/i.test(t)) g.mixes = parseMixes(sec)
    else if (/^prima di cominciare/i.test(t)) g.prima = sec.filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, ''))
    else {
      const ph = parsePhase(t, sec)
      if (ph.steps.length) { g.phases.push(ph); g.steps.push(...ph.steps) }
      else if (ph.note) g.extras.push({ title: t, md: ph.note })
    }
  })
  return g
}

function parseMixes(sec: string[]): Mix[] {
  const rows = sec.filter((l) => /^\s*\|/.test(l) && !isSep(l)).map(cells)
  if (rows.length < 2) return []
  const hd = rows[0].map((c) => c.toLowerCase())
  const col = (re: RegExp, d: number) => { const i = hd.findIndex((c) => re.test(c)); return i < 0 ? d : i }
  const iN = col(/nome/, 0), iR = col(/ricetta/, 1), iW = col(/dove/, rows[0].length - 1), iS = hd.findIndex((c) => /fonte/.test(c))
  return rows.slice(1).filter((r) => r[iN]).map((r) => ({ name: unbold(r[iN]), recipe: r[iR] || '', where: r[iW] || '', source: iS >= 0 ? r[iS] : undefined }))
}

const STEP_RE = /^\*\*(\d+)\.\s+(.+?)\*\*\s*(.*)$/
function parsePhase(title: string, sec: string[]): Phase {
  const steps: GuideStep[] = []
  const note: string[] = []
  let cur: GuideStep | null = null
  for (const l of sec) {
    const m = l.match(STEP_RE)
    if (m) {
      // "**6. Basetta** → *Basette "brughiera"* · **7. Vernice opaca**": più passaggi sulla stessa riga
      const parts = l.split(/\s+·\s+(?=\*\*\d+\.)/)
      for (const p of parts) {
        const mm = p.match(STEP_RE)
        if (!mm) continue
        const tail = mm[3].trim()
        const goto = tail.match(/^→\s*\*([^*]+)\*/)
        const zone = (tail.match(/·\s*\*([^*]+)\*/) || [])[1] || ''
        cur = { n: +mm[1], title: mm[2].replace(/:$/, '').trim(), zone, fields: {}, extra: [], phase: title, goto: goto ? goto[1].trim() : undefined }
        const opt = tail.match(/^\*\(([^)]+)\)\*/)
        if (opt) cur.zone = (cur.zone ? cur.zone + ' · ' : '') + opt[1]
        if (goto) { const after = tail.slice(goto[0].length).replace(/^[,.]\s*/, '').trim(); if (after) cur.extra.push(after) }
        steps.push(cur)
      }
      continue
    }
    const f = l.match(/^\s*[-*]\s+\*\*([^*:]+):\*\*\s*(.*)$/)
    if (cur && f && FIELD[f[1].toLowerCase()]) { cur.fields[FIELD[f[1].toLowerCase()]] = f[2].trim(); continue }
    if (cur && /^\s*[-*]\s+/.test(l)) { cur.extra.push(l.replace(/^\s*[-*]\s+/, '')); continue }
    if (!l.trim()) continue
    // testo libero: note della fase (prima del primo passaggio) o dopo l'ultimo
    note.push(l)
  }
  return { title, steps, note: note.join('\n').trim() }
}

/**
 * ### Immagini di riferimento
 * *testo introduttivo*
 * **Finita**
 * - ![testo](url) — davanti · [Fonte](pagina) · nota
 * - dietro: non trovata
 * **Passaggi**
 * - ![testo](url) — passaggi 2-3 · drybrush del metallo · [Fonte](pagina)
 * **Video**
 * - [Titolo](url) — 04:50 basi · 10:44 luci
 */
export function parseRefs(md: string): Refs {
  const r: Refs = { finished: [], steps: [], videos: [], missing: [], intro: '' }
  let group: 'f' | 's' | 'v' | null = null
  const intro: string[] = []
  for (const raw of md.split('\n')) {
    const l = raw.trim()
    const g = l.match(/^\*\*([^*]+)\*\*:?$/)
    if (g) { const t = g[1].toLowerCase(); group = /finit/.test(t) ? 'f' : /passagg/.test(t) ? 's' : /video/.test(t) ? 'v' : null; continue }
    if (!/^[-*]\s+/.test(l)) { if (l && !group) intro.push(l); continue }
    const item = l.replace(/^[-*]\s+/, '')
    const img = item.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*(?:—\s*(.*))?$/)
    if (img) {
      const parts = (img[3] || '').split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean)
      const ri: RefImg = { url: img[2], caption: img[1], steps: [] }
      const notes: string[] = []
      for (const p of parts) {
        const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        const st = p.match(/^passagg(?:io|i)\s+([\d\s,–-]+)/i)
        if (link) ri.source = { label: link[1], url: link[2] }
        else if (st) ri.steps = expandSteps(st[1])
        else if (group === 'f' && !ri.view) ri.view = p
        else notes.push(p)
      }
      if (notes.length) ri.note = notes.join(' · ')
      ;(group === 's' ? r.steps : r.finished).push(ri)
      continue
    }
    const vid = item.match(/^\[([^\]]+)\]\(([^)\s]+)\)\s*(?:—\s*(.*))?$/)
    if (vid && group === 'v') { r.videos.push({ title: vid[1], url: vid[2], note: vid[3] || '' }); continue }
    if (/non trovat/i.test(item)) r.missing.push(item.replace(/:?\s*non trovat[ao].*$/i, '').trim())
  }
  r.intro = intro.join(' ').replace(/^\*|\*$/g, '')
  return r
}

function expandSteps(s: string): number[] {
  const out: number[] = []
  for (const part of s.split(/\s*,\s*/)) {
    const m = part.match(/(\d+)\s*[–-]\s*(\d+)/)
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i)
    else if (/\d+/.test(part)) out.push(parseInt(part, 10))
  }
  return out
}

/** Secondi di attesa da "15 minuti", "1 ora, meglio una notte", "24 ore prima di…": il primo tempo citato. */
export function dryingSeconds(s = ''): number | null {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(minut[oi]|min\b|or[ae]|h\b)/i)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  return Math.round(/^or|^h/i.test(m[2]) ? v * 3600 : v * 60)
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** Trova la guida dal nome dello schema scritto nella tabella dei lotti (es. "Moria Goblin — Paint Pad"). */
export function findGuide(guides: Guide[], name: string): Guide | undefined {
  const n = norm(name)
  if (!n) return
  return guides.find((g) => norm(g.head) === n) || guides.find((g) => norm(g.head).startsWith(n) || n.startsWith(norm(g.head)))
    || guides.find((g) => norm(g.title) === norm(name.split(/\s+—\s+/)[0]))
}

/** Immagini dei passaggi che riguardano il passaggio n. */
export const stepImages = (g: Guide, n: number) => g.refs.steps.filter((r) => r.steps.includes(n))

/** Una sola stringa con i nomi dei mix citati nel testo (per evidenziarli). */
export const mixNamesIn = (g: Guide, text = '') => g.mixes.filter((m) => text.toLowerCase().includes(m.name.toLowerCase()))
