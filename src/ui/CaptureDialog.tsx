import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Modal, Sheet } from './Sheet'
import { Button, Seg, Kbd } from './kit'
import type { Kind } from '../lib/checklist'

function Form({ onDone }: { onDone: () => void }) {
  const capture = useStore((s) => s.capture)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'nota' | Kind>('nota')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 50) }, [])
  const save = async () => {
    if (!text.trim()) return
    onDone()
    await capture(text, kind)
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-3 px-4 pb-4">
      <Seg label="Dove salvare" value={kind} onChange={setKind} options={[{ id: 'nota', label: 'Nota in Inbox' }, { id: 'todo', label: 'Da fare' }, { id: 'spesa', label: 'Spesa' }]} />
      <label className="sr-only" htmlFor="cap-text">Testo</label>
      <textarea
        id="cap-text"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || kind !== 'nota')) { e.preventDefault(); save() } }}
        rows={kind === 'nota' ? 5 : 2}
        placeholder={kind === 'nota' ? 'Scrivi un’idea, incolla un link… la prima riga diventa il titolo.' : kind === 'todo' ? 'Cosa devi fare?' : 'Cosa devi comprare?'}
        className="w-full resize-none rounded-[10px] border border-ln bg-s2 px-3 py-2.5 text-[15px] text-tx outline-none focus:border-ol placeholder:text-mu"
      />
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-mu flex-1 hidden md:inline">{kind === 'nota' ? <>Salva con <Kbd>Ctrl Invio</Kbd></> : <>Salva con <Kbd>Invio</Kbd></>}</span>
        <span className="flex-1 md:hidden" />
        <Button variant="ghost" onClick={onDone}>Annulla</Button>
        <Button variant="primary" type="submit" disabled={!text.trim()}>Salva</Button>
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
    <Modal open={open} onOpenChange={close} title="Cattura veloce">{open && <Form onDone={() => close(false)} />}</Modal>
  ) : (
    <Sheet open={open} onOpenChange={close} title="Cattura veloce"><div className="-mx-4">{open && <Form onDone={() => close(false)} />}</div></Sheet>
  )
}
