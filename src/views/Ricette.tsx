import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Chip, Button, Empty, inputCls, Seg } from '../ui/kit'
import { Modal } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { useAssetUrl } from '../lib/assets'
import { fmStr, byTitle, mdSection, type Note } from '../lib/md'
import { todayKey } from '../lib/checklist'

const DIR = '70 Ricette'
const catOf = (n: Note) => n.path.split('/')[1]
const minutes = (v: unknown) => {
  const s = fmStr(v).toLowerCase()
  if (!s) return null
  const h = s.match(/(\d+)\s*h/), m = s.match(/(\d+)\s*m/)
  const t = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0)
  return t || null
}
const time = (n: Note) => fmStr(n.fm.tempo_totale).replace(/\s*\(.*\)\s*$/, '').replace(/^~/, '')
const diff = (n: Note) => { const d = fmStr(n.fm.difficolta); return d ? d[0].toUpperCase() + d.slice(1) : '' }
const tested = (n: Note) => n.fm.testato === true

/** Ingredienti della ricetta (sezione "## Ingredienti") come voci della spesa. */
export function ingredients(n: Note): string[] {
  return mdSection(n.body, 'Ingredienti').split('\n').map((l) => l.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/)?.[1]?.replace(/\*\*/g, '').trim()).filter((x): x is string => !!x)
}
export async function addIngredientsToShopping(n: Note) {
  const st = useStore.getState()
  const items = ingredients(n)
  if (!items.length) return
  await st.mutateCheck((d) => {
    const s = d.find((b) => b.type === 'sec' && b.kind === 'spesa')
    if (!s || s.type !== 'sec') return
    for (const t of items) if (!s.items.some((x) => !x.done && x.title === t)) s.items.push({ title: t, done: false, days: [], doneAt: null, note: [`per: ${n.title}`] })
  }, `${items.length} ingredienti nella spesa`)
}

function Meta({ n }: { n: Note }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mu">
      {time(n) && <span className="inline-flex items-center gap-1 num"><Icon name="clock" size={13} />{time(n)}</span>}
      {diff(n) && <span>{diff(n)}</span>}
      {n.fm.voto && <span className="inline-flex items-center gap-1 text-ac font-semibold num"><Icon name="star" size={13} stroke={2.2} />{fmStr(n.fm.voto)}</span>}
    </span>
  )
}
const Status = ({ n }: { n: Note }) =>
  tested(n) ? <span className="num text-[11px] px-1.5 py-0.5 rounded bg-s2 text-mu">Provata</span>
    : <span className="text-[12px] font-semibold px-2 py-0.5 rounded-md border border-dashed border-mu text-tx">Da provare</span>

