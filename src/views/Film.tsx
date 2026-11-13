import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { Card, Chip, PageHead, Seg, Button, IconButton, Empty, Stat, inputCls } from '../ui/kit'
import { Stars, Tag } from '../ui/notes'
import { Modal } from '../ui/Sheet'
import { useBackClose } from '../lib/backstack'
import { Icon, type IconName } from '../ui/Icon'
import { useAssetUrl } from '../lib/assets'
import { fmStr, byTitle, mdRender, setFM, type Note } from '../lib/md'
import { todayKey } from '../lib/checklist'

const DIR = '60 Film, serie e anime/Titoli'
const ROOT = '60 Film, serie e anime'
const seen = (n: Note) => n.fm.visto === true
const watching = (n: Note) => !seen(n) && n.fm.in_corso === true
const catOf = (n: Note) => fmStr(n.fm.categoria).replace(/^"|"$/g, '') || 'Altro'
const num = (v: unknown) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x }
const list = (v: unknown) => (Array.isArray(v) ? v : v ? String(v).split(/\s*[/,]\s*/) : []).map((x) => String(x).trim()).filter(Boolean)
const platform = (n: Note) => list(n.fm.piattaforma)[0]?.replace(/\s*\(.*\)$/, '')
const sagaOrd = (n: Note) => num(n.fm.saga_ordine) ?? 1e6
const CAT_ICON: Record<string, IconName> = { Film: 'film', 'Serie TV': 'tv', Anime: 'giappone' }

/**
 * Proposte di oggi: 6 titoli da vedere, a turno tra le categorie. Delle saghe entra solo il primo
 * capitolo non visto. Il seme parte dalla data: stessa scelta per tutto il giorno; "Altre proposte" lo sposta.
 */
export function filmPicks(todo: Note[], shift: number, n = 6): Note[] {
  const first: Record<string, Note> = {}
  todo.forEach((x) => { if (!x.fm.saga) return; const k = String(x.fm.saga); if (!first[k] || sagaOrd(x) < sagaOrd(first[k])) first[k] = x })
  const pool = todo.filter((x) => !x.fm.saga || first[String(x.fm.saga)] === x)
  let seed = (+todayKey().replace(/-/g, '') + shift * 7919) % 233280
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  const mix = <T,>(a: T[], key: (t: T) => string) => a.slice().sort((x, y) => key(x).localeCompare(key(y), 'it')).map((x) => [rnd(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1])
  const byCat: Record<string, Note[]> = {}
  pool.forEach((x) => (byCat[catOf(x)] ||= []).push(x))
  const queues = mix(Object.keys(byCat), (c) => c).map((c) => mix(byCat[c], (x) => x.title))
  const out: Note[] = []
  let i = 0
  while (out.length < n && queues.some((q) => q.length)) { const q = queues[i++ % queues.length]; if (q.length) out.push(q.shift()!) }
  return out
}
const shiftKey = () => 'theoffice:filmShift:' + todayKey()

function usePoster(note: Note) {
  const vault = useStore((s) => s.vault)
  const p = typeof note.fm.poster === 'string' ? note.fm.poster : ''
  return useAssetUrl(vault, p ? (/^https?:/.test(p) ? p : ROOT + '/' + p.replace(/^\.?\//, '')) : null)
}

/** Locandina 2:3 con piattaforma in basso e voto in alto. */
function Poster({ note, onClick, selected }: { note: Note; onClick: () => void; selected?: boolean }) {
  const src = usePoster(note)
  const v = num(note.fm.voto)
  const pl = !seen(note) ? platform(note) : null
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group flex flex-col gap-1.5 w-full text-left cursor-pointer min-w-0" title={note.title}>
      <span className={clsx('relative aspect-[2/3] rounded-[10px] overflow-hidden border bg-s2 flex items-center justify-center transition-transform duration-150 ease-out group-hover:-translate-y-0.5', selected ? 'border-tx' : 'border-ln')}>
        {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" /> : <Icon name="film" size={20} className="text-mu" />}
        {seen(note) && v != null && <span className="num absolute top-2 right-2 h-5 px-1.5 rounded-md bg-bg/90 text-tx text-[11px] font-semibold inline-flex items-center gap-1"><Icon name="star" size={9} stroke={2.6} />{v}</span>}
        {watching(note) && <span className="absolute top-2 left-2 h-5 px-1.5 rounded-md bg-ac text-[#1A0A02] text-[11px] font-semibold inline-flex items-center">in corso</span>}
        {pl && <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] h-5 px-1.5 rounded-md bg-bg/90 text-tx text-[11px] font-semibold inline-flex items-center truncate">{pl}</span>}
      </span>
      <span className="text-[14px] leading-tight line-clamp-2">{note.title}</span>
      <span className="text-[12px] text-mu truncate">{[catOf(note), note.fm.anno].filter(Boolean).join(' · ')}</span>
    </button>
  )
}

/** Riga informativa della scheda. */
const Info = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex gap-3 min-h-[34px] items-baseline py-1.5 border-b border-ln last:border-b-0">
    <dt className="w-[92px] flex-none text-[13px] text-mu">{k}</dt><dd className="m-0 flex-1 min-w-0 text-[14px]">{children}</dd>
  </div>
)

/** Contatore − n + per stagione ed episodio. */
function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] text-mu mr-1">{label}</span>
      <IconButton icon="minus" label={label + ' meno uno'} size={30} onClick={() => onChange(Math.max(0, value - 1))} className="border border-ln" />
      <span className="num w-7 text-center font-semibold">{value}</span>
      <IconButton icon="plus" label={label + ' più uno'} size={30} onClick={() => onChange(value + 1)} className="border border-ln" />
    </div>
  )
}

