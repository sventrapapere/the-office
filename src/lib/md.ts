// Frontmatter + markdown "lite" — porting fedele della v1 (_dashboard/index.html).
export type FM = Record<string, string | boolean | string[]>

export const norm = (t: string) => String(t ?? '').replace(/\r\n?/g, '\n')
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function unq(v: string): string | boolean {
  v = v.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

export function parseFM(text: string): { fm: FM; body: string } {
  text = norm(text)
  if (!text.startsWith('---\n')) return { fm: {}, body: text }
  const end = text.indexOf('\n---', 4)
  if (end < 0) return { fm: {}, body: text }
  const raw = text.slice(4, end)
  const nl = text.indexOf('\n', end + 1)
  const body = nl < 0 ? '' : text.slice(nl + 1)
  const fm: FM = {}
  let key: string | null = null
  for (const line of raw.split('\n')) {
    let m: RegExpMatchArray | null
    if ((m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/))) {
      key = m[1]
      const v = m[2].trim()
      if (v === '') fm[key] = ''
      else if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[['))
        fm[key] = v.slice(1, -1).split(',').map((x) => String(unq(x))).filter((x) => x !== '')
      else fm[key] = unq(v)
    } else if (key && (m = line.match(/^\s+-\s+(.*)$/))) {
      if (!Array.isArray(fm[key])) fm[key] = []
      ;(fm[key] as string[]).push(String(unq(m[1])))
    }
  }
  return { fm, body }
}

/** Imposta (o aggiunge) una chiave semplice nel frontmatter senza toccare il resto del file. */
export function setFM(text: string, key: string, value: string | boolean | number | null): string {
  text = norm(text)
  const val = value === null ? '' : typeof value === 'string' && /[:#\[\]{}]|^\s|\s$/.test(value) ? JSON.stringify(value) : String(value)
  if (!text.startsWith('---\n')) return `---\n${key}: ${val}\n---\n\n` + text
  const end = text.indexOf('\n---', 4)
  const head = text.slice(4, end).split('\n')
  const i = head.findIndex((l) => new RegExp('^' + escRe(key) + ':').test(l))
  if (i >= 0) {
    // rimuove eventuali righe di lista sotto la chiave
    let j = i + 1
    while (j < head.length && /^\s+-\s+/.test(head[j])) j++
    head.splice(i, j - i, `${key}: ${val}`)
  } else head.push(`${key}: ${val}`)
  return '---\n' + head.join('\n') + text.slice(end)
}

export const fmStr = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v))

// ───────────── note e collegamenti ─────────────
export interface Note {
  path: string
  name: string
  title: string
  fm: FM
  body: string
  mtime: number
  top: string
}

export const noteDir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
export const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

export function toNote(path: string, text: string, mtime: number): Note {
  const { fm, body } = parseFM(text)
  const name = path.split('/').pop()!.replace(/\.md$/i, '')
  return { path, name, title: (typeof fm.title === 'string' && fm.title) || name, fm, body, mtime, top: path.includes('/') ? path.split('/')[0] : '' }
}

export function findNote(notes: Note[], t: string, from: string): Note | null {
  t = t.replace(/\.md$/i, '') + '.md'
  const low = t.toLowerCase()
  const dir = noteDir(from || '')
  const exact = notes.find((x) => x.path.toLowerCase() === low) || (dir && notes.find((x) => x.path.toLowerCase() === (dir + '/' + t).toLowerCase()))
  if (exact) return exact
  const name = low.split('/').pop()
  const c = notes.filter((x) => x.path.toLowerCase().endsWith('/' + low) || x.path.toLowerCase().split('/').pop() === name)
  if (!c.length) return null
  c.sort((a, b) => Number(noteDir(b.path) === dir) - Number(noteDir(a.path) === dir) || a.path.length - b.path.length)
  return c[0]
}

function splitLink(t: string) {
  t = t.replace(/\\\|/g, '|')
  let [target, alias] = t.split('|')
  let head = ''
  const h = target.indexOf('#')
  if (h >= 0) {
    head = target.slice(h + 1).replace(/^\^/, '')
    target = target.slice(0, h)
  }
  return { target: target.trim(), alias: alias && alias.trim(), head: head.trim() }
}

export interface RenderCtx {
  notes: Note[]
  from: string
  embedDepth?: number
}

function wikiHtml(t: string, c: RenderCtx) {
  const { target, alias, head } = splitLink(t)
  const label = alias || (target ? target.split('/').pop()!.replace(/\.md$/i, '') : '') + (head ? (target ? ' › ' : '') + head : '')
  if (!target) return `<a class="wl" data-note="${esc(c.from)}" data-head="${esc(head)}">${esc(label)}</a>`
  const n = findNote(c.notes, target, c.from)
  if (n) return `<a class="wl" href="#" data-note="${esc(n.path)}" data-head="${esc(head)}">${esc(label)}</a>`
  if (/\.[a-z0-9]{2,5}$/i.test(target)) return `<span class="tag">${esc(label)}</span>`
  return `<a class="wl missing" href="#" data-new="${esc(target)}" title="La nota non esiste ancora: clic per crearla">${esc(label)}</a>`
}

function embedHtml(t: string, c: RenderCtx) {
  const { target, alias } = splitLink(t)
  if (IMG_EXT.test(target)) {
    const w = alias && /^\d+(x\d+)?$/.test(alias) ? ` style="max-width:${alias.split('x')[0]}px"` : ''
    return `<img alt="${esc(target)}" data-asset="${esc(target)}" data-from="${esc(c.from)}"${w}>`
  }
  const n = (c.embedDepth || 0) < 1 && findNote(c.notes, target, c.from)
  if (n) return `<div class="embed-note">${mdRender(n.body, { ...c, from: n.path, embedDepth: (c.embedDepth || 0) + 1 }, -1e6)}</div>`
  return wikiHtml(t, c)
}

export function mdInline(s: string, c: RenderCtx): string {
  const keep: string[] = []
  const K = (h: string) => '\u0000' + (keep.push(h) - 1) + '\u0000'
  s = s.replace(/`([^`\n]+)`/g, (_, x) => K('<code>' + esc(x) + '</code>'))
  s = s.replace(/!\[\[([^\]\n]+)\]\]/g, (_, t) => K(embedHtml(t, c)))
  s = s.replace(/\[\[([^\]\n]+)\]\]/g, (_, t) => K(wikiHtml(t, c)))
  s = s.replace(/!\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g, (_, alt, u) =>
    K(/^https?:/i.test(u) ? `<img alt="${esc(alt)}" src="${esc(u)}" referrerpolicy="no-referrer">` : `<img alt="${esc(alt)}" data-asset="${esc(u)}" data-from="${esc(c.from)}">`),
  )
  s = s.replace(/\[([^\]\n]+)\]\((?:<([^>\n]+)>|([^)\s]+))\)/g, (_, t, u1, u2) => {
    const u = u1 || u2
    const inner = mdInline(t, c)
    if (/^file:/i.test(u)) return K(`<a href="${esc(encodeURI(u))}" class="filelink">${inner}</a>`)
    if (/^(https?|obsidian|mailto):/i.test(u)) return K(`<a href="${esc(u)}" target="_blank" rel="noopener">${inner}</a>`)
    let n: Note | null = null
    try { n = findNote(c.notes, decodeURI(u).replace(/#.*$/, ''), c.from) } catch { n = null }
    return K(n ? `<a class="wl" href="#" data-note="${esc(n.path)}">${inner}</a>` : inner)
  })
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, a, u) => a + K(`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`))
  s = esc(s)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^_\n]+?)__/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/~~([^~\n]+?)~~/g, '<s>$1</s>')
    .replace(/==([^=\n]+?)==/g, '<mark>$1</mark>')
    .replace(/(^|\s)#([\p{L}\p{N}_\/-]*\p{L}[\p{L}\p{N}_\/-]*)/gu, '$1<span class="tag">#$2</span>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i])
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const indentW = (s: string) => s.replace(/\t/g, '    ').length
function isBlockStart(l: string, next?: string) {
  return (
    /^\s*(```|~~~)/.test(l) || /^#{1,6}\s/.test(l) || /^\s*>/.test(l) || LIST_RE.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) ||
    (l.includes('|') && next != null && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(next))
  )
}

