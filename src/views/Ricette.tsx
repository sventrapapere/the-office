import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Chip, Button, Empty } from '../ui/kit'
import { Tag } from '../ui/notes'
import { Icon } from '../ui/Icon'
import { fmStr, byTitle, excerpt, type Note } from '../lib/md'

const DIR = '70 Ricette'
const catOf = (n: Note) => n.path.split('/')[1]
const minutes = (v: unknown) => {
  const s = fmStr(v).toLowerCase()
  if (!s) return null
  const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/)
  const t = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)
  return t || null
}

export default function Ricette({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const all = useMemo(() => inDir(notes, DIR).filter((n) => n.path.split('/').length > 2 && !n.name.startsWith('_')), [notes])
  const [cat, setCat] = useState('all')
  const [tested, setTested] = useState(false)
  const [quick, setQuick] = useState(false)
  const cats = [...new Set(all.map(catOf))].sort((a, b) => a.localeCompare(b, 'it'))
  const list = all.filter((n) => (cat === 'all' || catOf(n) === cat) && (!tested || n.fm.testato === true) && (!quick || (minutes(n.fm.tempo_totale) ?? 999) <= 30)).sort(byTitle)
  const random = () => { if (list.length) st.open(list[Math.floor(Math.random() * list.length)].path) }
  const index = notes.find((n) => n.path === DIR + '/_INDEX.md')

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('ricette').dot} title="Ricette" sub={`${all.length} ricette in ${cats.length} categorie · ${all.filter((n) => n.fm.testato === true).length} provate`}>
          {index && <Button variant="ghost" icon="note" onClick={() => st.open(index.path)}>Indice</Button>}
          <Button icon="dice" onClick={random} disabled={!list.length}>Ricetta a caso</Button>
        </PageHead>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="chips flex-1 min-w-0" role="group" aria-label="Categoria">
          <Chip on={cat === 'all'} onClick={() => setCat('all')} count={all.length}>Tutte</Chip>
          {cats.map((c) => <Chip key={c} on={cat === c} count={all.filter((n) => catOf(n) === c).length} onClick={() => setCat(c)}>{c}</Chip>)}
        </div>
        <div className="chips" role="group" aria-label="Filtri">
          <Chip on={tested} onClick={() => setTested((v) => !v)}>Solo provate</Chip>
          <Chip on={quick} icon="clock" onClick={() => setQuick((v) => !v)}>Sotto 30 min</Chip>
          {phone && <Chip icon="dice" onClick={random}>A caso</Chip>}
        </div>
      </div>
      {list.length ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {list.map((n) => (
            <button key={n.path} type="button" onClick={() => st.open(n.path)} className="press flex flex-col gap-2 p-4 rounded-xl border border-ln bg-s1 text-left cursor-pointer hov min-w-0">
              <span className="text-[12px] text-mu">{catOf(n)}</span>
              <span className="font-semibold leading-snug line-clamp-2">{n.title}</span>
              <span className="text-[13px] text-mu leading-snug line-clamp-2">{excerpt(n.body, 110)}</span>
              <span className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
                {n.fm.tempo_totale && <span className="num text-[12px] text-tx inline-flex items-center gap-1 min-w-0" title={fmStr(n.fm.tempo_totale)}><Icon name="clock" size={12} className="flex-none" /><span className="truncate">{fmStr(n.fm.tempo_totale).replace(/\s*\(.*\)\s*$/, '')}</span></span>}
                {n.fm.difficolta && <Tag>{fmStr(n.fm.difficolta)}</Tag>}
                {n.fm.voto && <Tag strong>★ {fmStr(n.fm.voto)}</Tag>}
                <span className="flex-1" />
                <span className={'text-[12px] ' + (n.fm.testato === true ? 'text-ok' : 'text-mu')}>{n.fm.testato === true ? 'provata' : 'da provare'}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty>Nessuna ricetta con questi filtri.</Empty>
      )}
    </div>
  )
}
