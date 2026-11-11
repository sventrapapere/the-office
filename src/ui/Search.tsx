import { useMemo, useState, useEffect } from 'react'
import { Command } from 'cmdk'
import { useStore } from '../store'
import { SECTIONS, SETTINGS_SECTION, sectionOf } from '../sections'
import { Icon, type IconName } from './Icon'
import { Dot, Kbd } from './kit'
import { Modal, Sheet } from './Sheet'
import type { Note } from '../lib/md'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Ogni nota compare una volta sola, con la sezione a cui appartiene. Prima i titoli, poi il testo. */
export function searchNotes(notes: Note[], q: string, n = 30): { note: Note; snip?: string }[] {
  const f = fold(q.trim())
  if (!f) return []
  const words = f.split(/\s+/)
  const scored: { note: Note; score: number; snip?: string }[] = []
  for (const note of notes) {
    if (note.path.startsWith('_raw/')) continue
    const t = fold(note.title)
    const b = fold(note.body)
    if (!words.every((w) => t.includes(w) || b.includes(w))) continue
    let score = words.every((w) => t.includes(w)) ? (t.startsWith(f) ? 3 : 2) : 0
    let snip: string | undefined
    if (score < 2) {
      const i = b.indexOf(words[0])
      if (i >= 0) {
        const s = Math.max(0, i - 40)
        snip = (s ? '…' : '') + note.body.slice(s, i + 80).replace(/\s+/g, ' ').trim() + '…'
      }
      score = 1
    }
    scored.push({ note, score, snip })
  }
  return scored.sort((a, b) => b.score - a.score || b.note.mtime - a.note.mtime).slice(0, n)
}

function Row({ icon, dot, title, sub, right }: { icon?: IconName; dot?: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0 w-full">
      {dot ? <Dot color={dot} size={7} /> : icon ? <Icon name={icon} size={16} className="text-mu" /> : null}
      <div className="flex-1 min-w-0">
        <div className="truncate">{title}</div>
        {sub && <div className="truncate text-[12px] text-mu">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function Palette({ onDone }: { onDone: () => void }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [q, setQ] = useState('')
  const hits = useMemo(() => searchNotes(notes, q), [notes, q])
  const fq = fold(q.trim())
  const nav = [...SECTIONS, SETTINGS_SECTION].filter((s) => !fq || fold(s.label).includes(fq))
  const theme = st.settings.theme
  type Action = { id: string; icon: IconName; label: string; kbd?: string; run: () => void }
  const all: Action[] = [
    { id: 'cattura', icon: 'plus', label: 'Nuova nota in Inbox', kbd: 'Ctrl N', run: () => st.set('captureOpen', true) },
    { id: 'claude', icon: 'claude', label: 'Chiedi a Claude', kbd: 'Ctrl J', run: () => st.set('claudeOpen', true) },
    { id: 'tema', icon: theme === 'light' ? 'moon' : 'sun', label: theme === 'light' ? 'Passa al tema scuro' : 'Passa al tema chiaro', run: () => st.saveSettings({ theme: theme === 'light' ? 'dark' : 'light' }) },
  ]
  const actions = all.filter((a) => !fq || fold(a.label).includes(fq))
  const run = (fn: () => void) => { onDone(); setTimeout(fn, 0) }
  const item = 'flex items-center px-3 min-h-[44px] rounded-lg mx-1.5 cursor-pointer text-[14px]'

  return (
    <Command shouldFilter={false} loop label="Cerca o esegui un comando">
      <div className="flex items-center gap-2.5 px-4 border-b border-ln">
        <Icon name="search" size={17} className="text-mu" />
        <Command.Input value={q} onValueChange={setQ} placeholder="Cerca note, sezioni, comandi…" className="flex-1 h-[52px] bg-transparent outline-none border-0 text-[15px] text-tx placeholder:text-mu" />
        <span className="hidden md:inline"><Kbd>Esc</Kbd></span>
      </div>
      <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto py-1.5">
        <Command.Empty className="px-4 py-6 text-mu text-[13px]">Nessun risultato per “{q}”.</Command.Empty>
        {hits.length > 0 && (
          <Command.Group heading={`Note · ${hits.length}`}>
            {hits.map(({ note, snip }) => {
              const s = sectionOf(note.path)
              return (
                <Command.Item key={note.path} value={'n:' + note.path} onSelect={() => run(() => st.open(note.path))} className={item}>
                  <Row dot={s.dot} title={note.title} sub={snip || note.path.replace(/\.md$/, '')} right={<span className="text-[12px] text-mu whitespace-nowrap">{s.label}</span>} />
                </Command.Item>
              )
            })}
          </Command.Group>
        )}
        {nav.length > 0 && (
          <Command.Group heading="Vai a">
            {nav.map((s, i) => (
              <Command.Item key={s.id} value={'s:' + s.id} onSelect={() => run(() => st.go(s.id))} className={item}>
                <Row icon={s.icon} title={s.label} right={i < SECTIONS.length && s.id !== 'impostazioni' ? <Kbd>Alt {SECTIONS.indexOf(s) + 1}</Kbd> : undefined} />
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {actions.length > 0 && (
          <Command.Group heading="Azioni">
            {actions.map((a) => (
              <Command.Item key={a.id} value={'a:' + a.id} onSelect={() => run(a.run)} className={item}>
                <Row icon={a.icon} title={a.label} right={a.kbd ? <span className="hidden md:inline"><Kbd>{a.kbd}</Kbd></span> : undefined} />
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  )
}

export function SearchDialog() {
  const open = useStore((s) => s.searchOpen)
  const set = useStore((s) => s.set)
  const [wide, setWide] = useState(() => matchMedia('(min-width: 900px)').matches)
  useEffect(() => { if (open) setWide(matchMedia('(min-width: 900px)').matches) }, [open])
  const close = (o: boolean) => set('searchOpen', o)
  return wide ? (
    <Modal open={open} onOpenChange={close} title="Cerca" hideTitle>
      {open && <Palette onDone={() => close(false)} />}
    </Modal>
  ) : (
    <Sheet open={open} onOpenChange={close} title="Cerca" hideTitle>
      {open && <Palette onDone={() => close(false)} />}
    </Sheet>
  )
}
