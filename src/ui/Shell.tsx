import clsx from 'clsx'
import { useStore, daily, inDir } from '../store'
import { SECTIONS, SETTINGS_SECTION, type SectionDef } from '../sections'
import { Icon } from './Icon'
import { Kbd } from './kit'
import { appliesOn, isDone, todayKey, INBOX_DIR } from '../lib/checklist'

/** Conteggi mostrati sulle icone del menu: abitudini ancora da fare, note in Inbox. */
export function useBadges(): Partial<Record<string, number>> {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const notes = useStore((s) => s.notes)
  const dow = new Date().getDay()
  const left = daily(check).filter((it) => appliesOn(it, dow) && !isDone(log, todayKey(), it.title)).length
  return { home: left, note: inDir(notes, INBOX_DIR).length }
}

function DockItem({ s, idx, active, badge, onClick }: { s: SectionDef; idx?: number; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={s.label + (badge ? ` (${badge})` : '')}
      className={clsx('dock-item relative w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer', active ? 'bg-s3 text-tx' : 'text-mu')}
    >
      {active && <span aria-hidden="true" className="absolute -left-[7px] top-2.5 bottom-2.5 w-[3px] rounded-full" style={{ background: s.dot }} />}
      <Icon name={s.icon} size={20} />
      {!!badge && (
        <span aria-hidden="true" className="num absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-s3 border border-ol text-[10px] leading-[14px] text-tx text-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span role="tooltip" className="dock-tip absolute left-[calc(100%+12px)] top-1/2 flex items-center gap-2 whitespace-nowrap rounded-lg bg-s3 border border-ol px-2.5 h-8 text-[13px] text-tx shadow-[var(--shadow)]">
        {s.label}
        {idx != null && <Kbd>Alt {idx}</Kbd>}
      </span>
    </button>
  )
}

export function Dock() {
  const route = useStore((s) => s.route)
  const reader = useStore((s) => s.reader)
  const go = useStore((s) => s.go)
  const set = useStore((s) => s.set)
  const badges = useBadges()
  const [home, ...rest] = SECTIONS
  return (
    <nav aria-label="Sezioni" className="fixed left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 p-1.5 rounded-2xl bg-s1 border border-ln shadow-[var(--shadow)]">
      <button type="button" onClick={() => set('captureOpen', true)} aria-label="Cattura veloce" className="dock-item relative w-11 h-11 rounded-[10px] flex items-center justify-center cursor-pointer bg-tx text-bg">
        <Icon name="plus" size={20} stroke={2.2} />
        <span role="tooltip" className="dock-tip absolute left-[calc(100%+12px)] top-1/2 flex items-center gap-2 whitespace-nowrap rounded-lg bg-s3 border border-ol px-2.5 h-8 text-[13px] text-tx shadow-[var(--shadow)]">
          Cattura <Kbd>Ctrl N</Kbd>
        </span>
      </button>
      <span className="h-px w-7 bg-ln my-1" />
      <DockItem s={home} idx={1} active={route === 'home' && !reader} badge={badges.home} onClick={() => go('home')} />
      <span className="h-px w-7 bg-ln my-1" />
      {rest.map((s, i) => (
        <DockItem key={s.id} s={s} idx={i + 2} active={route === s.id} badge={badges[s.id]} onClick={() => go(s.id)} />
      ))}
      <span className="h-px w-7 bg-ln my-1" />
      <DockItem s={SETTINGS_SECTION} active={route === 'impostazioni'} onClick={() => go('impostazioni')} />
    </nav>
  )
}

export function SyncStatus() {
  const vault = useStore((s) => s.vault)
  const sync = useStore((s) => s.sync)
  useStore((s) => s.notes) // ridisegna dopo ogni aggiornamento
  const local = vault?.kind === 'desktop'
  const st = local ? sync?.state ?? null : vault?.status?.() ?? 'ok'
  const label = !vault ? 'Non collegato' : vault.kind === 'memory' ? 'Dati di prova' : local && !sync ? 'Solo su questo PC'
    : st === 'offline' ? 'Offline · salvo dopo' : st === 'syncing' ? 'Sincronizzo…' : st === 'error' ? 'Errore di sincronizzazione' : 'Sincronizzato'
  const color = !vault || st === 'error' ? 'var(--danger)' : st === 'offline' || vault.kind === 'memory' || (local && !sync) ? 'var(--mu)' : st === 'syncing' ? 'var(--ac)' : 'var(--ok)'
  const title = sync?.last?.error || (sync?.last ? `Ultima sincronizzazione ${new Date(sync.last.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : vault ? 'Vault ' + vault.name : undefined)
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-mu whitespace-nowrap" title={title}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

export function TopBar() {
  const set = useStore((s) => s.set)
  const claudeOpen = useStore((s) => s.claudeOpen)
  return (
    <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur-md">
      <div className="max-w-[1180px] mx-auto flex items-center gap-3 h-[60px]">
        <a href="#main" className="sr-only focus:not-sr-only">Vai al contenuto</a>
        <button
          type="button"
          onClick={() => set('searchOpen', true)}
          className="press flex-1 max-w-[520px] h-9 flex items-center gap-2.5 px-3 rounded-[9px] border border-ln bg-s1 text-mu text-[13px] cursor-pointer hov text-left"
        >
          <Icon name="search" size={16} />
          <span className="flex-1">Cerca o esegui un comando…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <span className="flex-1" />
        <SyncStatus />
        <button
          type="button"
          onClick={() => set('claudeOpen', !claudeOpen)}
          aria-pressed={claudeOpen}
          className={clsx('press h-9 px-3 rounded-[9px] inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer border', claudeOpen ? 'bg-s3 border-ol text-tx' : 'bg-s1 border-ln text-tx hov')}
        >
          <Icon name="claude" size={16} />
          Claude
          <Kbd>Ctrl J</Kbd>
        </button>
      </div>
    </header>
  )
}
