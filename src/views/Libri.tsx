import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Seg, Empty, Button } from '../ui/kit'
import { Tag } from '../ui/notes'
import { Icon } from '../ui/Icon'
import { fmStr, byTitle, type Note } from '../lib/md'

const DIR = '80 Libri/Titoli'
const read = (n: Note) => n.fm.letto === true
const num = (v: unknown) => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x }

function Book({ n }: { n: Note }) {
  const st = useStore.getState()
  const v = num(n.fm.voto)
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <button type="button" onClick={() => st.open(n.path)} className="press relative aspect-[2/3] rounded-[4px_10px_10px_4px] border border-ln bg-s2 text-left p-3 flex flex-col justify-between cursor-pointer shadow-[inset_5px_0_0_var(--s3)] hov">
        <span className="font-semibold leading-snug line-clamp-4 pl-1.5">{n.title}</span>
        <span className="text-[11px] text-mu pl-1.5 line-clamp-2">{fmStr(n.fm.autore)}</span>
      </button>
      <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-mu">
        {read(n) ? (v ? <span className="num text-tx inline-flex items-center gap-0.5"><Icon name="star" size={11} />{v}</span> : <span>letto</span>) : n.fm.pagine ? <span className="num">{fmStr(n.fm.pagine)} pag.</span> : null}
        {n.fm.formato && <Tag>{fmStr(n.fm.formato)}</Tag>}
      </div>
    </div>
  )
}

export default function Libri({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const all = useMemo(() => inDir(notes, DIR), [notes])
  const [show, setShow] = useState<'todo' | 'read' | 'all'>('todo')
  const list = all.filter((n) => show === 'all' || (show === 'read' ? read(n) : !read(n)))
    .sort(show === 'read' ? (a, b) => (num(b.fm.voto) ?? 0) - (num(a.fm.voto) ?? 0) || byTitle(a, b) : byTitle)
  const readme = notes.find((n) => n.path === '80 Libri/_README.md')
  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('libri').dot} title="Libri" sub={`${all.length} ${all.length === 1 ? 'titolo' : 'titoli'} · ${all.filter(read).length} letti`}>
          {readme && <Button variant="ghost" icon="note" onClick={() => st.open(readme.path)}>Come funziona</Button>}
        </PageHead>
      )}
      <div className="self-start"><Seg label="Stato" value={show} onChange={setShow} options={[
        { id: 'todo', label: 'Da leggere', count: all.filter((n) => !read(n)).length },
        { id: 'read', label: 'Letti', count: all.filter(read).length },
        { id: 'all', label: 'Tutti', count: all.length },
      ]} /></div>
      {list.length ? (
        <div className="grid gap-x-3 gap-y-5" style={{ gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(132px, 1fr))' }}>
          {list.map((n) => <Book key={n.path} n={n} />)}
        </div>
      ) : (
        <Empty>{show === 'read' ? 'Nessun libro segnato come letto. Apri un libro e metti “letto: true”, oppure chiedilo a Claude.' : 'Niente in lista.'}</Empty>
      )}
    </div>
  )
}
