import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useStore, type SectionId } from '../store'
import { SECTIONS, SETTINGS_SECTION, section, sectionOf } from '../sections'
import { Icon } from './Icon'
import { Dot, IconButton } from './kit'
import { Sheet } from './Sheet'
import { useBadges, SyncStatus } from './Shell'
import { Capture } from '../views/Home'

function Tab({ id, label, icon, active, badge, onClick }: { id: string; label: string; icon: Parameters<typeof Icon>[0]['name']; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      data-tab={id}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx('press flex-1 min-w-0 flex flex-col items-center justify-center gap-1 h-[60px] cursor-pointer', active ? 'text-tx' : 'text-mu')}
    >
      <span className={clsx('relative w-14 h-7 rounded-full flex items-center justify-center', active && 'bg-s3')}>
        <Icon name={icon} size={20} />
        {!!badge && <span className="num absolute -top-1 right-1.5 min-w-4 h-4 px-1 rounded-full bg-s3 border border-ol text-[10px] leading-[14px] text-tx text-center">{badge > 9 ? '9+' : badge}</span>}
      </span>
      <span className={clsx('text-[11px] truncate max-w-full', active && 'font-semibold')}>{label}</span>
    </button>
  )
}

export function PhoneShell({ children }: { children: ReactNode }) {
  const route = useStore((s) => s.route)
  const reader = useStore((s) => s.reader)
  const pinned = useStore((s) => s.settings.pinned)
  const go = useStore((s) => s.go)
  const set = useStore((s) => s.set)
  const back = useStore((s) => s.back)
  const capOn = useStore((s) => s.settings.homeCards.cattura)
  const badges = useBadges()
  const [more, setMore] = useState(false)
  const tabs = pinned.filter((id) => id !== 'home').slice(0, 3).map(section)
  const inMore = route !== 'home' && !tabs.some((t) => t.id === route)
  const sec = reader ? sectionOf(reader.path) : section(route)
  const goMore = (id: SectionId) => { setMore(false); go(id) }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 h-14 px-2">
          {reader ? (
            <IconButton icon="back" label="Indietro" size={44} onClick={back} />
          ) : (
            <span className="w-3" />
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {!reader && route !== 'home' && <Dot color={sec.dot} size={8} />}
            <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] truncate">
              {reader ? <span className="text-[15px] text-mu font-normal">{sec.label}</span> : route === 'home' ? 'Oggi' : sec.label}
            </h1>
          </div>
          <IconButton icon="search" label="Cerca" size={44} onClick={() => set('searchOpen', true)} />
        </div>
      </header>

      <main id="main" className={clsx('flex-1 px-3 pt-1', route === 'home' && !reader && capOn ? 'pb-[150px]' : 'pb-[96px]')}>{children}</main>

      {!reader && route !== 'home' && (
        <button
          type="button"
          onClick={() => set('captureOpen', true)}
          aria-label="Cattura veloce"
          className="press fixed right-4 z-20 w-14 h-14 rounded-2xl bg-s3 border border-ol text-tx flex items-center justify-center shadow-[var(--shadow)] cursor-pointer"
          style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
        >
          <Icon name="plus" size={22} stroke={2.2} />
        </button>
      )}

      <div className="fixed left-0 right-0 bottom-0 z-20 bg-s1 border-t border-ln pb-[env(safe-area-inset-bottom)]">
        {route === 'home' && !reader && capOn && (
          <div className="px-3 pt-2.5 pb-1">
            <Capture compact />
          </div>
        )}
        <nav aria-label="Sezioni" className="flex px-1">
          <Tab id="home" label="Oggi" icon="home" active={route === 'home'} badge={badges.home} onClick={() => go('home')} />
          {tabs.map((t) => (
            <Tab key={t.id} id={t.id} label={t.short} icon={t.icon} active={route === t.id} badge={badges[t.id]} onClick={() => go(t.id)} />
          ))}
          <Tab id="altro" label="Altro" icon="menu" active={inMore} onClick={() => setMore(true)} />
        </nav>
      </div>

      <Sheet open={more} onOpenChange={setMore} title="Tutte le sezioni">
        <div className="grid grid-cols-3 gap-2">
          {[...SECTIONS, SETTINGS_SECTION].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goMore(s.id)}
              aria-current={route === s.id ? 'page' : undefined}
              className={clsx('press flex flex-col items-center justify-center gap-2 h-[84px] rounded-xl border cursor-pointer', route === s.id ? 'bg-s3 border-ol text-tx' : 'bg-s2 border-ln text-tx')}
            >
              <span className="relative">
                <Icon name={s.icon} size={22} />
                <span className="absolute -right-1.5 -top-1"><Dot color={s.dot} size={6} /></span>
              </span>
              <span className="text-[12px]">{s.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between mt-4 px-1">
          <SyncStatus />
          <span className="text-[12px] text-mu">Le schede in basso si scelgono in Impostazioni</span>
        </div>
      </Sheet>
    </div>
  )
}
