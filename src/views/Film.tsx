import { useMemo, useState, useEffect } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { Card, Chip, PageHead, Seg, Button, IconButton, Empty } from '../ui/kit'
import { Poster, Stars, Tag } from '../ui/notes'
import { Modal, Sheet } from '../ui/Sheet'
import { useAssetUrl } from '../lib/assets'
import { fmStr, byTitle, mdRender, type Note } from '../lib/md'
import { todayKey } from '../lib/checklist'

const DIR = '60 Film, serie e anime/Titoli'
const seen = (n: Note) => n.fm.visto === true
const catOf = (n: Note) => fmStr(n.fm.categoria) || 'Altro'
const num = (v: unknown) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x }
const list = (v: unknown) => (Array.isArray(v) ? v : v ? String(v).split(/\s*[/,]\s*/) : []).map((x) => String(x).trim()).filter(Boolean)
const sagaOrd = (n: Note) => num(n.fm.saga_ordine) ?? 1e6

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

function Detail({ note, all, onPick }: { note: Note; all: Note[]; onPick: (p: string) => void }) {
  const vault = useStore((s) => s.vault)
  const st = useStore.getState()
  const fm = note.fm
  const p = typeof fm.poster === 'string' ? fm.poster : ''
  const src = useAssetUrl(vault, p ? (/^https?:/.test(p) ? p : '60 Film, serie e anime/' + p.replace(/^\.?\//, '')) : null)
  const [comment, setComment] = useState(fmStr(fm.commento))
  useEffect(() => setComment(fmStr(fm.commento)), [note.path, fm.commento])
  let body = note.body.replace(/^\s*#\s+[^\n]*\n/, '')
  const m = body.match(/(^|\n)##\s+Note personali\s*\n([\s\S]*)$/i)
  if (m) body = body.slice(0, m.index)
  const html = mdRender(body, { notes: all, from: note.path }, -1e6)
  const eps = fm.saga ? all.filter((x) => String(x.fm.saga || '') === String(fm.saga)).sort((a, b) => sagaOrd(a) - sagaOrd(b) || byTitle(a, b)) : []
  const facts = [fm.anno && String(fm.anno), catOf(note), fm.durata && fmStr(fm.durata)].filter(Boolean).join(' · ')
  const trailer = typeof fm.trailer === 'string' && /^https?:/.test(fm.trailer) ? fm.trailer : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <span className="w-[112px] flex-none aspect-[2/3] rounded-[10px] overflow-hidden border border-ln bg-s2 relative">
          {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div>
            <div className="text-[20px] font-semibold leading-tight">{note.title}</div>
            {fm.titolo_originale && <div className="text-[13px] text-mu">{fmStr(fm.titolo_originale)}</div>}
          </div>
          <div className="num text-[12px] text-mu">{facts}</div>
          <div className="flex flex-wrap gap-1">{list(fm.genere).map((g) => <Tag key={g}>{g}</Tag>)}{list(fm.piattaforma).map((g) => <Tag key={g} strong>{g}</Tag>)}</div>
          <div className="flex flex-wrap items-center gap-2 mt-auto">
            <Button variant={seen(note) ? 'secondary' : 'primary'} icon={seen(note) ? 'undo' : 'check'} onClick={() => st.setField(note.path, 'visto', !seen(note), seen(note) ? 'Segnato da vedere' : 'Segnato come visto')}>
              {seen(note) ? 'Non visto' : 'Visto'}
            </Button>
            {trailer && <Button variant="ghost" icon="external" onClick={() => (vault?.openExternal ? vault.openExternal(trailer) : open(trailer, '_blank'))}>Trailer</Button>}
          </div>
        </div>
      </div>
      {seen(note) && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-ln bg-s2">
          <div className="flex items-center gap-3"><span className="text-[13px] text-mu w-[72px]">Voto</span><Stars value={num(fm.voto) ?? 0} onChange={(v) => st.setField(note.path, 'voto', v, 'Voto salvato')} /></div>
          <label className="flex items-start gap-3">
            <span className="text-[13px] text-mu w-[72px] pt-1.5">Commento</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== fmStr(fm.commento) && st.setField(note.path, 'commento', comment.trim() || null)} placeholder="Due parole su com’era" className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-ln bg-s1 text-tx outline-none focus:border-ol placeholder:text-mu" />
          </label>
        </div>
      )}
      {eps.length > 1 && (
        <div>
          <div className="flex items-center justify-between text-[12px] text-mu mb-1.5"><span>Saga · {fmStr(fm.saga)}</span><span className="num">{eps.filter(seen).length}/{eps.length} visti</span></div>
          <div className="flex flex-wrap gap-1.5">
            {eps.map((x) => (
              <button key={x.path} type="button" onClick={() => onPick(x.path)} aria-current={x === note} className={'h-7 px-2 rounded-md border text-[12px] inline-flex items-center gap-1.5 cursor-pointer ' + (x === note ? 'border-tx text-tx bg-s3' : 'border-ln text-mu hov')}>
                <b className="num">{fmStr(x.fm.saga_ordine) || '·'}</b>{seen(x) && '✓'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="md text-[14px]" dangerouslySetInnerHTML={{ __html: html }} />
      <Button variant="secondary" icon="note" className="self-start" onClick={() => st.open(note.path)}>Apri la nota</Button>
    </div>
  )
}

export default function Film({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const all = useMemo(() => inDir(notes, DIR), [notes])
  const [show, setShow] = useState<'todo' | 'seen' | 'all'>('todo')
  const [cat, setCat] = useState('all')
  const [openP, setOpenP] = useState<string | null>(null)
  const [shift, setShift] = useState(() => +(localStorage.getItem(shiftKey()) || 0))
  const todo = all.filter((n) => !seen(n))
  const picks = useMemo(() => filmPicks(todo, shift), [todo.length, shift, notes])
  const cats = [...new Set(all.map(catOf))].sort((a, b) => a.localeCompare(b, 'it'))
  const inShow = (n: Note) => show === 'all' || (show === 'seen' ? seen(n) : !seen(n))
  const inCat = (n: Note) => cat === 'all' || catOf(n) === cat
  const sagaKey = (n: Note) => (n.fm.saga ? String(n.fm.saga) : n.title) + '\u0000' + String(sagaOrd(n)).padStart(8, '0')
  const shown = all.filter((n) => inShow(n) && inCat(n)).sort(show === 'seen' ? (a, b) => (num(b.fm.voto) ?? 0) - (num(a.fm.voto) ?? 0) || byTitle(a, b) : (a, b) => sagaKey(a).localeCompare(sagaKey(b), 'it'))
  const votes = all.map((n) => num(n.fm.voto)).filter((x): x is number => x != null)
  const avg = votes.length ? (votes.reduce((a, b) => a + b, 0) / votes.length).toFixed(1).replace('.', ',') : '—'
  const cur = openP ? all.find((n) => n.path === openP) : null
  const more = () => { const v = shift + 1; setShift(v); try { localStorage.setItem(shiftKey(), String(v)) } catch { /* */ } }
  const sub = (n: Note) => [n.fm.anno, list(n.fm.piattaforma)[0]].filter(Boolean).join(' · ')
  const cols = phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(128px, 1fr))'

  const detail = cur && <Detail note={cur} all={all} onPick={setOpenP} />

  return (
    <div className="flex flex-col gap-4">
      {!phone && <PageHead dot={section('film').dot} title="Film e serie" sub={`${all.length} titoli · ${all.length - todo.length} visti · voto medio ${avg}`} />}
      {picks.length > 0 && (
        <Card title="Proposte di oggi" right={<><span className="text-[12px] text-mu hidden md:inline">una per categoria, cambiano ogni giorno</span><IconButton icon="sync" label="Altre proposte" size={30} onClick={more} /></>}>
          <div className="grid gap-3" style={{ gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(6, minmax(0, 1fr))' }}>
            {picks.map((n) => <Poster key={n.path} note={n} sub={sub(n)} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
          </div>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Seg label="Stato" value={show} onChange={setShow} options={[
          { id: 'todo', label: 'Da vedere', count: all.filter((n) => !seen(n) && inCat(n)).length },
          { id: 'seen', label: 'Visti', count: all.filter((n) => seen(n) && inCat(n)).length },
          { id: 'all', label: 'Tutti', count: all.filter(inCat).length },
        ]} />
        <div className="chips flex-1 min-w-0" role="group" aria-label="Categoria">
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>Ogni categoria</Chip>
          {cats.map((c) => <Chip key={c} on={cat === c} count={all.filter((n) => catOf(n) === c && inShow(n)).length} onClick={() => setCat(c)}>{c}</Chip>)}
        </div>
      </div>
      {shown.length ? (
        <div className="grid gap-x-3 gap-y-4" style={{ gridTemplateColumns: cols }}>
          {shown.map((n) => <Poster key={n.path} note={n} sub={sub(n)} rating={seen(n) && n.fm.voto ? fmStr(n.fm.voto) : undefined} onClick={() => setOpenP(n.path)} selected={openP === n.path} />)}
        </div>
      ) : (
        <Empty>Nessun titolo con questi filtri.</Empty>
      )}
      {phone ? (
        <Sheet open={!!cur} onOpenChange={(o) => !o && setOpenP(null)} title={cur?.title || 'Scheda'} hideTitle>{detail}</Sheet>
      ) : (
        <Modal open={!!cur} onOpenChange={(o) => !o && setOpenP(null)} title={cur?.title || 'Scheda'} hideTitle className="!top-[8vh] !w-[min(640px,calc(100vw-32px))] max-h-[84vh] overflow-y-auto">
          <div className="p-5">{detail}</div>
        </Modal>
      )}
    </div>
  )
}
