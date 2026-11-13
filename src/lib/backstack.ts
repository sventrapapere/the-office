import { useEffect, useRef } from 'react'

/**
 * Finestre, fogli e menu nella cronologia: quando se ne apre uno aggiungo una voce (stesso indirizzo,
 * con `ov` nello stato), così il tasto indietro del mouse o il gesto indietro di Android lo chiudono
 * invece di cambiare schermata. Se si chiude in altro modo (Esc, clic fuori, "Salva") tolgo la voce.
 */
type Entry = { id: number; close: () => void }
const stack: Entry[] = []
let seq = 0
let pendingBack = 0
const queue: (() => void)[] = []

const curOv = (): number => (typeof history !== 'undefined' && typeof history.state?.ov === 'number' ? history.state.ov : 0)

function push(close: () => void): number {
  const id = ++seq
  stack.push({ id, close })
  afterOverlays(() => { if (stack.some((e) => e.id === id)) history.pushState({ ...(history.state || {}), ov: id }, '') })
  return id
}

function pop(id: number) {
  const i = stack.findIndex((e) => e.id === id)
  if (i < 0) return // già tolta dal tasto indietro
  stack.splice(i, 1)
  if (curOv() === id) { pendingBack++; history.back() }
}

/** Esegue una navigazione dopo che le voci delle finestre appena chiuse sono state tolte. */
export function afterOverlays(fn: () => void) {
  if (pendingBack > 0) queue.push(fn)
  else fn()
}

/** La voce corrente è quella di una finestra aperta? (allora la navigazione la sostituisce) */
export const onOverlayEntry = () => curOv() > 0

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (pendingBack > 0) pendingBack--
    else {
      // indietro (o una navigazione): chiudo le finestre aperte dopo la voce in cui mi trovo
      const cur = curOv()
      while (stack.length && stack[stack.length - 1].id > cur) stack.pop()!.close()
    }
    // voce di una finestra che non esiste più (chiusa in altro modo o dopo un ricaricamento): la salto
    const cur = curOv()
    if (cur && !stack.some((e) => e.id === cur)) { pendingBack++; history.back(); return }
    if (!pendingBack) queue.splice(0).forEach((f) => f())
  })
  // dopo un ricaricamento non ci sono finestre aperte
  if (curOv()) { const { ov: _ov, ...rest } = history.state; history.replaceState(rest, '') }
}

/** Collega una finestra/menu al tasto indietro. */
export function useBackClose(open: boolean, close: () => void) {
  const id = useRef<number | null>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (open && id.current == null) id.current = push(() => { id.current = null; closeRef.current() })
    else if (!open && id.current != null) { const x = id.current; id.current = null; pop(x) }
  }, [open])
  useEffect(() => () => { if (id.current != null) { const x = id.current; id.current = null; pop(x) } }, [])
}
