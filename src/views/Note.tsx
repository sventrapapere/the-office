import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section, SECTIONS } from '../sections'
import { Card, Chip, PageHead, Badge, Button, Empty } from '../ui/kit'
import { NoteRow, NoteTile, Tag } from '../ui/notes'
import { Icon } from '../ui/Icon'
import { fmStr, byTitle } from '../lib/md'
import { INBOX_DIR } from '../lib/checklist'

const HIDDEN_TOP = new Set(['04 Checklist', '_raw', '_dashboard', '_posters'])
const STARTS: [string, string][] = [
  ['MOC.md', 'Indice generale'],
  ['03 Conoscenza/_INDEX.md', 'Conoscenza — indice'],
  ['10 Giappone/Giappone - MOC.md', 'Giappone'],
  ['70 Ricette/_INDEX.md', 'Ricette — indice'],
  ['55 Miniature/Miniature - MOC.md', 'Miniature'],
  ['Come usare questo vault.md', 'Come usare il vault'],
]

export default function Note({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [dir, setDir] = useState('__recent')
  const inbox = useMemo(() => inDir(notes, INBOX_DIR).sort((a, b) => b.mtime - a.mtime), [notes])
  const know = useMemo(() => inDir(notes, '03 Conoscenza').filter((n) => !n.name.startsWith('_')).sort((a, b) => b.mtime - a.mtime), [notes])
  const beta = inDir(notes, '01 BETA 80').sort(byTitle)
  const starts = STARTS.filter(([p]) => notes.some((n) => n.path === p))
  const visible = notes.filter((n) => !HIDDEN_TOP.has(n.top))
  const tops = useMemo(() => {
    const m: Record<string, number> = {}
    visible.forEach((n) => { const t = n.top || '(radice)'; m[t] = (m[t] || 0) + 1 })
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], 'it'))
  }, [visible])
  const list = dir === '__recent'
    ? [...visible].sort((a, b) => b.mtime - a.mtime).slice(0, 24)
    : visible.filter((n) => (n.top || '(radice)') === dir).sort((a, b) => b.mtime - a.mtime)
  const secForTop = (t: string) => SECTIONS.find((s) => s.dir && s.dir.split('/')[0] === t)

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('note').dot} title="Note" sub={`${visible.length} note nel vault · ${inbox.length} in Inbox`}>
          <Button icon="plus" onClick={() => st.set('captureOpen', true)}>Nuova nota</Button>
        </PageHead>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card title="Inbox" right={<Badge>{inbox.length} da smistare</Badge>} flush>
          {!inbox.length && <Empty>Inbox vuota. Quello che catturi al volo finisce qui.</Empty>}
          {inbox.slice(0, 12).map((n) => <NoteRow key={n.path} note={n} />)}
        </Card>
        <Card title="Punti di partenza" flush>
          {beta.map((n) => <NoteRow key={n.path} note={n} sub="BETA 80" right={<Tag>lavoro</Tag>} />)}
          {starts.map(([p, l]) => {
            const n = notes.find((x) => x.path === p)!
            return <NoteRow key={p} note={{ ...n, title: l }} right={<Icon name="chev" size={14} className="text-mu" />} />
          })}
        </Card>
        <Card title="Conoscenza" right={<Badge>{know.length}</Badge>} flush>
          {!know.length && <Empty>Ancora niente.</Empty>}
          {know.slice(0, 10).map((n) => <NoteRow key={n.path} note={n} sub={fmStr(n.fm.tipo || n.fm.status) || undefined} />)}
        </Card>
      </div>

      <Card title="Sfoglia" right={<span className="text-[12px] text-mu hidden md:inline">Le note di una sezione sono anche qui</span>}>
        <div className="chips" role="group" aria-label="Cartella">
          <Chip on={dir === '__recent'} onClick={() => setDir('__recent')}>Recenti</Chip>
          {tops.map(([t, k]) => <Chip key={t} on={dir === t} count={k} onClick={() => setDir(t)}>{t}</Chip>)}
        </div>
        {dir !== '__recent' && secForTop(dir) && (
          <button type="button" onClick={() => st.go(secForTop(dir)!.id)} className="self-start text-[13px] text-mu hover:text-tx inline-flex items-center gap-1 cursor-pointer">
            Apri la sezione {secForTop(dir)!.label} <Icon name="chev" size={13} />
          </button>
        )}
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {list.map((n) => (
            <NoteTile key={n.path} note={n} meta={dir === '__recent' ? <><Tag>{n.top || 'radice'}</Tag><span>{new Date(n.mtime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></> : undefined} />
          ))}
        </div>
        {!list.length && <Empty>Ancora niente.</Empty>}
      </Card>
    </div>
  )
}
