import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Modal, Sheet } from './Sheet'
import { Button, Seg, Kbd, Chip } from './kit'
import { Icon } from './Icon'
import { INBOX_DIR, todayKey, ymd, addDays, type Kind } from '../lib/checklist'

/** Cattura veloce: nota (in Inbox o in un'altra cartella), cosa da fare con scadenza, voce della spesa. */
function Form({ onDone, phone }: { onDone: () => void; phone?: boolean }) {
  const capture = useStore((s) => s.capture)
  const notes = useStore((s) => s.notes)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'nota' | Kind>('nota')
  const [dir, setDir] = useState(INBOX_DIR)
  const [pick, setPick] = useState(false)
  const [due, setDue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60) }, [kind])
  const dirs = useMemo(() => {
    const s = new Set<string>()
    notes.forEach((n) => { const p = n.path.split('/'); for (let i = 1; i < Math.min(p.length, 3); i++) s.add(p.slice(0, i).join('/')) })
    return [...s].filter((d) => !/^(_|\.|04 Checklist)/.test(d)).sort((a, b) => a.localeCompare(b, 'it'))
  }, [notes])
  const save = async () => {
    if (!text.trim()) return
    onDone()
    await capture(text, kind, { dir, due: due || undefined })
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-3 px-4 pb-4">
      <Seg label="Cosa catturare" value={kind} onChange={(k) => { setKind(k); setPick(false) }} options={[{ id: 'nota', label: 'Nota' }, { id: 'todo', label: 'Da fare' }, { id: 'spesa', label: 'Spesa' }]} />
      <label className="flex flex-col gap-1 rounded-[10px] border-[1.5px] border-ac bg-s1 px-3 pt-2 pb-1">
        <span className="text-[11px] font-semibold text-ac">Testo</span>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || kind !== 'nota')) { e.preventDefault(); save() } }}
          rows={kind === 'nota' ? 4 : 2}
          placeholder={kind === 'nota' ? 'Un’idea, un link… la prima riga diventa il titolo.' : kind === 'todo' ? 'Cosa devi fare?' : 'Cosa devi comprare?'}
          className="w-full resize-none bg-transparent text-[15px] text-tx outline-none placeholder:text-mu leading-relaxed"
        />
      </label>
      {kind === 'nota' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-mu mr-1">Salva in</span>
            <Chip on={dir === INBOX_DIR} onClick={() => { setDir(INBOX_DIR); setPick(false) }}>{INBOX_DIR}</Chip>
            {dir !== INBOX_DIR && <Chip on onClick={() => setPick(true)}>{dir}</Chip>}
            <Chip icon="folder" onClick={() => setPick((v) => !v)}>Altra cartella</Chip>
          </div>
          {pick && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-ln bg-s2 p-1">
              {dirs.map((d) => (
                <button key={d} type="button" onClick={() => { setDir(d); setPick(false) }} className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-left text-[13px] hov cursor-pointer" style={{ paddingLeft: 8 + (d.split('/').length - 1) * 16 }}>
                  <Icon name="folder" size={14} className="text-mu" />{d.split('/').pop()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {kind === 'todo' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-mu mr-1">Scadenza</span>
          <Chip on={!due} onClick={() => setDue('')}>Nessuna</Chip>
          <Chip on={due === todayKey()} onClick={() => setDue(todayKey())}>Oggi</Chip>
          <Chip on={due === ymd(addDays(new Date(), 1))} onClick={() => setDue(ymd(addDays(new Date(), 1)))}>Domani</Chip>
          <input type="date" aria-label="Scegli la data" value={due} onChange={(e) => setDue(e.target.value)} className="h-[30px] px-2 rounded-[7px] border border-ln bg-s1 text-[13px] text-tx" />
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[12px] text-mu flex-1 hidden md:inline">{kind === 'nota' ? <>Salva con <Kbd>Ctrl Invio</Kbd></> : <>Salva con <Kbd>Invio</Kbd></>}</span>
        <span className="flex-1 md:hidden" />
        <Button variant="ghost" onClick={onDone} className="!text-ac">Annulla</Button>
        <Button variant="accent" type="submit" size={phone ? 'lg' : 'md'} disabled={!text.trim()} className={phone ? 'min-w-[110px]' : ''}>Salva</Button>
      </div>
    </form>
  )
}

export function CaptureDialog() {
  const open = useStore((s) => s.captureOpen)
  const set = useStore((s) => s.set)
  const wide = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 900px)').matches
  const close = (o: boolean) => set('captureOpen', o)
  return wide ? (
    <Modal open={open} onOpenChange={close} title="Cattura">{open && <Form onDone={() => close(false)} />}</Modal>
  ) : (
    <Sheet open={open} onOpenChange={close} title="Cattura"><div className="-mx-4">{open && <Form onDone={() => close(false)} phone />}</div></Sheet>
  )
}
