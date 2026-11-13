import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { Card, Chip, PageHead, Seg, Button, IconButton, Empty, Stat, inputCls } from '../ui/kit'
import { Stars, Tag } from '../ui/notes'
import { Modal, Sheet } from '../ui/Sheet'
import { useBackClose } from '../lib/backstack'
import { useTitleBar } from '../ui/TitleBar'
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
    <button type="button" onClick={onClick} aria-pressed={selected} className="group flex flex-col gap-1.5 text-left cursor-pointer min-w-0" title={note.title}>
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
function Detail({ note, all, onPick, phone }: { note: Note; all: Note[]; onPick: (p: string) => void; phone?: boolean }) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <span className={clsx('flex-none aspect-[2/3] rounded-[10px] overflow-hidden border border-ln bg-s2 relative flex items-center justify-center', phone ? 'w-[96px]' : 'w-[132px]')}>
          {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icon name="film" size={22} className="text-mu" />}
          {watching(note) && <span className="absolute top-2 left-2 h-5 px-1.5 rounded-md bg-ac text-[#1A0A02] text-[11px] font-semibold inline-flex items-center">in corso</span>}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
          <div className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{note.title}</div>
          {fm.titolo_originale && fmStr(fm.titolo_originale) !== note.title && <div className="text-[13px] text-mu">{fmStr(fm.titolo_originale)}</div>}
          <div className="text-[13px] text-mu">{[catOf(note), fm.anno].filter(Boolean).join(' · ')}</div>
          <div className="flex flex-wrap gap-1 mt-0.5">{list(fm.genere).slice(0, 4).map((g) => <Tag key={g} strong>{g}</Tag>)}</div>
          {seen(note) && <div className="mt-auto"><Stars value={num(fm.voto) ?? 0} onChange={(v) => patch({ voto: v || null }, v ? `Voto ${v}` : 'Voto tolto')} size={phone ? 28 : 22} /></div>}
        </div>
      </div>

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

      <dl className="m-0 flex flex-col">
        {pls.length > 0 && <Info k="Dove vederlo">{pls.join(', ')}</Info>}
        {fm.durata && <Info k={serie ? 'Stagioni' : 'Durata'}>{fmStr(fm.durata)}</Info>}
        {fm.anno && <Info k="Anno">{fmStr(fm.anno)}</Info>}
        {seen(note) && fm.visto_il && <Info k="Visto il">{new Date(fmStr(fm.visto_il)).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</Info>}
        {state === 'corso' && serie && <Info k="A che punto"><span className="num">S{season} · E{ep}</span></Info>}
      </dl>

      {eps.length > 1 && (
        <div>
          <div className="flex items-center justify-between text-[13px] text-mu mb-1.5"><span>Saga · {fmStr(fm.saga)}</span><span className="num">{eps.filter(seen).length}/{eps.length} visti</span></div>
          <div className="flex flex-col">
            {eps.map((x) => (
              <button key={x.path} type="button" onClick={() => onPick(x.path)} aria-current={x === note} className={clsx('flex items-center gap-2.5 min-h-[36px] px-2 rounded-md text-left text-[14px] cursor-pointer', x === note ? 'bg-s3 text-tx' : 'text-mu hov')}>
                <b className="num w-5 text-center">{fmStr(x.fm.saga_ordine) || '·'}</b><span className="flex-1 truncate">{x.title}</span>{seen(x) && <Icon name="check" size={13} stroke={2.6} className="text-ok" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {body.trim() && (
        <div>
          <div className={clsx('md text-[14px] text-mu', !more && 'line-clamp-4')} dangerouslySetInnerHTML={{ __html: html }} />
          <Button variant="link" onClick={() => setMore((v) => !v)}>{more ? 'Meno' : 'Altro'}</Button>
        </div>
      )}

      <div className="flex gap-2 sticky bottom-0 bg-s1 pt-2 pb-1">
        <Button size="lg" icon="note" onClick={() => st.open(note.path)} className="flex-1">Apri la nota</Button>
        {trailer && <Button size="lg" icon="external" onClick={() => ext(trailer)} className="flex-1">Trailer</Button>}
      </div>
    </div>
  )
}

/** PC: pannello a destra, la griglia resta usabile; ← → passano al titolo vicino, Esc chiude. */
function SidePanel({ note, nav, onClose, children }: { note: Note | null; nav: { i: number; n: number; go: (d: number) => void }; onClose: () => void; children: React.ReactNode }) {
  const tb = useTitleBar()
  useBackClose(!!note, onClose)
  useEffect(() => {
    if (!note) return
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') { e.preventDefault(); nav.go(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nav.go(-1) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [note, nav, onClose])
  return (
    <aside aria-label="Scheda del titolo" data-open={!!note} aria-hidden={!note}
      className={clsx('side-panel fixed right-3 bottom-3 z-30 w-[440px] max-w-[calc(100vw-120px)] flex flex-col rounded-2xl bg-s1 border border-ln shadow-[var(--shadow)]', tb ? 'top-[52px]' : 'top-3')}>
      <div className="flex items-center gap-1 h-[48px] pl-4 pr-2 border-b border-ln flex-none">
        <span className="num text-[12px] text-mu flex-1">{nav.n ? `${nav.i + 1} di ${nav.n}` : ''}</span>
        <IconButton icon="back" label="Titolo precedente (←)" size={32} onClick={() => nav.go(-1)} />
        <IconButton icon="chev" label="Titolo successivo (→)" size={32} onClick={() => nav.go(1)} />
        <IconButton icon="close" label="Chiudi (Esc)" size={32} onClick={onClose} />
      </div>
      <div key={note?.path} className="fade-in flex-1 overflow-y-auto px-5 pt-4">{children}</div>
    </aside>
  )
}

/** Telefono: scorrendo a destra/sinistra sulla scheda passo al titolo vicino. */
function useSwipe(go: (d: number) => void) {
  const start = useRef<[number, number] | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; start.current = [t.clientX, t.clientY] },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = start.current; start.current = null
      if (!s0) return
      const t = e.changedTouches[0], dx = t.clientX - s0[0], dy = t.clientY - s0[1]
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1)
    },
  }
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
  const nav = useMemo(() => ({ i: idx, n: order.length, go }), [idx, order.length, go])
  const close = useCallback(() => setOpenP(null), [])
  const swipe = useSwipe(go)
  const detail = cur && <Detail note={cur} all={all} onPick={setOpenP} phone={phone} />
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
  const grid = shown.length ? (
    <div key={show + cat + sort} className="fade-in grid gap-x-3.5 gap-y-5" style={{ gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {shown.map((n) => <Poster key={n.path} note={n} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
    </div>
  ) : <Empty icon="film">Nessun titolo con questi filtri.</Empty>
  const hero = picks[0]

  return (
    <div className={clsx('flex flex-col gap-4 transition-[padding] duration-200 ease-out', !phone && cur && 'min-[1100px]:pr-[452px]')}>
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
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            {picks.map((n) => <Poster key={n.path} note={n} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
          </div>
        </Card>
      )}
      {filters}
      {grid}
      {phone ? (
        <Sheet open={!!cur} onOpenChange={(o) => !o && setOpenP(null)} title={cur?.title || 'Scheda'} hideTitle><div key={cur?.path} className="fade-in" {...swipe}>{detail}</div></Sheet>
      ) : (
        <SidePanel note={cur ?? null} nav={nav} onClose={close}>{detail}</SidePanel>
      )}
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
