import { useEffect, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Drawer } from '@base-ui/react/drawer'
import { useStore, type SectionId } from '../store'
import { orderedSections, SETTINGS_SECTION, section, sectionOf } from '../sections'
import { Icon, type IconName } from './Icon'
import { Dot, IconButton } from './kit'
import { useCounts, SyncStatus } from './Shell'
import { Capture } from '../views/Home'
import { useBackClose } from '../lib/backstack'

/** Scheda della barra in basso: niente pillola, puntino sopra l'icona della scheda attiva (come nella tavola). */
function Tab({ id, label, icon, active, onClick }: { id: string; label: string; icon: IconName; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-tab={id}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx('press relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-[62px] cursor-pointer', active ? 'text-tx' : 'text-mu')}
    >
      {active && <span aria-hidden="true" className="dot-in absolute top-1.5 w-1 h-1 rounded-full bg-tx" />}
      <Icon name={icon} size={21} stroke={active ? 2.1 : 1.8} />
      <span className={clsx('text-[11px] truncate max-w-full', active && 'font-semibold')}>{label}</span>
    </button>
  )
}

/** Menu "Altro": pannello da sinistra con tutte le sezioni e i loro conteggi. */
function SideMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const route = useStore((s) => s.route)
  const settings = useStore((s) => s.settings)
  const go = useStore((s) => s.go)
  const { hints } = useCounts()
  const pick = (id: SectionId) => { onOpenChange(false); go(id) }
  const row = (id: SectionId, label: string, icon: IconName, hint?: string, onClick?: () => void) => (
    <button key={id + label} type="button" onClick={onClick || (() => pick(id))} aria-current={route === id && !onClick ? 'page' : undefined}
      className={clsx('press w-full flex items-center gap-3 min-h-[48px] px-3 rounded-lg text-left cursor-pointer', route === id && !onClick ? 'bg-s3' : 'hov')}>
      <Icon name={icon} size={18} className="text-mu" />
      <span className="flex-1 font-medium">{label}</span>
      {hint && <span className="text-[12px] text-mu">{hint}</span>}
    </button>
  )
  useBackClose(open, () => onOpenChange(false))
  return (
    <Drawer.Root open={open} onOpenChange={(o) => onOpenChange(o)} swipeDirection="left">
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop" />
        <Drawer.Viewport className="side-viewport">
          <Drawer.Popup className="side-popup">
            <div className="flex items-center gap-3 px-3 pt-[calc(14px+env(safe-area-inset-top))] pb-4">
              <span className="w-10 h-10 rounded-xl bg-ac text-[#1A0A02] flex items-center justify-center text-[18px] font-bold">O</span>
              <span className="flex-1 min-w-0">
                <Drawer.Title className="m-0 text-[17px] font-semibold">The Office</Drawer.Title>
                <SyncStatus />
              </span>
            </div>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mu">Sezioni</div>
            <div className="flex flex-col gap-0.5 px-1.5">
              {orderedSections(settings).map((s) => row(s.id, s.label, s.icon, hints[s.id]))}
            </div>
            <div className="h-px bg-ln mx-3 my-3" />
            <div className="flex flex-col gap-0.5 px-1.5">
              {row('home', 'Chiedi a Claude', 'claude', 'apre l’app Claude', () => { onOpenChange(false); location.href = 'https://claude.ai/new' })}
              {row('impostazioni', SETTINGS_SECTION.label, SETTINGS_SECTION.icon)}
            </div>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export function PhoneShell({ children }: { children: ReactNode }) {
  const route = useStore((s) => s.route)
  const reader = useStore((s) => s.reader)
  const settings = useStore((s) => s.settings)
  const go = useStore((s) => s.go)
  const set = useStore((s) => s.set)
  const back = useStore((s) => s.back)
  const capOn = settings.homeCards.cattura
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [route, reader])
  const tabs = settings.pinned.filter((id) => id !== 'home' && !settings.hidden.includes(id)).slice(0, 3).map(section)
  const inMore = route !== 'home' && !tabs.some((t) => t.id === route)
  const sec = reader ? sectionOf(reader.path) : section(route)

  return (
    <div className="min-h-dvh flex flex-col">
      {!reader && (
        <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2 h-[60px] pl-4 pr-2">
            {route !== 'home' && <Dot color={sec.dot} size={8} />}
            <h1 className="m-0 flex-1 min-w-0 text-[24px] font-semibold tracking-[-0.015em] truncate">{route === 'home' ? 'Oggi' : sec.label}</h1>
            <button type="button" onClick={() => set('searchOpen', true)} aria-label="Cerca" className="press w-10 h-10 rounded-xl bg-s2 flex items-center justify-center text-tx cursor-pointer">
              <Icon name="search" size={18} />
            </button>
          </div>
        </header>
      )}
      {reader && (
        <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-1 h-14 px-1">
            <IconButton icon="back" label="Indietro" size={44} onClick={back} />
            <button type="button" onClick={() => go(sec.id)} className="text-[15px] font-semibold truncate cursor-pointer">{sec.label}</button>
            <span className="flex-1" />
            <div id="reader-actions" className="flex items-center" />
          </div>
        </header>
      )}

      <main id="main" className={clsx('flex-1 px-3 pt-1', route === 'home' && !reader && capOn ? 'pb-[150px]' : 'pb-[100px]')}>{children}</main>

      {!reader && route !== 'home' && (
        <button
          type="button"
          onClick={() => set('captureOpen', true)}
          aria-label="Cattura veloce"
          className="press fixed right-4 z-20 w-14 h-14 rounded-2xl bg-tx text-bg flex items-center justify-center shadow-[var(--shadow)] cursor-pointer"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          <Icon name="plus" size={22} stroke={2.2} />
        </button>
      )}

      <div className="fixed left-0 right-0 bottom-0 z-20 bg-bg border-t border-ln pb-[env(safe-area-inset-bottom)]">
        {route === 'home' && !reader && capOn && (
          <div className="px-3 pt-2.5 pb-1">
            <Capture compact />
          </div>
        )}
        <nav aria-label="Sezioni" className="flex px-1">
          <Tab id="home" label="Oggi" icon="home" active={route === 'home' && !reader} onClick={() => go('home')} />
          {tabs.map((t) => <Tab key={t.id} id={t.id} label={t.short} icon={t.icon} active={route === t.id} onClick={() => go(t.id)} />)}
          <Tab id="altro" label="Altro" icon="menu" active={inMore} onClick={() => setMore(true)} />
        </nav>
      </div>

      <SideMenu open={more} onOpenChange={setMore} />
    </div>
  )
}
