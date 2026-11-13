import { useMemo, useState, useEffect } from 'react'
import clsx from 'clsx'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Seg, Empty, Button, Pop, MoreMenu, inputCls } from '../ui/kit'
import { Stars } from '../ui/notes'
import { Modal, Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { fmStr, byTitle, setFM, type Note } from '../lib/md'
import { todayKey } from '../lib/checklist'

const DIR = '80 Libri/Titoli'
const num = (v: unknown) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x }
const read = (n: Note) => n.fm.letto === true
const reading = (n: Note) => !read(n) && n.fm.in_lettura === true
type Show = 'todo' | 'reading' | 'read' | 'all'

/** Copertina: rettangolo con il dorso, come nella tavola. */
const Cover = ({ className }: { className?: string }) => (
  <span className={clsx('relative bg-s2 border border-ln rounded-[4px_10px_10px_4px] shadow-[inset_7px_0_0_var(--s3)] flex items-center justify-center', className)}>
    <Icon name="libri" size={20} className="text-mu" />
  </span>
)

async function patch(path: string, fields: Record<string, string | number | boolean | null>, label?: string) {
  const st = useStore.getState()
  let t = (await st.vault!.read(path)) ?? ''
  for (const [k, v] of Object.entries(fields)) t = setFM(t, k, v)
  await st.write(path, t, { undoLabel: label })
}

function PageUpdate({ n, children }: { n: Note; children: React.ReactElement }) {
  const [v, setV] = useState(String(num(n.fm.pagina) ?? ''))
  const [open, setOpen] = useState(false)
  return (
    <Pop open={open} onOpenChange={setOpen} title="A che pagina sei?" trigger={children}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const p = parseInt(v, 10); if (!isNaN(p)) patch(n.path, { pagina: p, in_lettura: true }, 'Pagina aggiornata'); setOpen(false) }}>
        <input autoFocus className={inputCls + ' w-24 num'} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} aria-label="Pagina" />
        <span className="self-center text-[13px] text-mu whitespace-nowrap">di {fmStr(n.fm.pagine) || '?'}</span>
        <Button variant="primary" type="submit">Salva</Button>
      </form>
    </Pop>
  )
}

function Reading({ n, phone }: { n: Note; phone?: boolean }) {
  const st = useStore.getState()
  const tot = num(n.fm.pagine), p = num(n.fm.pagina) ?? 0
  const pct = tot ? Math.min(100, Math.round((p / tot) * 100)) : 0
  const bar = <div className="h-1.5 rounded-full bg-s3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="bar-fill h-full bg-ac rounded-full" style={{ width: pct + '%' }} /></div>
  if (phone)
    return (
      <PageUpdate n={n}>
        <button type="button" className="press flex gap-3.5 p-3 rounded-xl bg-s1 border border-ln text-left cursor-pointer w-full">
          <Cover className="w-12 h-16 flex-none" />
          <span className="flex-1 min-w-0 flex flex-col gap-1 py-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ac">In lettura</span>
            <span className="font-semibold truncate">{n.title}</span>
            {bar}
            <span className="text-[12px] text-mu num">p. {p} di {tot ?? '?'} · tocca per aggiornare</span>
          </span>
        </button>
      </PageUpdate>
    )
  return (
    <div className="flex items-center gap-5 p-4 rounded-xl bg-s1 border border-ln">
      <button type="button" onClick={() => st.open(n.path)} className="cursor-pointer" aria-label={'Apri: ' + n.title}><Cover className="w-[84px] h-[126px]" /></button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ac">In lettura</span>
        <button type="button" onClick={() => st.open(n.path)} className="text-left text-[22px] font-semibold leading-tight cursor-pointer">{n.title}</button>
        <span className="text-mu">{[fmStr(n.fm.autore), tot && tot + ' pagine'].filter(Boolean).join(' · ')}</span>
        <div className="flex items-center gap-3 mt-2 max-w-[480px]"><div className="flex-1">{bar}</div><span className="text-[13px] text-mu num whitespace-nowrap">p. {p} di {tot ?? '?'}</span></div>
      </div>
      <PageUpdate n={n}><Button icon="edit">Aggiorna pagina</Button></PageUpdate>
      <Button variant="primary" icon="check" onClick={() => patch(n.path, { letto: true, in_lettura: null, letto_il: todayKey(), pagina: tot ?? null }, 'Segnato come letto: ' + n.title)}>Segna come letto</Button>
    </div>
  )
}

