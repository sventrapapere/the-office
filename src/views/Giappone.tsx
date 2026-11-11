import { useMemo } from 'react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Card, Badge, Button, IconButton } from '../ui/kit'
import { NoteRow } from '../ui/notes'
import { MdBlock } from '../ui/MdBlock'
import { byTitle } from '../lib/md'

const DIR = '10 Giappone'

export default function Giappone({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const all = useMemo(() => inDir(notes, DIR).sort(byTitle), [notes])
  const moc = all.find((n) => /moc/i.test(n.name))
  const rest = all.filter((n) => n !== moc).sort((a, b) => b.mtime - a.mtime)
  const newNote = async () => {
    const path = `${DIR}/Nuova nota ${new Date().toLocaleDateString('it-IT').replace(/\//g, '-')}.md`
    await st.write(path, '# Nuova nota\n\n', { undoLabel: 'Nota creata' })
    st.open(path)
    st.setEditing(true)
  }
  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('giappone').dot} title="Giappone" sub={`${all.length} note del viaggio · le stesse sono anche in Note`}>
          <Button icon="plus" onClick={newNote}>Nuova nota del viaggio</Button>
        </PageHead>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: phone ? '1fr' : 'minmax(0, 1.6fr) minmax(300px, 1fr)' }}>
        {moc ? (
          <Card title="Indice del viaggio" right={<IconButton icon="edit" label="Apri e modifica l’indice" size={30} onClick={() => st.open(moc.path)} />}>
            <MdBlock text={moc.body} from={moc.path} className="text-[14px]" />
            <p className="m-0 text-[12px] text-mu">I collegamenti tratteggiati sono note ancora da scrivere: un clic e la crei.</p>
          </Card>
        ) : (
          <Card title="Indice del viaggio"><p className="m-0 text-mu">Nessun MOC nella cartella {DIR}.</p></Card>
        )}
        <Card title="Note del viaggio" right={<Badge>{rest.length}</Badge>} flush>
          {rest.map((n) => <NoteRow key={n.path} note={n} />)}
          {phone && <button type="button" onClick={newNote} className="text-[13px] text-mu text-left py-3 px-1 cursor-pointer">+ Nuova nota del viaggio</button>}
        </Card>
      </div>
    </div>
  )
}
