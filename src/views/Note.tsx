import { useMemo, useState } from 'react'
import { useStore, inDir } from '../store'
import { useBackClose } from '../lib/backstack'
import { section, SECTIONS } from '../sections'
import { Kbd, Card, Chip, PageHead, Badge, Button, Empty, MoreMenu, relTime } from '../ui/kit'
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

const plural = (n: number) => `${n} ${n === 1 ? 'nota' : 'note'}`

/** Sezione del telefono: titoletto e contenuto, senza riquadro (come nella tavola). */
function Sect({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2 px-1"><h2 className="m-0 flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mu">{title}</h2>{right}</div>
      {children}
    </section>
  )
}

function folderSummary(notes: Note[], dir: string) {
  const ns = inDir(notes, dir)
  const s = SECTIONS.find((x) => x.dir && x.dir.split('/')[0] === dir)
  if (dir === '04 Checklist') return { n: ns.length, sub: ns.map((x) => x.title).slice(0, 2).join(' · '), s }
  const unit: [string, string] = s?.id === 'film' || s?.id === 'libri' ? ['titolo', 'titoli'] : s?.id === 'ricette' ? ['ricetta', 'ricette'] : ['nota', 'note']
  const cnt = s?.dir ? inDir(notes, s.dir).filter((x) => !x.name.startsWith('_')).length : ns.length
  return { n: ns.length, sub: `${cnt} ${unit[cnt === 1 ? 0 : 1]}`, s }
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
    } right={<Badge>{plural(inside.length)}</Badge>}>
      {subs.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {subs.map((d) => (
            <button key={d} type="button" onClick={() => onDir(d)} className="press flex items-center gap-3 min-h-[52px] px-3.5 rounded-lg bg-s2 text-left cursor-pointer hov">
              <Icon name="folder" size={16} className="text-mu" />
              <span className="flex-1 min-w-0"><span className="block truncate font-medium">{d.split('/').pop()}</span><span className="block text-[12px] text-mu">{plural(inDir(notes, d).length)}</span></span>
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
  const [dir, setDirRaw] = useState<string | null>(null)
  // la cartella si apre al suo posto; indietro risale di un livello
  const setDir = setDirRaw
  useBackClose(!!dir, () => setDirRaw(dir && dir.includes('/') ? dir.split('/').slice(0, -1).join('/') : null), dir)
  const [tag, setTag] = useState<string | null>(null)
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
    <Card title="Inbox" plain={phone} className={'h-full' + (view === 'tutto' ? phone ? ' min-h-[220px]' : ' min-h-[460px]' : '')} bodyClass={phone ? 'px-3 pb-3 gap-2 flex-1' : 'flex-1'} right={<Badge>{phone ? inbox.length : inbox.length + ' da smistare'}</Badge>}>
      {!inbox.length && <Empty icon="inbox">Inbox vuota. Quello che catturi al volo finisce qui.</Empty>}
      {inbox.slice(0, view === 'inbox' ? 100 : 7).map((n) => (
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
      {view !== 'inbox' && inbox.length > 7 && <Button variant="link" onClick={() => setView('inbox')}>Tutte le {inbox.length}</Button>}
      {inbox.length > 0 && inbox.length < 5 && (
        <button type="button" onClick={() => st.set('captureOpen', true)} className="flex-1 min-h-[64px] flex flex-col items-center justify-center gap-1.5 px-3.5 rounded-lg border border-dashed border-ln text-mu text-[13px] cursor-pointer hov">
          <Icon name="plus" size={18} /><span>Cattura un'idea al volo</span>{!phone && <Kbd>Ctrl N</Kbd>}
        </button>
      )}
    </Card>
  )

  const tags = useMemo(() => {
    const c = new Map<string, number>()
    know.forEach((n) => { const t = firstTag(n); if (t) c.set(t, (c.get(t) || 0) + 1) })
    return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'))
  }, [know])
  const full = view === 'conoscenza'
  const knowList = know.filter((n) => !full || !tag || firstTag(n) === tag).slice(0, full ? 200 : 7)
  const knowRows = (
    <>
      {!know.length && <Empty icon="note">Ancora niente.</Empty>}
      {knowList.map((n) => {
        const t = firstTag(n)
        return (
          <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-3 min-h-[56px] px-1.5 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
            <span className="flex-1 min-w-0 truncate">{n.title}</span>
            {t && <span className={'text-[12px] px-1.5 py-0.5 rounded-md whitespace-nowrap ' + (tag === t ? 'bg-ac/15 text-ac' : 'bg-s2 text-mu')}>#{t}</span>}
          </button>
        )
      })}
    </>
  )
  const allKnow = <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => setView('conoscenza')}>Tutte · {know.length}</button>
  const knowCard = (
    <Card title="Conoscenza" className="h-full" right={!full && allKnow} flush>
      {full && tags.length > 1 && (
        <div className="chips py-2.5 border-b border-ln" role="group" aria-label="Argomento">
          <Chip on={!tag} onClick={() => setTag(null)}>Tutti</Chip>
          {tags.map(([t, k]) => <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t} · {k}</Chip>)}
        </div>
      )}
      {knowRows}
    </Card>
  )

  // colonne bilanciate: niente riquadro solo in fondo (6 → 3+3, 5 → 3+2…)
  const startCols = starts.length <= 4 ? starts.length : starts.length <= 6 ? 3 : 4
  const startTiles = starts.map(([n, l]) => {
    const k = linkCount(n)
    return phone ? (
      <button key={n.path} type="button" onClick={() => st.open(n.path)} className="press flex flex-col items-start justify-between gap-3 min-w-[150px] min-h-[80px] p-3.5 rounded-xl bg-s2 text-left cursor-pointer">
        <Icon name="compass" size={18} /><span className="font-semibold truncate max-w-full">{l}</span>
      </button>
    ) : (
      <button key={n.path} type="button" onClick={() => st.open(n.path)} className="press flex flex-col items-start gap-1 p-4 min-h-[124px] rounded-lg bg-s2 text-left cursor-pointer hov">
        <Icon name="compass" size={18} className="mb-auto" />
        <span className="font-semibold mt-5">{l}</span>
        <span className="text-[12px] text-mu">{/moc|index/i.test(n.name) ? 'MOC' : 'Guida'}{k ? ` · ${k} collegamenti` : ''}</span>
      </button>
    )
  })
  const startsCard = phone ? (
    <Sect title="Punti di partenza"><div className="flex gap-2 overflow-x-auto -mx-3 px-3 pb-1">{startTiles}</div></Sect>
  ) : (
    <Card title="Punti di partenza">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${startCols}, minmax(0, 1fr))` }}>{startTiles}</div>
    </Card>
  )

  const folderTiles = (
    <div className="grid gap-2" style={{ gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))' }}>
      {tops.map((t) => {
        const f = folderSummary(notes, t)
        return phone ? (
          <button key={t} type="button" onClick={() => setDir(t)} className="press flex items-center gap-3 min-h-[56px] px-3 rounded-xl bg-s1 text-left cursor-pointer">
            <Icon name="folder" size={16} className="text-mu flex-none" />
            <span className="flex-1 min-w-0"><span className="block truncate font-semibold text-[14px]">{t}</span><span className="block truncate text-[12px] text-mu">{f.sub}</span></span>
          </button>
        ) : (
          <div key={t} className="flex items-center gap-3 min-h-[76px] px-4 py-2.5 rounded-lg bg-s2 hov">
            <button type="button" onClick={() => setDir(t)} className="contents cursor-pointer text-left">
              <Icon name="folder" size={17} className="text-mu flex-none" />
            </button>
            <span className="flex-1 min-w-0">
              <button type="button" onClick={() => setDir(t)} className="block w-full text-left cursor-pointer">
                <span className="block truncate font-semibold">{t}</span>
                <span className="block truncate text-[12px] text-mu">{f.sub}</span>
              </button>
              {f.s && <button type="button" onClick={() => st.go(f.s!.id)} className="text-[13px] text-ac font-semibold inline-flex items-center gap-0.5 cursor-pointer hover:underline">Sezione {f.s.label}<Icon name="chev" size={13} stroke={2.4} /></button>}
            </span>
          </div>
        )
      })}
    </div>
  )
  const foldersCard = dir ? <FolderView dir={dir} onDir={setDir} /> : phone ? <Sect title="Cartelle">{folderTiles}</Sect> : (
    <Card title="Sfoglia per cartella" right={<span className="text-[12px] text-mu pr-2">Le cartelle con una sezione si aprono anche da lì</span>}>{folderTiles}</Card>
  )
  const knowSect = phone && !full ? <Sect title="Conoscenza" right={allKnow}><div className="flex flex-col px-3 py-1 rounded-xl border border-ln bg-s1">{knowRows}</div></Sect> : knowCard

  return (
    <div className={phone ? 'flex flex-col gap-5' : 'flex flex-col gap-4'}>
      {!phone && (
        <PageHead dot={section('note').dot} title="Note" sub={`Tutte le ${visible.length} note del vault · ${inbox.length} in Inbox`}>
          <Button variant="primary" icon="plus" onClick={newNote}>Nuova nota</Button>
        </PageHead>
      )}
      <div className="chips" role="group" aria-label="Mostra">
        <Chip on={view === 'tutto'} onClick={() => { setView('tutto'); setDirRaw(null) }}>Tutto</Chip>
        <Chip on={view === 'inbox'} onClick={() => setView('inbox')}>Inbox · {inbox.length}</Chip>
        <Chip on={view === 'partenza'} onClick={() => setView('partenza')}>Punti di partenza</Chip>
        <Chip on={view === 'conoscenza'} onClick={() => { setView('conoscenza'); setTag(null) }}>Conoscenza</Chip>
        <Chip on={view === 'cartelle'} onClick={() => { setView('cartelle'); setDirRaw(null) }}>Cartelle</Chip>
      </div>
      {view === 'tutto' && !phone ? (
        <>
          <div className="grid gap-4 items-stretch" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>{inboxCard}{knowCard}</div>
          {startsCard}
          {foldersCard}
        </>
      ) : (
        <>
          {show('inbox') && inboxCard}
          {show('partenza') && startsCard}
          {show('cartelle') && foldersCard}
          {show('conoscenza') && knowSect}
        </>
      )}
    </div>
  )
}