/** Scheda del libro: stato, pagina, voto, commento. */
function Detail({ n, onClose, phone }: { n: Note; onClose: () => void; phone?: boolean }) {
  const st = useStore.getState()
  const s0: Show = read(n) ? 'read' : reading(n) ? 'reading' : 'todo'
  const [state, setState] = useState<Show>(s0)
  const [vote, setVote] = useState(num(n.fm.voto) ?? 0)
  const [page, setPage] = useState(String(num(n.fm.pagina) ?? ''))
  const [comment, setComment] = useState(fmStr(n.fm.commento))
  useEffect(() => { setState(s0); setVote(num(n.fm.voto) ?? 0); setPage(String(num(n.fm.pagina) ?? '')); setComment(fmStr(n.fm.commento)) }, [n.path, n.mtime]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    await patch(n.path, {
      letto: state === 'read', in_lettura: state === 'reading' ? true : null,
      letto_il: state === 'read' ? (n.fm.letto_il ? fmStr(n.fm.letto_il) : todayKey()) : null,
      pagina: page ? parseInt(page, 10) : null, voto: vote || null, commento: comment.trim() || null,
    }, 'Libro aggiornato')
    onClose()
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <Cover className="w-[72px] h-[108px] flex-none" />
        <div className="min-w-0 flex flex-col gap-1">
          <div className="text-[20px] font-semibold leading-tight">{n.title}</div>
          <div className="text-[13px] text-mu">{[fmStr(n.fm.autore), n.fm.anno, n.fm.pagine && fmStr(n.fm.pagine) + ' p.'].filter(Boolean).join(' · ')}</div>
          <div className="text-[13px] text-mu">{[fmStr(n.fm.categoria), fmStr(n.fm.formato), fmStr(n.fm.piattaforma)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <Seg label="Stato" value={state} onChange={setState} size="lg" full options={[{ id: 'todo', label: 'Da leggere' }, { id: 'reading', label: 'In lettura' }, { id: 'read', label: 'Letto' }]} />
      {state === 'reading' && (
        <label className="flex items-center gap-2 text-[13px] text-mu">Pagina<input className={inputCls + ' w-24 num'} inputMode="numeric" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))} />di {fmStr(n.fm.pagine) || '?'}</label>
      )}
      {state === 'read' && (
        <>
          <div className="flex flex-col gap-1"><span className="text-[13px] text-mu">Il tuo voto</span><Stars value={vote} onChange={(v) => setVote(v ?? 0)} size={phone ? 30 : 24} /></div>
          <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Commento" aria-label="Commento" />
        </>
      )}
      <div className="flex gap-2">
        <Button size="lg" icon="note" className="flex-1" onClick={() => st.open(n.path)}>Apri la nota</Button>
        <Button size="lg" variant="accent" className="flex-1" onClick={save}>Salva</Button>
      </div>
    </div>
  )
}

function AddBook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useStore.getState()
  const [t, setT] = useState(''), [a, setA] = useState(''), [p, setP] = useState('')
  const create = async () => {
    const title = t.trim()
    if (!title) return
    const text = `---\nletto: false\ncategoria: \ntitolo_originale: \nautore: ${a.trim() ? JSON.stringify(a.trim()) : ''}\nanno: \npagine: ${p}\ngenere: []\nvoto: \ncommento: \nposseduto: false\nformato: \ntags: [libri, wishlist]\n---\n\n# ${title}\n\n`
    onClose(); setT(''); setA(''); setP('')
    await st.createNote(`${DIR}/${title.replace(/[\\/:*?"<>|#^[\]]/g, '')}.md`, text, { label: 'Libro aggiunto' })
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Aggiungi libro">
      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input autoFocus className={inputCls} value={t} onChange={(e) => setT(e.target.value)} placeholder="Titolo" aria-label="Titolo" />
        <div className="flex gap-2">
          <input className={inputCls} value={a} onChange={(e) => setA(e.target.value)} placeholder="Autore" aria-label="Autore" />
          <input className={inputCls + ' w-28'} value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, ''))} placeholder="Pagine" aria-label="Pagine" inputMode="numeric" />
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annulla</Button><Button variant="primary" type="submit" disabled={!t.trim()}>Aggiungi</Button></div>
      </form>
    </Modal>
  )
}

