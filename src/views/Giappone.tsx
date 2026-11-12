import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Card, Badge, Button, IconButton, relTime, Empty } from '../ui/kit'
import { MdBlock } from '../ui/MdBlock'
import { todayKey } from '../lib/checklist'

const DIR = '10 Giappone'

export default function Giappone({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [all, setAll] = useState(false)
  const notesIn = useMemo(() => inDir(notes, DIR), [notes])
  const moc = notesIn.find((n) => /moc/i.test(n.name))
  const rest = notesIn.filter((n) => n !== moc).sort((a, b) => b.mtime - a.mtime)
  const newNote = () => st.createNote(`${DIR}/Nuova nota ${todayKey()}.md`, '# Nuova nota\n\n', { edit: true, label: 'Nota creata' })
  const mocTitle = moc ? (moc.body.match(/^#\s+(.+)$/m)?.[1] || moc.title).replace(/\s*[—-]\s*(Map of Content|MOC)\s*$/i, '') : 'Giappone'

  const mocCard = moc ? (
    <section className="rounded-xl bg-s1 border border-ln p-6 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="h-6 px-2 rounded-md bg-s3 text-[11px] font-semibold inline-flex items-center">MOC</span>
        <h2 className="m-0 text-[20px] font-semibold flex-1">{mocTitle}</h2>
        <IconButton icon="edit" label="Modifica l’indice" size={32} onClick={() => { st.open(moc.path); st.setEditing(true) }} />
      </div>
      <MdBlock text={moc.body} from={moc.path} className="moc" />
      <p className="m-0 mt-2 text-[13px] text-mu">I collegamenti tratteggiati sono note ancora da creare: un clic e la crei.</p>
    </section>
  ) : (
    <Card title="Indice del viaggio"><Empty>Nessun indice (MOC) nella cartella {DIR}.</Empty></Card>
  )

  const listCard = (
    <Card title="Note del viaggio" plain={phone} right={<Badge>{rest.length}</Badge>} flush>
      {rest.slice(0, all ? undefined : 5).map((n) => (
        <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-3 min-h-[60px] px-2 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
          <span className="flex-1 min-w-0 truncate">{n.title}</span>
          <span className="text-[12px] text-mu whitespace-nowrap">{relTime(n.mtime)}</span>
        </button>
      ))}
      {rest.length > 5 && !all && <Button variant="link" className="self-start mx-2 my-3 text-[14px]" onClick={() => setAll(true)}>Tutte le {rest.length} note</Button>}
      {!rest.length && <Empty>Ancora nessuna nota.</Empty>}
    </Card>
  )

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('giappone').dot} title="Giappone" sub={`Viaggio in preparazione · cartella ${DIR} (le stesse note sono anche in Note)`}>
          <Button variant="primary" icon="plus" onClick={newNote}>Nuova nota del viaggio</Button>
        </PageHead>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: phone ? '1fr' : 'minmax(0, 1fr) minmax(320px, 1fr)' }}>
        {mocCard}
        {listCard}
      </div>
    </div>
  )
}