function renderList(lines: string[], start: number, c: RenderCtx, off: number) {
  const items: { ind: number; ord: boolean; num: number; text: string; line: number }[] = []
  let i = start
  while (i < lines.length) {
    const l = lines[i]
    const m = l.match(LIST_RE)
    if (m) { items.push({ ind: indentW(m[1]), ord: /\d/.test(m[2]), num: parseInt(m[2], 10), text: m[3], line: off + i }); i++; continue }
    if (!l.trim()) { if (i + 1 < lines.length && LIST_RE.test(lines[i + 1])) { i++; continue } break }
    if (/^\s+\S/.test(l) && items.length) { items[items.length - 1].text += '\n' + l.trim(); i++; continue }
    break
  }
  let html = ''
  const st: { ind: number; tag: string }[] = []
  for (const it of items) {
    while (st.length && it.ind < st[st.length - 1].ind) html += '</li></' + st.pop()!.tag + '>'
    const top = st[st.length - 1]
    if (top && it.ind === top.ind && (it.ord ? 'ol' : 'ul') !== top.tag) html += '</li></' + st.pop()!.tag + '>'
    const top2 = st[st.length - 1]
    if (!top2 || it.ind > top2.ind) {
      const tag = it.ord ? 'ol' : 'ul'
      st.push({ ind: it.ind, tag })
      html += '<' + tag + (it.ord && it.num !== 1 ? ` start="${it.num}"` : '') + '>'
    } else html += '</li>'
    const t = it.text.match(/^\[([ xX\/-])\]\s?([\s\S]*)$/)
    if (t) {
      const done = t[1] !== ' '
      html += `<li class="task${done ? ' done' : ''}"><input type="checkbox" aria-label="Segna" data-line="${it.line}"${done ? ' checked' : ''}${it.line < 0 ? ' disabled' : ''}><span>${mdInline(t[2], c).replace(/\n/g, '<br>')}</span>`
    } else html += '<li>' + mdInline(it.text, c).replace(/\n/g, '<br>')
  }
  while (st.length) html += '</li></' + st.pop()!.tag + '>'
  return { html, next: i }
}

