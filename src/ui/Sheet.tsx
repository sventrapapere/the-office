import type { ReactNode } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { Dialog } from '@base-ui/react/dialog'

/** Foglio dal basso (telefono): si chiude trascinando giù, con Esc o toccando fuori. */
export function Sheet({ open, onOpenChange, title, children, hideTitle }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; hideTitle?: boolean }) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => onOpenChange(o)} swipeDirection="down">
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop" />
        <Drawer.Viewport className="sheet-viewport">
          <Drawer.Popup className="sheet-popup">
            <div className="sheet-handle" aria-hidden="true" />
            <Drawer.Title className={hideTitle ? 'sr-only' : 'm-0 mb-3 text-[15px] font-semibold'}>{title}</Drawer.Title>
            <Drawer.Content>{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** Finestra centrata (PC). */
export function Modal({ open, onOpenChange, title, children, hideTitle, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; hideTitle?: boolean; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dlg-backdrop" />
        <Dialog.Popup className={'dlg-popup ' + (className || '')}>
          <Dialog.Title className={hideTitle ? 'sr-only' : 'm-0 px-4 pt-4 pb-2 text-[15px] font-semibold'}>{title}</Dialog.Title>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