export default function Libri({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const all = useMemo(() => inDir(notes, DIR), [notes])
  const [show, setShow] = useState<Show>('todo')
  const [sel, setSel] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const now = all.filter(reading)
  const match = (n: Note) => show === 'all' || (show === 'read' ? read(n) : show === 'reading' ? reading(n) : !read(n) && !reading(n))
  const list = all.filter(match).sort(show === 'read' ? (a, b) => (num(b.fm.voto) ?? 0) - (num(a.fm.voto) ?? 0) || byTitle(a, b) : byTitle)
  const cur = sel ? all.find((n) => n.path === sel) : null
  const readme = notes.find((n) => n.path === '80 Libri/_README.md')
  const status = (n: Note) =>
    read(n) ? <Stars value={num(n.fm.voto) ?? 0} size={12} /> : reading(n) ? <span className="text-[13px] text-ac font-semibold">In lettura</span> : <span className="text-[13px] text-mu font-semibold">Da leggere</span>

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('libri').dot} title="Libri" sub={`${all.length} ${all.length === 1 ? 'titolo' : 'titoli'} · ${all.filter(read).length} letti · cartella 80 Libri`}>
          {readme && <Button variant="ghost" icon="note" onClick={() => st.open(readme.path)}>Come funziona</Button>}
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Aggiungi libro</Button>
        </PageHead>
      )}
      {now.map((n) => <Reading key={n.path} n={n} phone={phone} />)}
      <div className={phone ? 'overflow-x-auto -mx-3 px-3' : ''}>
        <Seg label="Stato" value={show} onChange={setShow} size="lg" options={[
          { id: 'todo', label: 'Da leggere', count: all.filter((n) => !read(n) && !reading(n)).length },
          ...(phone && !now.length ? [] : [{ id: 'reading' as Show, label: 'In lettura', count: now.length }]),
          { id: 'read', label: 'Letti', count: all.filter(read).length },
          { id: 'all', label: 'Tutti', count: phone ? undefined : all.length },
        ]} />
      </div>
      {!list.length && <Empty icon="libri">{show === 'read' ? 'Nessun libro letto ancora. Apri un libro e segna “Letto”.' : 'Niente qui.'}</Empty>}
      {phone ? (
        <div key={show} className="fade-in flex flex-col">
          {list.map((n) => (
            <div key={n.path} className="flex items-center gap-3 min-h-[68px] border-b border-ln last:border-b-0">
              <button type="button" onClick={() => setSel(n.path)} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer py-2">
                <Cover className="w-10 h-14 flex-none [&_svg]:hidden" />
                <span className="min-w-0"><span className="block font-semibold truncate">{n.title}</span><span className="block text-[13px] text-mu truncate">{[fmStr(n.fm.autore), n.fm.pagine && fmStr(n.fm.pagine) + ' p.'].filter(Boolean).join(' · ')}</span></span>
              </button>
              <MoreMenu items={[
                { label: 'Apri la nota', icon: 'note', onClick: () => st.open(n.path) },
                ...(!reading(n) && !read(n) ? [{ label: 'Inizia a leggere', icon: 'libri' as const, onClick: () => patch(n.path, { in_lettura: true, pagina: 0 }, 'In lettura: ' + n.title) }] : []),
                ...(!read(n) ? [{ label: 'Segna come letto', icon: 'check' as const, onClick: () => patch(n.path, { letto: true, in_lettura: null, letto_il: todayKey() }, 'Letto: ' + n.title) }] : []),
              ]} />
            </div>
          ))}
        </div>
      ) : (
        <div key={show} className="fade-in grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
          {list.map((n) => (
            <button key={n.path} type="button" onClick={() => setSel(n.path)} className="group flex flex-col gap-1.5 text-left cursor-pointer min-w-0">
              <Cover className="aspect-[2/3] w-full transition-transform duration-150 ease-out group-hover:-translate-y-0.5" />
              <span className="font-semibold leading-snug line-clamp-2 mt-1">{n.title}</span>
              <span className="text-[13px] text-mu leading-snug">{[fmStr(n.fm.autore), n.fm.pagine && fmStr(n.fm.pagine) + ' p.'].filter(Boolean).join(' · ')}</span>
              {status(n)}
            </button>
          ))}
        </div>
      )}
      {phone ? (
        <Sheet open={!!cur} onOpenChange={(o) => !o && setSel(null)} title={cur?.title || 'Libro'} hideTitle>{cur && <Detail n={cur} onClose={() => setSel(null)} phone />}</Sheet>
      ) : (
        <Modal open={!!cur} onOpenChange={(o) => !o && setSel(null)} title={cur?.title || 'Libro'} hideTitle className="!w-[min(560px,calc(100vw-32px))]"><div className="p-5">{cur && <Detail n={cur} onClose={() => setSel(null)} />}</div></Modal>
      )}
      <AddBook open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}