export function mdRender(text: string, c: RenderCtx, off = 0): string {
  text = norm(text).replace(/%%[\s\S]*?%%/g, '')
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  let m: RegExpMatchArray | null
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) { i++; continue }
    if ((m = l.match(/^\s*(```|~~~)/))) {
      const f = m[1], buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(f)) { buf.push(lines[i]); i++ }
      i++
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>')
      continue
    }
    if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const lv = m[1].length
      out.push(`<h${lv} data-h="${esc(m[2].toLowerCase())}">${mdInline(m[2], c)}</h${lv}>`)
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    if (/^\s*>/.test(l)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*> ?/, '')); i++ }
      const cm = buf[0].match(/^\[!([\w-]+)\][+-]?\s*(.*)$/)
      if (cm) {
        const ty = cm[1].toLowerCase()
        out.push(`<div class="callout ${esc(ty)}"><div class="ct">${mdInline(cm[2] || ty[0].toUpperCase() + ty.slice(1), c)}</div>${mdRender(buf.slice(1).join('\n'), c, -1e6)}</div>`)
      } else out.push('<blockquote>' + mdRender(buf.join('\n'), c, -1e6) + '</blockquote>')
      continue
    }
    if (isBlockStart(l, lines[i + 1]) && l.includes('|') && !LIST_RE.test(l)) {
      const cells = (r: string) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((x) => mdInline(x.trim(), c))
      const head = cells(l)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      out.push('<div class="tbl"><table><thead><tr>' + head.map((x) => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((x) => '<td>' + x + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>')
      continue
    }
    if (LIST_RE.test(l)) { const r = renderList(lines, i, c, off); out.push(r.html); i = r.next; continue }
    const buf = [l]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { buf.push(lines[i]); i++ }
    out.push('<p>' + buf.map((x) => mdInline(x.trim(), c)).join('<br>') + '</p>')
  }
  return out.join('\n')
}

/** Inverte la casella alla riga `line` (contata dall'inizio del file). */
export function toggleTaskLine(raw: string, line: number): string {
  const lines = norm(raw).split('\n')
  const l = lines[line]
  if (l == null) return raw
  lines[line] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX\/-])(\])/, (_, a, x, b) => a + (x === ' ' ? 'x' : ' ') + b)
  return lines.join('\n')
}

export function mdSection(text: string, head: string, level = 2): string {
  const h = '#'.repeat(level) + ' '
  const lines = (text || '').split('\n')
  let on = false
  const out: string[] = []
  for (const l of lines) {
    if (l.startsWith(h) || (level !== 3 && /^#{1,2} /.test(l))) {
      if (on) break
      if (l.startsWith(h) && l.slice(h.length).toLowerCase().startsWith(head.toLowerCase())) { on = true; continue }
    }
    if (on) out.push(l)
  }
  return out.join('\n').replace(/\n-{3,}\s*$/, '').trim()
}

export function mdTable(text: string): string[][] {
  const rows = (text || '').split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim()))
  return rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''))
}

export function backlinks(notes: Note[], path: string): Note[] {
  const name = path.split('/').pop()!.replace(/\.md$/i, '')
  const re = new RegExp('\\[\\[([^\\]|#]*/)?' + escRe(name) + '(\\.md)?([#|][^\\]]*)?\\]\\]', 'i')
  return notes.filter((n) => n.path !== path && re.test(n.body)).sort(byTitle)
}

export const byTitle = (a: Note, b: Note) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' })

export function excerpt(body: string, n = 140): string {
  const t = norm(body)
    .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '')
    .split('\n')
    .filter((l) => !/^\s*(#|>|\||-{3,}|\*{3,}|_{3,}|!\[)/.test(l) && !/[├└│┌┐┘┬┴┼─]{1,}/.test(l))
    .join('\n')
    .replace(/^>.*$/gm, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~=|]/g, '')
    .replace(/^\s*[-+]\s+(\[.\]\s*)?/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
