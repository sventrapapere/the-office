import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { section, SECTIONS } from '../sections'
import { Card, Chip, PageHead, Badge, Button, Empty, MoreMenu, relTime } from '../ui/kit'
import { NoteTile } from '../ui/notes'
import { Icon } from '../ui/Icon'
import type { Note } from '../lib/md'
import { INBOX_DIR, todayKey } from '../lib/checklist'

const HIDDEN_TOP = new Set(['_raw', '_dashboard', '_posters', '_templates'])
const STARTS: [string, string][] = [
  ['MOC.md', 'Indice generale'],
  ['01 BETA 80/MOC.md', 'BETA 80'],
  ['03 Conoscenza/_INDEX.md', 'Conoscenza'],
  ['70 Ricette/_INDEX.md', 'Indice ricette'],
  ['10 Giappone/Giappone - MOC.md', 'Giappone'],
  ['55 Miniature/Miniature - MOC.md', 'Miniature'],
  ['Come usare questo vault.md', 'Come usare il vault'],
]
type View = 'tutto' | 'inbox' | 'partenza' | 'conoscenza' | 'cartelle'

const linkCount = (n: Note) => (n.body.match(/\[\[[^\]]+\]\]/g) || []).length
const firstTag = (n: Note) => {
  const t = n.fm.tags
  const arr = Array.isArray(t) ? t : typeof t === 'string' ? t.split(/[,\s]+/) : []
  return arr.map((x) => String(x).replace(/^#/, '')).find((x) => x && !['conoscenza', 'nota', 'note'].includes(x))
}

function folderSummary(notes: Note[], dir: string) {
  const ns = inDir(notes, dir)
  const s = SECTIONS.find((x) => x.dir && x.dir.split('/')[0] === dir)
  if (dir === '04 Checklist') return { n: ns.length, sub: ns.map((x) => x.title).slice(0, 2).join(' · '), s }
  const unit = s?.id === 'film' || s?.id === 'libri' ? 'titoli' : s?.id === 'ricette' ? 'ricette' : 'note'
  const cnt = s?.dir ? inDir(notes, s.dir).filter((x) => !x.name.startsWith('_')).length : ns.length
  return { n: ns.length, sub: `${cnt} ${cnt === 1 && unit === 'note' ? 'nota' : unit}`, s }
}

/** Contenuto di una cartella: sottocartelle e note. */
function FolderView({ dir, onDir }: { dir: string; onDir: (d: string | null) => void }) {
  const notes = useStore((s) => s.notes)
  const depth = dir.split('/').length
  const inside = inDir(notes, dir)
  const subs = [...new Set(inside.filter((n) => n.path.split('/').length > depth + 1).map((n) => n.path.split('/').slice(0, depth + 1).join('/')))].sort((a, b) => a.localeCompare(b, 'it'))
  const direct = inside.filter((n) => n.path.split('/').length === depth + 1).sort((a, b) => b.mtime - a.mtime)
  const parts = dir.split('/')
  return (
    <Card title={
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <button type="button" className="text-mu hover:text-tx cursor-pointer" onClick={() => onDir(null)}>Cartelle</button>
        {parts.map((p, i) => (
          <span key={i} className="inline-flex items-center gap-1.5"><Icon name="chev" size={12} className="text-mu" />
            <button type="button" className={i === parts.length - 1 ? '' : 'text-mu hover:text-tx cursor-pointer'} onClick={() => onDir(parts.slice(0, i + 1).join('/'))}>{p}</button>
          </span>
        ))}
      </span>
    } right={<Badge>{inside.length} note</Badge>}>
      {subs.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {subs.map((d) => (
            <button key={d} type="button" onClick={() => onDir(d)} className="press flex items-center gap-3 min-h-[52px] px-3.5 rounded-lg bg-s2 text-left cursor-pointer hov">
              <Icon name="folder" size={16} className="text-mu" />
              <span className="flex-1 min-w-0"><span className="block truncate font-medium">{d.split('/').pop()}</span><span className="block text-[12px] text-mu">{inDir(notes, d).length} note</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {direct.map((n) => <NoteTile key={n.path} note={n} />)}
      </div>
      {!direct.length && !subs.length && <Empty>Cartella vuota.</Empty>}
    </Card>
  )
}

export default function NoteView({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [view, setView] = useState<View>('tutto')
  const [dir, setDir] = useState<string | null>(null)
  const visible = notes.filter((n) => !HIDDEN_TOP.has(n.top))
  const inbox = useMemo(() => inDir(notes, INBOX_DIR).sort((a, b) => b.mtime - a.mtime), [notes])
  const know = useMemo(() => inDir(notes, '03 Conoscenza').filter((n) => !n.name.startsWith('_')).sort((a, b) => b.mtime - a.mtime), [notes])
  const starts = STARTS.map(([p, l]) => [notes.find((n) => n.path === p), l] as const).filter((x): x is readonly [Note, string] => !!x[0])
  const tops = useMemo(() => [...new Set(visible.filter((n) => n.top).map((n) => n.top))].sort((a, b) => a.localeCompare(b, 'it')), [visible])
  const moveTargets = useMemo(() => {
    const s = new Set<string>()
    notes.forEach((n) => { const p = n.path.split('/'); for (let i = 1; i < Math.min(p.length, 3); i++) s.add(p.slice(0, i).join('/')) })
    return [...s].filter((d) => !/^(_|\.|00 Inbox|04 Checklist)/.test(d)).sort((a, b) => a.localeCompare(b, 'it'))
  }, [notes])
  const newNote = () => st.createNote(`${INBOX_DIR}/Nuova nota ${todayKey()}.md`, `---\ncreated: ${todayKey()}\nstatus: inbox\n---\n\n# Nuova nota\n\n`, { edit: true, label: 'Nota creata' })
  const show = (v: View) => view === 'tutto' || view === v

  const inboxCard = (
    <Card title="Inbox" right={<Badge>{inbox.length} da smistare</Badge>}>
      {!inbox.length && <Empty>Inbox vuota. Quello che catturi al volo finisce qui.</Empty>}
      {inbox.slice(0, view === 'inbox' ? 100 : 6).map((n) => (
        <div key={n.path} className="flex items-center gap-3 min-h-[64px] pl-3.5 pr-2 py-2 rounded-lg bg-s2">
          <button type="button" onClick={() => st.open(n.path)} className="flex-1 min-w-0 text-left cursor-pointer">
            <span className="block truncate">{n.title.replace(/^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} — /, '')}</span>
            <span className="block text-[12px] text-mu">{relTime(n.mtime)}</span>
          </button>
          <MoreMenu label={'Sposta: ' + n.title} items={moveTargets.map((d) => ({ label: d, icon: 'folder' as const, onClick: () => st.moveNote(n.path, d) }))}
            trigger={phone ? <button type="button" className="press w-10 h-10 rounded-lg border border-ln bg-s1 flex items-center justify-center cursor-pointer"><Icon name="folder" size={16} /></button>
              : <button type="button" className="press h-9 px-3 rounded-lg border border-ln bg-s1 inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer hov"><Icon name="folder" size={15} />Sposta in…</button>} />
        </div>
      ))}
      {view !== 'inbox' && inbox.length > 6 && <Button variant="link" onClick={() => setView('inbox')}>Tutte le {inbox.length}</Button>}
    </Card>
  )

  const knowCard = (
    <Card title="Conoscenza" right={<button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => { setView('cartelle'); setDir('03 Conoscenza') }}>Tutte</button>} flush>
      {!know.length && <Empty>Ancora niente.</Empty>}
      {know.slice(0, view === 'conoscenza' ? 100 : 6).map((n) => {
        const t = firstTag(n)
        return (
          <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-3 min-h-[56px] px-1.5 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
            <span className="flex-1 min-w-0 truncate">{n.title}</span>
            {t && <span className="text-[12px] text-mu px-1.5 py-0.5 rounded-md bg-s2 whitespace-nowrap">#{t}</span>}
          </button>
        )
      })}
    </Card>
  )

  const startsCard = (
    <Card title="Punti di partenza">
      <div className={phone ? 'flex gap-2 overflow-x-auto -mx-1 px-1 pb-1' : 'grid gap-2.5'} style={phone ? undefined : { gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {starts.map(([n, l]) => {
          const k = linkCount(n)
          return (
            <button key={n.path} type="button" onClick={() => st.open(n.path)} className={'press flex flex-col items-start gap-1 p-4 rounded-lg bg-s2 text-left cursor-pointer hov ' + (phone ? 'min-w-[150px]' : 'min-h-[118px]')}>
              <Icon name="compass" size={18} className="mb-auto" />
              <span className="font-semibold mt-5">{l}</span>
              <span className="text-[12px] text-mu">{/moc|index/i.test(n.name) ? 'MOC' : 'Guida'}{k ? ` · ${k} collegamenti` : ''}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )

  const foldersCard = dir ? <FolderView dir={dir} onDir={setDir} /> : (
    <Card title={phone ? 'Cartelle' : 'Sfoglia per cartella'} right={!phone && <span className="text-[12px] text-mu pr-2">Le cartelle con una sezione si aprono anche da lì</span>}>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {tops.map((t) => {
          const f = folderSummary(notes, t)
          return (
            <div key={t} className="flex items-center gap-3 min-h-[76px] px-4 py-2.5 rounded-lg bg-s2 hov">
              <button type="button" onClick={() => setDir(t)} className="contents cursor-pointer text-left">
                <Icon name="folder" size={17} className="text-mu flex-none" />
              </button>
              <span className="flex-1 min-w-0">
                <button type="button" onClick={() => setDir(t)} className="block w-full text-left cursor-pointer">
                  <span className="block truncate font-semibold">{t}</span>
                  <span className="block truncate text-[12px] text-mu">{f.sub}</span>
                </button>
                {f.s && !phone && <button type="button" onClick={() => st.go(f.s!.id)} className="text-[13px] text-ac font-semibold inline-flex items-center gap-0.5 cursor-pointer hover:underline">Sezione {f.s.label}<Icon name="chev" size={13} stroke={2.4} /></button>}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('note').dot} title="Note" sub={`Tutte le ${visible.length} note del vault · ${inbox.length} in Inbox`}>
          <Button variant="primary" icon="plus" onClick={newNote}>Nuova nota</Button>
        </PageHead>
      )}
      <div className="chips" role="group" aria-label="Mostra">
        <Chip on={view === 'tutto'} onClick={() => { setView('tutto'); setDir(null) }}>Tutto</Chip>
        <Chip on={view === 'inbox'} onClick={() => setView('inbox')}>Inbox · {inbox.length}</Chip>
        <Chip on={view === 'partenza'} onClick={() => setView('partenza')}>Punti di partenza</Chip>
        <Chip on={view === 'conoscenza'} onClick={() => setView('conoscenza')}>Conoscenza</Chip>
        <Chip on={view === 'cartelle'} onClick={() => setView('cartelle')}>Cartelle</Chip>
      </div>
      {view === 'tutto' && !phone ? (
        <>
          <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>{inboxCard}{knowCard}</div>
          {startsCard}
          {foldersCard}
        </>
      ) : (
        <>
          {show('inbox') && inboxCard}
          {show('partenza') && startsCard}
          {show('cartelle') && foldersCard}
          {show('conoscenza') && knowCard}
        </>
      )}
    </div>
  )
}
