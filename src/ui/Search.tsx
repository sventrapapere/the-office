import { useMemo, useState, useEffect, Fragment } from 'react'
import { useBackClose } from '../lib/backstack'
import { Command } from 'cmdk'
import { Dialog } from '@base-ui/react/dialog'
import { useStore, type SectionId } from '../store'
import { SETTINGS_SECTION, sectionOf, orderedSections } from '../sections'
import { Icon, type IconName } from './Icon'
import { Chip, Kbd, IconButton } from './kit'
import { noteDir, type Note } from '../lib/md'
import { INBOX_DIR } from '../lib/checklist'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export interface Hit { note: Note; snip?: string; score: number }

/** Ogni nota compare una volta sola, con la sezione a cui appartiene. Prima i titoli, poi il testo. */
export function searchNotes(notes: Note[], q: string, n = 30, titlesOnly = false): Hit[] {
  const f = fold(q.trim())
  if (!f) return []
  const words = f.split(/\s+/)
  const scored: Hit[] = []
  for (const note of notes) {
    if (note.path.startsWith('_raw/') || note.path.startsWith('_dashboard/')) continue
    const t = fold(note.title)
    const b = titlesOnly ? '' : fold(note.body)
    if (!words.every((w) => t.includes(w) || b.includes(w))) continue
    let score = words.every((w) => t.includes(w)) ? (t === f ? 4 : t.startsWith(f) ? 3 : 2) : 1
    let snip: string | undefined
    const i = b.indexOf(words[0])
    if (i >= 0) {
      const s = Math.max(0, i - 28)
      snip = (s ? '…' : '') + note.body.slice(s, i + 70).replace(/\s+/g, ' ').replace(/[#*_`>[\]]/g, '').trim() + '…'
    } else if (score >= 2) {
      snip = note.body.replace(/^#.*$/gm, '').replace(/^---[\s\S]*?---/, '').replace(/\s+/g, ' ').replace(/[#*_`>[\]]/g, '').trim().slice(0, 70) || undefined
      score += 0
    }
    scored.push({ note, score, snip })
  }
  return scored.sort((a, b) => b.score - a.score || b.note.mtime - a.note.mtime).slice(0, n)
}

/** Evidenzia le parole cercate nel frammento. */
function Hl({ text, q }: { text: string; q: string }) {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return <>{text}</>
  const ft = fold(text)
  const marks: [number, number][] = []
  words.forEach((w) => { let i = ft.indexOf(w); while (i >= 0) { marks.push([i, i + w.length]); i = ft.indexOf(w, i + w.length) } })
  marks.sort((a, b) => a[0] - b[0])
  const out: React.ReactNode[] = []
  let p = 0
  marks.forEach(([a, b], k) => { if (a < p) return; out.push(<Fragment key={'t' + k}>{text.slice(p, a)}</Fragment>, <mark key={'m' + k} className="hit">{text.slice(a, b)}</mark>); p = b })
  out.push(text.slice(p))
  return <>{out}</>
}

type Scope = 'all' | 'titles' | SectionId

function Palette({ onDone, phone }: { onDone: () => void; phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const settings = useStore((s) => s.settings)
  const st = useStore.getState()
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const scopes: { id: Scope; label: string }[] = [
    { id: 'all', label: 'Ovunque' },
    { id: 'note', label: 'Note' },
    ...orderedSections(settings).filter((s) => s.dir).map((s) => ({ id: s.id as Scope, label: s.label })),
    { id: 'titles', label: 'Solo titoli' },
  ]
  const pool = useMemo(() => (scope === 'all' || scope === 'titles' ? notes : scope === 'note' ? notes.filter((n) => sectionOf(n.path).id === 'note') : notes.filter((n) => sectionOf(n.path).id === scope)), [notes, scope])
  const hits = useMemo(() => searchNotes(pool, q, 40, scope === 'titles'), [pool, q, scope])
  const fq = fold(q.trim())
  const nav = [...orderedSections(settings), SETTINGS_SECTION].filter((s) => fq && fold(s.label).includes(fq))
  const theme = settings.theme
  type Action = { id: string; icon: IconName; label: string; kbd?: string; run: () => void }
  const create = async () => {
    const title = q.trim().replace(/[\\/:*?"<>|#^[\]]/g, '') || 'Nuova nota'
    await st.createNote(`${INBOX_DIR}/${title}.md`, `---\ncreated: ${new Date().toISOString().slice(0, 10)}\nstatus: inbox\n---\n\n# ${title}\n\n`, { edit: true, label: 'Nota creata' })
  }
  const all: Action[] = [
    ...(q.trim() ? [{ id: 'crea', icon: 'plus' as IconName, label: `Crea la nota “${q.trim()}”`, kbd: 'Ctrl Invio', run: create }] : []),
    { id: 'cattura', icon: 'inbox', label: 'Cattura veloce', kbd: 'Ctrl N', run: () => st.set('captureOpen', true) },
    { id: 'claude', icon: 'claude', label: 'Chiedi a Claude', kbd: 'Ctrl J', run: () => st.set('claudeOpen', true) },
    { id: 'tema', icon: theme === 'light' ? 'moon' : 'sun', label: theme === 'light' ? 'Passa al tema scuro' : 'Passa al tema chiaro', run: () => st.saveSettings({ theme: theme === 'light' ? 'dark' : 'light' }) },
  ]
  const actions = all.filter((a) => a.id === 'crea' || !fq || fold(a.label).includes(fq))
  const run = (fn: () => void) => { onDone(); setTimeout(fn, 0) }
  const item = 'flex items-center px-3 min-h-[48px] rounded-lg cursor-pointer text-[14px] data-[selected=true]:bg-s3'
  const ordIdx = (id: SectionId) => orderedSections(settings).findIndex((s) => s.id === id) + 1

  return (
    <Command shouldFilter={false} loop label="Cerca o esegui un comando" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && q.trim()) { e.preventDefault(); run(create) } }}>
      <div className="p-3 pb-2">
        <div className="flex items-center gap-3 h-[52px] px-4 rounded-xl border-[1.5px] border-ac bg-s1">
          {phone ? <IconButton icon="back" label="Chiudi" size={32} onClick={onDone} className="-ml-2" /> : <Icon name="search" size={18} className="text-tx" />}
          <Command.Input value={q} onValueChange={setQ} placeholder="Cerca note, sezioni, comandi…" className="flex-1 min-w-0 h-full bg-transparent outline-none border-0 text-[17px] text-tx placeholder:text-mu" />
          {phone ? q && <IconButton icon="close" label="Svuota" size={32} onClick={() => setQ('')} /> : <Kbd>Esc</Kbd>}
        </div>
        <div className="chips mt-2.5" role="group" aria-label="Dove cercare">
          {scopes.map((s) => <Chip key={s.id} on={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</Chip>)}
        </div>
      </div>
      <Command.List className="max-h-[min(58vh,470px)] overflow-y-auto px-2 pb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-mu">
        {q.trim() && !hits.length && <div className="px-3 py-4 text-mu text-[13px]">Nessuna nota per “{q}”{scope !== 'all' ? ' in questa sezione' : ''}.</div>}
        {hits.length > 0 && (
          <Command.Group heading={`Risultati · ${hits.length}`}>
            {hits.map(({ note, snip }) => {
              const s = sectionOf(note.path)
              const dir = noteDir(note.path)
              return (
                <Command.Item key={note.path} value={'n:' + note.path} onSelect={() => run(() => st.open(note.path))} className={item}>
                  <div className="flex items-center gap-3.5 min-w-0 w-full py-1.5">
                    <Icon name={s.icon} size={17} className="text-mu flex-none" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-semibold"><Hl text={note.title} q={q} /></div>
                      {snip && <div className="truncate text-[13px] text-mu"><Hl text={snip} q={q} /></div>}
                    </div>
                    <span className="text-[12px] text-mu whitespace-nowrap self-start pt-0.5 hidden sm:inline">{s.label}{s.id === 'note' && dir ? ' · ' + dir.split('/')[0] : ''}</span>
                  </div>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}
        {!q.trim() && (
          <Command.Group heading="Vai a">
            {[...orderedSections(settings), SETTINGS_SECTION].map((s) => (
              <Command.Item key={s.id} value={'s:' + s.id} onSelect={() => run(() => st.go(s.id))} className={item}>
                <Icon name={s.icon} size={17} className="text-mu mr-3.5" />
                <span className="flex-1">{s.label}</span>
                {s.id !== 'impostazioni' && !phone && <Kbd>Alt {ordIdx(s.id)}</Kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {(nav.length > 0 || actions.length > 0) && (
          <Command.Group heading="Comandi">
            {nav.map((s) => (
              <Command.Item key={s.id} value={'s:' + s.id} onSelect={() => run(() => st.go(s.id))} className={item}>
                <Icon name={s.icon} size={17} className="text-mu mr-3.5" />
                <span className="flex-1">Vai a {s.label}</span>
                {s.id !== 'impostazioni' && !phone && <Kbd>Alt {ordIdx(s.id)}</Kbd>}
              </Command.Item>
            ))}
            {actions.map((a) => (
              <Command.Item key={a.id} value={'a:' + a.id} onSelect={() => run(a.run)} className={item}>
                <Icon name={a.icon} size={17} className="text-mu mr-3.5" />
                <span className="flex-1">{a.label}</span>
                {a.kbd && !phone && <Kbd>{a.kbd}</Kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      {!phone && (
        <div className="flex items-center gap-4 px-5 h-10 border-t border-ln text-[12px] text-mu">
          <span>↑ ↓ per muoverti</span><span>Invio apre</span><span className="truncate">Ogni nota compare una volta sola, con la sezione in cui si trova</span>
        </div>
      )}
    </Command>
  )
}

export function SearchDialog() {
  const open = useStore((s) => s.searchOpen)
  const set = useStore((s) => s.set)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches)
  useEffect(() => { if (open) setWide(matchMedia('(min-width: 900px)').matches) }, [open])
  const close = (o: boolean) => set('searchOpen', o)
  useBackClose(open, () => close(false))
  return (
    <Dialog.Root open={open} onOpenChange={(o) => close(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dlg-backdrop" />
        <Dialog.Popup className={wide ? 'dlg-popup !top-[9vh] !w-[min(740px,calc(100vw-32px))] overflow-hidden' : 'fixed inset-0 z-[51] bg-bg pt-[env(safe-area-inset-top)] outline-none'}>
          <Dialog.Title className="sr-only">Cerca</Dialog.Title>
          {open && <Palette onDone={() => close(false)} phone={!wide} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

