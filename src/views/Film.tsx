import { useMemo, useState, useEffect } from 'react'
import clsx from 'clsx'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { Card, Chip, PageHead, Seg, Button, IconButton, Empty, Stat, inputCls } from '../ui/kit'
import { Stars, Tag } from '../ui/notes'
import { Modal, Sheet } from '../ui/Sheet'
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

/** Scheda del titolo: stato, voto, commento, saga. Le modifiche si salvano insieme con "Salva". */
function Detail({ note, all, onPick, onClose, phone }: { note: Note; all: Note[]; onPick: (p: string) => void; onClose: () => void; phone?: boolean }) {
  const vault = useStore((s) => s.vault)!
  const st = useStore.getState()
  const fm = note.fm
  const src = usePoster(note)
  const state0 = seen(note) ? 'visto' : watching(note) ? 'corso' : 'todo'
  const [state, setState] = useState<'todo' | 'corso' | 'visto'>(state0)
  const [vote, setVote] = useState<number>(num(fm.voto) ?? 0)
  const [comment, setComment] = useState(fmStr(fm.commento))
  useEffect(() => { setState(state0); setVote(num(fm.voto) ?? 0); setComment(fmStr(fm.commento)) }, [note.path, note.mtime]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = state !== state0 || vote !== (num(fm.voto) ?? 0) || comment !== fmStr(fm.commento)
  const save = async () => {
    let t = (await vault.read(note.path)) ?? ''
    t = setFM(t, 'visto', state === 'visto')
    t = setFM(t, 'in_corso', state === 'corso' ? true : null)
    if (state === 'visto' && !seen(note)) t = setFM(t, 'visto_il', todayKey())
    if (state !== 'visto') t = setFM(t, 'visto_il', null)
    t = setFM(t, 'voto', vote || null)
    t = setFM(t, 'commento', comment.trim() || null)
    await st.write(note.path, t, { undoLabel: state === 'visto' && !seen(note) ? 'Segnato come visto' : 'Scheda salvata' })
    onClose()
  }
  let body = note.body.replace(/^\s*#\s+[^\n]*\n/, '')
  const m = body.match(/(^|\n)##\s+Note personali\s*\n([\s\S]*)$/i)
  if (m) body = body.slice(0, m.index)
  const html = mdRender(body, { notes: all, from: note.path }, -1e6)
  const eps = fm.saga ? all.filter((x) => String(x.fm.saga || '') === String(fm.saga)).sort((a, b) => sagaOrd(a) - sagaOrd(b) || byTitle(a, b)) : []
  const trailer = typeof fm.trailer === 'string' && /^https?:/.test(fm.trailer) ? fm.trailer : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <span className="w-[96px] flex-none aspect-[2/3] rounded-[10px] overflow-hidden border border-ln bg-s2 relative flex items-center justify-center">
          {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icon name="film" size={20} className="text-mu" />}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="text-[22px] font-semibold leading-tight">{note.title}</div>
          {fm.titolo_originale && fmStr(fm.titolo_originale) !== note.title && <div className="text-[13px] text-mu">{fmStr(fm.titolo_originale)}</div>}
          <div className="text-[13px] text-mu">{[catOf(note), fm.anno, platform(note), fm.durata && fmStr(fm.durata)].filter(Boolean).join(' · ')}</div>
          <div className="flex flex-wrap gap-1">{list(fm.genere).map((g) => <Tag key={g} strong>{g}</Tag>)}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-mu">Stato</span>
        <Seg label="Stato" value={state} onChange={setState} size="lg" full options={[{ id: 'todo', label: 'Da vedere' }, { id: 'corso', label: 'In corso' }, { id: 'visto', label: 'Visto' }]} />
      </div>
      {state === 'visto' && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-mu">Il tuo voto</span>
            <Stars value={vote} onChange={(v) => setVote(v ?? 0)} size={phone ? 30 : 24} />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-mu">Commento</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Due parole su com’era" className={inputCls} />
          </label>
        </>
      )}
      {eps.length > 1 && (
        <div>
          <div className="flex items-center justify-between text-[13px] text-mu mb-1.5"><span>Saga · {fmStr(fm.saga)}</span><span className="num">{eps.filter(seen).length}/{eps.length} visti</span></div>
          <div className="flex flex-wrap gap-1.5">
            {eps.map((x) => (
              <button key={x.path} type="button" onClick={() => onPick(x.path)} aria-current={x === note} title={x.title} className={'h-8 min-w-8 px-2 rounded-md border text-[12px] inline-flex items-center justify-center gap-1 cursor-pointer ' + (x === note ? 'border-tx text-tx bg-s3' : 'border-ln text-mu hov')}>
                <b className="num">{fmStr(x.fm.saga_ordine) || '·'}</b>{seen(x) && <Icon name="check" size={11} stroke={2.6} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {!phone && <div className="md text-[14px] text-mu" dangerouslySetInnerHTML={{ __html: html }} />}
      <div className="flex gap-2 sticky bottom-0 bg-s1 pt-2">
        <Button size="lg" icon="note" onClick={() => st.open(note.path)} className="flex-1">Apri la nota</Button>
        {trailer && !phone && <Button size="lg" variant="ghost" icon="external" onClick={() => (vault.openExternal ? vault.openExternal(trailer) : open(trailer, '_blank'))}>Trailer</Button>}
        <Button size="lg" variant="accent" onClick={save} disabled={!dirty} className="flex-1">Salva</Button>
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

  const detail = cur && <Detail note={cur} all={all} onPick={setOpenP} onClose={() => setOpenP(null)} phone={phone} />
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
    <div className="grid gap-x-3.5 gap-y-5" style={{ gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {shown.map((n) => <Poster key={n.path} note={n} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
    </div>
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
          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
            {picks.map((n) => <Poster key={n.path} note={n} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
          </div>
        </Card>
      )}
      {filters}
      {grid}
      {phone ? (
        <Sheet open={!!cur} onOpenChange={(o) => !o && setOpenP(null)} title={cur?.title || 'Scheda'} hideTitle>{detail}</Sheet>
      ) : (
        <Modal open={!!cur} onOpenChange={(o) => !o && setOpenP(null)} title={cur?.title || 'Scheda'} hideTitle className="!top-[7vh] !w-[min(620px,calc(100vw-32px))] max-h-[86vh] overflow-y-auto">
          <div className="p-5">{detail}</div>
        </Modal>
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