/** Scheda del titolo: ogni modifica si salva subito (con "Annulla" nel messaggio). */
function Detail({ note, all, onPick, phone, layout = 'stack' }: { note: Note; all: Note[]; onPick: (p: string) => void; phone?: boolean; layout?: 'stack' | 'row' | 'page' }) {
  const vault = useStore((s) => s.vault)!
  const st = useStore.getState()
  const fm = note.fm
  const src = usePoster(note)
  const state = seen(note) ? 'visto' : watching(note) ? 'corso' : 'todo'
  const [comment, setComment] = useState(fmStr(fm.commento))
  const [more, setMore] = useState(false)
  useEffect(() => { setComment(fmStr(fm.commento)); setMore(false) }, [note.path]) // eslint-disable-line react-hooks/exhaustive-deps
  const patch = async (p: Record<string, unknown>, label: string) => {
    let t = (await vault.read(note.path)) ?? ''
    for (const [k, v] of Object.entries(p)) t = setFM(t, k, v as never)
    await st.write(note.path, t, { undoLabel: label + ': ' + note.title })
  }
  const setState = (v: 'todo' | 'corso' | 'visto') => {
    if (v === state) return
    patch({ visto: v === 'visto', in_corso: v === 'corso' ? true : null, visto_il: v === 'visto' ? todayKey() : null }, v === 'visto' ? 'Visto' : v === 'corso' ? 'In corso' : 'Da vedere')
  }
  const serie = catOf(note) === 'Serie TV' || /stag|\bep\b|episod/i.test(fmStr(fm.durata))
  const season = num(fm.stagione) ?? 1, ep = num(fm.episodio) ?? 0
  let body = note.body.replace(/^\s*#\s+[^\n]*\n/, '')
  const m = body.match(/(^|\n)##\s+Note personali\s*\n([\s\S]*)$/i)
  if (m) body = body.slice(0, m.index)
  const html = mdRender(body, { notes: all, from: note.path }, -1e6)
  const eps = fm.saga ? all.filter((x) => String(x.fm.saga || '') === String(fm.saga)).sort((a, b) => sagaOrd(a) - sagaOrd(b) || byTitle(a, b)) : []
  const trailer = typeof fm.trailer === 'string' && /^https?:/.test(fm.trailer) ? fm.trailer : null
  const ext = (u: string) => (vault.openExternal ? vault.openExternal(u) : open(u, '_blank'))
  const pls = list(fm.piattaforma)

  const poster = (
    <span className={clsx('flex-none aspect-[2/3] rounded-[10px] overflow-hidden border border-ln bg-s2 relative flex items-center justify-center', layout === 'page' ? 'w-[220px]' : phone ? 'w-[96px]' : 'w-[132px]')}>
      {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icon name="film" size={22} className="text-mu" />}
      {watching(note) && <span className="absolute top-2 left-2 h-5 px-1.5 rounded-md bg-ac text-[#1A0A02] text-[11px] font-semibold inline-flex items-center">in corso</span>}
    </span>
  )
  const head = (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
      <div className={clsx('font-semibold leading-tight tracking-[-0.01em]', layout === 'page' ? 'text-[30px]' : 'text-[22px]')}>{note.title}</div>
      {fm.titolo_originale && fmStr(fm.titolo_originale) !== note.title && <div className="text-[13px] text-mu">{fmStr(fm.titolo_originale)}</div>}
      <div className="text-[13px] text-mu">{[catOf(note), fm.anno].filter(Boolean).join(' · ')}</div>
      <div className="flex flex-wrap gap-1 mt-0.5">{list(fm.genere).slice(0, 4).map((g) => <Tag key={g} strong>{g}</Tag>)}</div>
      {seen(note) && <div className="mt-auto pt-1"><Stars value={num(fm.voto) ?? 0} onChange={(v) => patch({ voto: v || null }, v ? `Voto ${v}` : 'Voto tolto')} size={phone ? 28 : 22} /></div>}
    </div>
  )
  const controls = (
    <>
      <Seg label="Stato" value={state} onChange={setState} size="lg" full options={[{ id: 'todo', label: 'Da vedere' }, { id: 'corso', label: 'In corso' }, { id: 'visto', label: 'Visto' }]} />
      {state === 'corso' && serie && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 p-3 rounded-lg bg-s2">
          <Counter label="Stagione" value={season} onChange={(v) => patch({ stagione: v || null, episodio: v !== season ? 0 : ep }, 'Stagione ' + v)} />
          <Counter label="Episodio" value={ep} onChange={(v) => patch({ stagione: season, episodio: v }, 'Episodio ' + v)} />
          <Button variant="accent" icon="plus" onClick={() => patch({ stagione: season, episodio: ep + 1 }, `S${season} E${ep + 1}`)} className="ml-auto">1 episodio</Button>
        </div>
      )}
      {state === 'visto' && (
        <input value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment.trim() !== fmStr(fm.commento) && patch({ commento: comment.trim() || null }, 'Commento salvato')}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} placeholder="Due parole su com’era (si salva da solo)" aria-label="Commento" className={inputCls} />
      )}
    </>
  )
  const info = (
    <dl className="m-0 flex flex-col">
      {pls.length > 0 && <Info k="Dove vederlo">{pls.join(', ')}</Info>}
      {fm.durata && <Info k={serie ? 'Stagioni' : 'Durata'}>{fmStr(fm.durata)}</Info>}
      {seen(note) && fm.visto_il && <Info k="Visto il">{new Date(fmStr(fm.visto_il)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Info>}
      {state === 'corso' && serie && <Info k="A che punto"><span className="num">S{season} · E{ep}</span></Info>}
    </dl>
  )
  const saga = eps.length > 1 && (
    <div>
      <div className="flex items-center justify-between text-[13px] text-mu mb-1.5"><span>Saga · {fmStr(fm.saga)}</span><span className="num">{eps.filter(seen).length}/{eps.length} visti</span></div>
      <div className="flex flex-col">
        {eps.map((x) => (
          <button key={x.path} type="button" onClick={() => onPick(x.path)} aria-current={x === note} className={clsx('flex items-center gap-2.5 min-h-[34px] px-2 rounded-md text-left text-[14px] cursor-pointer', x === note ? 'bg-s3 text-tx' : 'text-mu hov')}>
            <b className="num w-5 text-center">{fmStr(x.fm.saga_ordine) || '·'}</b><span className="flex-1 truncate">{x.title}</span>{seen(x) && <Icon name="check" size={13} stroke={2.6} className="text-ok" />}
          </button>
        ))}
      </div>
    </div>
  )
  const desc = body.trim() && (
    <div>
      <div className={clsx('md text-[14px] text-mu', !more && (layout === 'page' ? '' : layout === 'row' ? 'line-clamp-6' : 'line-clamp-4'))} dangerouslySetInnerHTML={{ __html: html }} />
      {layout !== 'page' && <Button variant="link" onClick={() => setMore((v) => !v)}>{more ? 'Meno' : 'Altro'}</Button>}
    </div>
  )
  const actions = (
    <div className={clsx('flex gap-2', layout === 'stack' && 'sticky bottom-0 bg-s1 pt-2 pb-1')}>
      <Button size="lg" icon="note" onClick={() => st.open(note.path)} className="flex-1">Apri la nota</Button>
      {trailer && <Button size="lg" icon="external" onClick={() => ext(trailer)} className="flex-1">Trailer</Button>}
    </div>
  )

  // A: dentro la riga, accanto alla locandina (che resta nella griglia): due colonne
  if (layout === 'row') return (
    <div className="grid gap-x-8 gap-y-4 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] pr-8">
      <div className="flex flex-col gap-3.5 min-w-0">{head}{controls}{info}</div>
      <div className="flex flex-col gap-3.5 min-w-0">{desc}{saga}<div className="mt-auto">{actions}</div></div>
    </div>
  )
  // D: pagina intera
  if (layout === 'page') return (
    <div className="flex gap-8 items-start">
      <div className="flex flex-col gap-3 sticky top-[72px]">{poster}</div>
      <div className="flex-1 min-w-0 flex flex-col gap-4 max-w-[760px]">{head}{controls}{info}{saga}{desc}{actions}</div>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">{poster}{head}</div>
      {controls}{info}{saga}{desc}{actions}
    </div>
  )
}

/**
 * A — la scheda si apre nella riga della locandina: la riga diventa larga quanto la griglia, con la locandina
 * a sinistra e la scheda accanto; gli altri titoli di quella riga scendono a quella dopo.
 */
function ExpandGrid({ items, open, onOpen, minCol, cols: fixedCols, gap, render, phone, onHover }: {
  items: Note[]; open: string | null; onOpen: (p: string | null) => void; minCol: number; cols?: number; gap: number; render: (n: Note) => React.ReactNode; phone?: boolean
  onHover?: (n: Note, el: HTMLElement | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const cols = fixedCols ?? Math.max(1, Math.floor((w + gap) / (minCol + gap)))
  const cell = (w - gap * (cols - 1)) / cols
  const i = open ? items.findIndex((n) => n.path === open) : -1
  const rowStart = i < 0 ? -1 : i - (i % cols)
  const before = i < 0 ? items : items.slice(0, rowStart)
  const after = i < 0 ? [] : [...items.slice(rowStart, i), ...items.slice(i + 1)]
  const sel = i < 0 ? null : items[i]
  const selRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (sel) selRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [sel?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  const poster = (n: Note) => (
    <div key={n.path} className="min-w-0" onMouseEnter={(e) => onHover && open !== n.path && onHover(n, e.currentTarget)} onMouseLeave={() => onHover?.(n, null)}>
      <Poster note={n} onClick={() => onOpen(open === n.path ? null : n.path)} selected={open === n.path} />
    </div>
  )
  return (
    <div ref={ref} className="grid gap-x-3.5 gap-y-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `20px ${gap}px` }}>
      {before.map(poster)}
      {sel && (
        <div ref={selRef} key={'x' + sel.path} className="expand-in scroll-mt-20 col-span-full flex gap-6 p-3.5 pr-5 -mx-3.5 rounded-2xl bg-s1 border border-ln" style={{ ['--cell' as string]: cell + 'px' }}>
          {!phone && <div className="flex-none" style={{ width: cell }}>{poster(sel)}</div>}
          <div className="flex-1 min-w-0 relative pt-1">
            <IconButton icon="close" label="Chiudi (Esc)" size={32} onClick={() => onOpen(null)} className="absolute -top-1 -right-3 z-10 bg-s1" />
            {render(sel)}
          </div>
        </div>
      )}
      {after.map(poster)}
    </div>
  )
}

/** C — anteprima al passaggio del mouse: la locandina si ingrandisce in una schedina con le azioni rapide. */
function HoverCard({ note, rect, onOpen, onLeave }: { note: Note; rect: DOMRect; onOpen: () => void; onLeave: () => void }) {
  const src = usePoster(note)
  const st = useStore.getState()
  const W = Math.max(300, rect.width * 1.9)
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 12)
  const top = Math.max(12, rect.top - 24)
  const set = async (p: Record<string, unknown>, label: string) => {
    let t = (await st.vault!.read(note.path)) ?? ''
    for (const [k, v] of Object.entries(p)) t = setFM(t, k, v as never)
    await st.write(note.path, t, { undoLabel: label + ': ' + note.title })
  }
  return (
    <div onMouseLeave={onLeave} className="hover-in fixed z-40 rounded-2xl bg-s1 border border-ol shadow-[var(--shadow)] overflow-hidden" style={{ left, top, width: W }}>
      <button type="button" onClick={onOpen} className="relative block w-full aspect-[16/9] bg-s2 overflow-hidden cursor-pointer">
        {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icon name="film" size={26} className="text-mu absolute inset-0 m-auto" />}
        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-s1 to-transparent" />
      </button>
      <div className="p-4 pt-1 flex flex-col gap-2.5">
        <div className="text-[17px] font-semibold leading-tight">{note.title}</div>
        <div className="text-[12px] text-mu">{[catOf(note), note.fm.anno, platform(note), note.fm.durata && fmStr(note.fm.durata)].filter(Boolean).join(' · ')}</div>
        <div className="flex items-center gap-2">
          {seen(note)
            ? <Stars value={num(note.fm.voto) ?? 0} onChange={(v) => set({ voto: v || null }, 'Voto ' + (v || 'tolto'))} size={20} />
            : <Button variant="accent" icon="check" onClick={() => set({ visto: true, in_corso: null, visto_il: todayKey() }, 'Visto')}>Segna visto</Button>}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onOpen}>Scheda</Button>
        </div>
      </div>
    </div>
  )
}


/** Nuovo titolo: crea la nota con lo stesso formato delle altre schede. */
function AddTitle({ open, onClose, cats }: { open: boolean; onClose: () => void; cats: string[] }) {
  const st = useStore.getState()
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState(cats[0] || 'Film')
  const [year, setYear] = useState('')
  const [plat, setPlat] = useState('')
  const create = async () => {
    const t = title.trim()
    if (!t) return
    const safe = t.replace(/[\\/:*?"<>|#^[\]]/g, '')
    const text = `---\nvisto: false\ncategoria: ${cat}\nposter: \ntrailer: "https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' trailer').replace(/%20/g, '+')}"\nanno: ${year}\ngenere: []\ndurata: \nvoto: \ncommento: \npiattaforma: ${plat ? '"' + plat + '"' : ''}\ntags: [watchlist, ${cat === 'Serie TV' ? 'serie' : cat.toLowerCase()}]\n---\n\n# ${t}\n\n\n## Note personali\n\n- \n`
    onClose()
    setTitle(''); setYear(''); setPlat('')
    await st.createNote(`${DIR}/${safe}.md`, text, { label: 'Titolo aggiunto' })
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Aggiungi titolo">
      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo" aria-label="Titolo" />
        <Seg label="Categoria" value={cat} onChange={setCat} options={(cats.length ? cats : ['Film', 'Serie TV', 'Anime']).map((c) => ({ id: c, label: c }))} />
        <div className="flex gap-2">
          <input className={inputCls + ' w-28'} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Anno" aria-label="Anno" inputMode="numeric" />
          <input className={inputCls} value={plat} onChange={(e) => setPlat(e.target.value)} placeholder="Piattaforma (Netflix, Prime…)" aria-label="Piattaforma" />
        </div>
        <p className="m-0 text-[12px] text-mu">Trama, generi e locandina li può completare Claude: “completa la scheda di …”.</p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annulla</Button><Button variant="primary" type="submit" disabled={!title.trim()}>Aggiungi</Button></div>
      </form>
    </Modal>
  )
}

type Sort = 'recenti' | 'titolo' | 'anno' | 'voto'
export default function Film({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const all = useMemo(() => inDir(notes, DIR), [notes])
  const [show, setShow] = useState<'todo' | 'seen' | 'all'>('todo')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState<Sort>('recenti')
  const [openP, setOpenP] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [shift, setShift] = useState(() => +(localStorage.getItem(shiftKey()) || 0))
  const todo = all.filter((n) => !seen(n))
  const picks = useMemo(() => filmPicks(todo, shift), [todo.length, shift, notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = [...new Set(all.map(catOf))].sort((a, b) => a.localeCompare(b, 'it'))
  const sagas = all.some((n) => n.fm.saga)
  const inShow = (n: Note) => show === 'all' || (show === 'seen' ? seen(n) : !seen(n))
  const inCat = (n: Note) => cat === 'all' || (cat === '__saghe' ? !!n.fm.saga : catOf(n) === cat)
  const sagaKey = (n: Note) => (n.fm.saga ? String(n.fm.saga) : n.title) + '\u0000' + String(sagaOrd(n)).padStart(8, '0')
  const sorter: Record<Sort, (a: Note, b: Note) => number> = {
    recenti: (a, b) => b.mtime - a.mtime,
    titolo: (a, b) => sagaKey(a).localeCompare(sagaKey(b), 'it'),
    anno: (a, b) => (num(b.fm.anno) ?? 0) - (num(a.fm.anno) ?? 0),
    voto: (a, b) => (num(b.fm.voto) ?? 0) - (num(a.fm.voto) ?? 0) || byTitle(a, b),
  }
  const shown = all.filter((n) => inShow(n) && inCat(n)).sort((a, b) => (watching(b) ? 1 : 0) - (watching(a) ? 1 : 0) || sorter[sort](a, b))
  const votes = all.map((n) => num(n.fm.voto)).filter((x): x is number => x != null)
  const avg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1).replace('.', ',') : '–'
  const month = todayKey().slice(0, 7)
  const thisMonth = all.filter((n) => String(n.fm.visto_il || '').startsWith(month)).length
  const cur = openP ? all.find((n) => n.path === openP) : null
  const more = () => { const v = shift + 1; setShift(v); try { localStorage.setItem(shiftKey(), String(v)) } catch { /* */ } }
  const st = useStore.getState()
  const markSeen = async (n: Note) => {
    const t = (await st.vault!.read(n.path)) ?? ''
    await st.write(n.path, setFM(setFM(setFM(t, 'visto', true), 'in_corso', null), 'visto_il', todayKey()), { undoLabel: 'Segnato come visto: ' + n.title })
  }

  // titoli vicini: quelli della griglia (o delle proposte, se la scheda è stata aperta da lì)
  const order = cur && !shown.includes(cur) ? picks : shown
  const idx = cur ? order.indexOf(cur) : -1
  const go = useCallback((d: number) => { if (idx < 0 || !order.length) return; setOpenP(order[(idx + d + order.length) % order.length].path) }, [idx, order])
  const close = useCallback(() => setOpenP(null), [])
  const filters = (
    <div className="flex flex-wrap items-center gap-2.5">
      <Seg label="Stato" value={show} onChange={setShow} size={phone ? 'md' : 'lg'} options={[
        { id: 'todo', label: 'Da vedere', count: phone ? undefined : all.filter((n) => !seen(n)).length },
        { id: 'seen', label: 'Visti', count: phone ? undefined : all.filter(seen).length },
        { id: 'all', label: 'Tutti' },
      ]} />
      <div className="chips flex-1 min-w-0" role="group" aria-label="Categoria">
        {cats.map((c) => <Chip key={c} on={cat === c} icon={CAT_ICON[c]} onClick={() => setCat(cat === c ? 'all' : c)}>{c === 'Serie TV' ? 'Serie' : c}</Chip>)}
        {sagas && <Chip on={cat === '__saghe'} onClick={() => setCat(cat === '__saghe' ? 'all' : '__saghe')}>Saghe</Chip>}
      </div>
      {!phone && (
        <label className="relative inline-flex items-center text-[13px] text-mu">
          <span className="sr-only">Ordina</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="appearance-none h-8 pl-2 pr-7 bg-transparent text-mu cursor-pointer hover:text-tx">
            <option value="recenti">Ultimi aggiunti</option><option value="titolo">Titolo</option><option value="anno">Anno</option><option value="voto">Voto</option>
          </select>
          <Icon name="chevd" size={14} className="absolute right-1.5 pointer-events-none" />
        </label>
      )}
    </div>
  )
  // anteprima delle varianti della scheda (A riga, B finestra, C passaggio del mouse, D pagina)
  // scheda: si apre nella riga della locandina (A); sul PC, fermandosi su una locandina, schedina rapida (C)
  const [from, setFrom] = useState<'picks' | 'grid'>('grid')
  useBackClose(!!cur, close, cur?.path)
  useEffect(() => {
    if (!cur) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [cur, close, go])
  const [hover, setHover] = useState<{ n: Note; r: DOMRect } | null>(null)
  const hoverT = useRef(0)
  const onHover = (n: Note, el: HTMLElement | null) => { clearTimeout(hoverT.current); if (!el || phone) return; hoverT.current = window.setTimeout(() => setHover({ n, r: el.getBoundingClientRect() }), 450) }
  const rowDetail = (n: Note) => <Detail note={n} all={all} onPick={setOpenP} phone={phone} layout={phone ? 'stack' : 'row'} />
  const grid = shown.length ? (
    <div key={show + cat + sort} className="fade-in"><ExpandGrid items={shown} open={from === 'grid' ? openP : null} onOpen={(p) => { setFrom('grid'); setHover(null); setOpenP(p) }} minCol={150} gap={14} cols={phone ? 3 : undefined} render={rowDetail} phone={phone} onHover={onHover} /></div>
  ) : <Empty icon="film">Nessun titolo con questi filtri.</Empty>
  const hero = picks[0]

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('film').dot} title="Film e serie" sub={`${all.length} titoli · cartella ${ROOT}`}>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Aggiungi titolo</Button>
        </PageHead>
      )}
      {phone && hero && <HeroPick note={hero} onOpen={() => setOpenP(hero.path)} onSeen={() => markSeen(hero)} onMore={more} />}
      <div className="grid gap-3" style={{ gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))' }}>
        <Stat value={all.filter(seen).length} label="Visti" />
        <Stat value={todo.length} label="Da vedere" />
        <Stat value={avg} label="Voto medio" tone="ok" />
        {!phone && <Stat value={thisMonth} label="Visti questo mese" />}
      </div>
      {!phone && picks.length > 0 && (
        <Card title="Proposte di oggi" right={<><span className="text-[13px] text-mu hidden md:inline">Dai “da vedere”, cambiano ogni giorno</span><IconButton icon="sync" label="Altre proposte" size={30} onClick={more} /></>}>
          <ExpandGrid items={picks} open={from === 'picks' ? openP : null} onOpen={(p) => { setFrom('picks'); setHover(null); setOpenP(p) }} minCol={150} cols={6} gap={14} render={rowDetail} onHover={onHover} />
        </Card>
      )}
      {filters}
      {grid}
      {hover && !phone && <HoverCard note={all.find((x) => x.path === hover.n.path) ?? hover.n} rect={hover.r} onOpen={() => { setFrom(picks.includes(hover.n) && !shown.includes(hover.n) ? 'picks' : 'grid'); setOpenP(hover.n.path); setHover(null) }} onLeave={() => setHover(null)} />}
      <AddTitle open={adding} onClose={() => setAdding(false)} cats={cats} />
    </div>
  )
}

/** Telefono: la proposta del giorno in evidenza. */
function HeroPick({ note, onOpen, onSeen, onMore }: { note: Note; onOpen: () => void; onSeen: () => void; onMore: () => void }) {
  const src = usePoster(note)
  return (
    <div className="flex gap-4 p-3 rounded-xl bg-s1 border border-ln">
      <button type="button" onClick={onOpen} className="w-[92px] flex-none aspect-[2/3] rounded-lg overflow-hidden bg-s2 relative flex items-center justify-center cursor-pointer" aria-label={'Apri la scheda: ' + note.title}>
        {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icon name="film" size={20} className="text-mu" />}
      </button>
      <div className="flex-1 min-w-0 flex flex-col py-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ac">Proposta di oggi</span>
        <button type="button" onClick={onOpen} className="text-left text-[18px] font-semibold leading-tight mt-0.5 cursor-pointer">{note.title}</button>
        <span className="text-[13px] text-mu mt-0.5">{[catOf(note), note.fm.anno, platform(note)].filter(Boolean).join(' · ')}</span>
        <div className="flex gap-2 mt-auto pt-3">
          <Button variant="accent" onClick={onSeen}>Segna visto</Button>
          <IconButton icon="sync" label="Altra proposta" onClick={onMore} className="border border-ln" />
        </div>
      </div>
    </div>
  )
}