function RecipeCard({ n }: { n: Note }) {
  const st = useStore.getState()
  const vault = useStore((s) => s.vault)
  const img = fmStr(n.fm.foto || n.fm.immagine || n.fm.cover)
  const src = useAssetUrl(vault, img || null, n.path)
  return (
    <button type="button" onClick={() => st.open(n.path)} className="press group flex flex-col rounded-xl bg-s1 border border-ln overflow-hidden text-left cursor-pointer min-w-0">
      <span className="relative h-[108px] bg-s3 flex items-start justify-between p-3">
        {src && <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <span className="relative h-6 px-2 rounded-md bg-bg/90 text-[12px] font-semibold inline-flex items-center">{catOf(n)}</span>
        <Icon name="ricette" size={18} className="relative" />
      </span>
      <span className="flex flex-col gap-2 p-3.5 pt-3">
        <span className="font-semibold text-[16px] leading-snug line-clamp-2">{n.title}</span>
        <Meta n={n} />
        <span className="self-start"><Status n={n} /></span>
      </span>
    </button>
  )
}

function NewRecipe({ open, onClose, cats }: { open: boolean; onClose: () => void; cats: string[] }) {
  const st = useStore.getState()
  const [t, setT] = useState('')
  const [cat, setCat] = useState(cats[0] || 'Varie')
  const [time, setTime] = useState('')
  const [diff, setDiff] = useState('media')
  const create = async () => {
    const title = t.trim()
    if (!title) return
    const text = `---\ntitle: ${JSON.stringify(title)}\ncreated: ${todayKey()}\ncategoria: ${JSON.stringify(cat)}\nporzioni: \ntempo_totale: ${time ? JSON.stringify(time) : ''}\ndifficolta: ${diff}\ntestato: false\nvoto: \ntags: [ricette]\n---\n\n## Ingredienti\n\n- \n\n## Procedimento\n\n1. \n`
    onClose(); setT(''); setTime('')
    await st.createNote(`${DIR}/${cat}/${title.replace(/[\\/:*?"<>|#^[\]]/g, '')}.md`, text, { edit: true, label: 'Ricetta creata' })
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Nuova ricetta">
      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input autoFocus className={inputCls} value={t} onChange={(e) => setT(e.target.value)} placeholder="Nome della ricetta" aria-label="Nome della ricetta" />
        <div className="chips" role="group" aria-label="Categoria">{cats.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}</div>
        <div className="flex gap-2 items-center flex-wrap">
          <input className={inputCls + ' w-36'} value={time} onChange={(e) => setTime(e.target.value)} placeholder="Tempo (es. 40 min)" aria-label="Tempo totale" />
          <Seg label="Difficoltà" value={diff} onChange={setDiff} options={[{ id: 'facile', label: 'Facile' }, { id: 'media', label: 'Media' }, { id: 'difficile', label: 'Difficile' }]} />
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annulla</Button><Button variant="primary" type="submit" disabled={!t.trim()}>Crea e scrivi</Button></div>
      </form>
    </Modal>
  )
}

export default function Ricette({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const all = useMemo(() => inDir(notes, DIR).filter((n) => n.path.split('/').length > 2 && !n.name.startsWith('_')), [notes])
  const [cat, setCat] = useState('all')
  const [onlyTested, setOnlyTested] = useState(false)
  const [quick, setQuick] = useState(false)
  const [adding, setAdding] = useState(false)
  const cats = [...new Set(all.map(catOf))].sort((a, b) => a.localeCompare(b, 'it'))
  const list = all.filter((n) => (cat === 'all' || catOf(n) === cat) && (!onlyTested || tested(n)) && (!quick || (minutes(n.fm.tempo_totale) ?? 999) <= 30)).sort(byTitle)
  const random = () => { if (list.length) st.open(list[Math.floor(Math.random() * list.length)].path) }

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('ricette').dot} title="Ricette" sub={`${all.length} ricette in ${cats.length} categorie · ${all.filter(tested).length} provate`}>
          <Button icon="dice" onClick={random} disabled={!list.length}>Ricetta a caso</Button>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Nuova ricetta</Button>
        </PageHead>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="chips flex-1 min-w-0" role="group" aria-label="Categoria">
          <Chip on={cat === 'all'} onClick={() => setCat('all')}>Tutte</Chip>
          {cats.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>{c}</Chip>)}
        </div>
        {!phone && (
          <div className="chips" role="group" aria-label="Filtri">
            <Chip on={onlyTested} onClick={() => setOnlyTested((v) => !v)}>Solo provate</Chip>
            <Chip on={quick} icon="clock" onClick={() => setQuick((v) => !v)}>Sotto 30 min</Chip>
          </div>
        )}
      </div>
      {phone && (
        <button type="button" onClick={random} className="press flex items-center gap-3 min-h-[56px] px-4 rounded-xl bg-s3 text-left cursor-pointer">
          <Icon name="dice" size={18} /><span className="flex-1 font-semibold">Ricetta a caso</span><span className="text-[13px] text-mu">tra le {list.length}</span>
        </button>
      )}
      {!list.length && <Empty icon="ricette">Nessuna ricetta con questi filtri.</Empty>}
      {phone ? (
        <div className="flex flex-col gap-2">
          {list.map((n) => (
            <button key={n.path} type="button" onClick={() => st.open(n.path)} className="press flex items-center gap-3.5 p-2.5 rounded-xl bg-s1 border border-ln text-left cursor-pointer">
              <span className="w-14 h-14 rounded-lg bg-s3 flex items-center justify-center flex-none"><Icon name="ricette" size={20} /></span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-semibold truncate">{n.title}</span>
                <span className="text-[12px] text-mu truncate">{[catOf(n), time(n), diff(n)].filter(Boolean).join('  ·  ')}{n.fm.voto ? <span className="text-ac font-semibold"> ★ {fmStr(n.fm.voto)}</span> : null}</span>
              </span>
              <Status n={n} />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {list.map((n) => <RecipeCard key={n.path} n={n} />)}
        </div>
      )}
      <NewRecipe open={adding} onClose={() => setAdding(false)} cats={cats} />
    </div>
  )
}
