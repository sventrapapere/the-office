import clsx from 'clsx'
import { useSyncExternalStore } from 'react'
import { useStore } from '../store'
import { section } from '../sections'
import { Icon } from './Icon'
import { Kbd } from './kit'
import { SyncStatus } from './Shell'

/**
 * Barra del titolo disegnata dall'app: l'app desktop 2.1 apre la finestra senza la cornice di Windows
 * e lo dice in /_api/ping ("window": "custom"). Pulsanti e trascinamento passano da /_api/window.
 */
let custom = false
const subs = new Set<() => void>()
if (typeof window !== 'undefined' && location.hostname === 'office.localhost') {
  fetch('/_api/ping').then((r) => r.json()).then((j) => { if (j?.window === 'custom') { custom = true; subs.forEach((f) => f()) } }).catch(() => {})
}
const preview = () => { try { return localStorage.getItem('theoffice:titlebar') === '1' } catch { return false } }
export const useTitleBar = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => custom || preview())

const win = (action: 'minimize' | 'maximize' | 'close' | 'drag') => fetch('/_api/window?do=' + action, { method: 'POST' }).catch(() => {})

/** Trascina la finestra dalle zone libere della barra; doppio clic = ingrandisci/ripristina. */
function onBarDown(e: React.MouseEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
  if (e.detail === 2) win('maximize')
  else win('drag')
}

function WinBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={clsx('w-[46px] h-full flex items-center justify-center text-mu cursor-default transition-colors duration-100', danger ? 'hover:bg-[#C42B1C] hover:text-white' : 'hover:bg-s3 hover:text-tx')}>
      {children}
    </button>
  )
}

export function TitleBar() {
  const set = useStore((s) => s.set)
  const route = useStore((s) => s.route)
  const reader = useStore((s) => s.reader)
  const claudeOpen = useStore((s) => s.claudeOpen)
  const sec = section(route)
  const where = reader ? reader.path.split('/').pop()!.replace(/\.md$/, '') : sec.label
  return (
    <header onMouseDown={onBarDown} className="fixed top-0 inset-x-0 z-40 h-[40px] flex items-center bg-bg select-none">
      <div className="flex items-center gap-2.5 pl-4 min-w-0 flex-1">
        <span aria-hidden="true" className="w-[18px] h-[18px] rounded-[5px] bg-tx flex items-center justify-center flex-none"><span className="w-[6px] h-[6px] rounded-full bg-ac" /></span>
        <span className="text-[13px] font-semibold whitespace-nowrap">The Office</span>
        <span className="text-[13px] text-mu truncate">·&nbsp;&nbsp;{where}</span>
      </div>
      <button type="button" onClick={() => set('searchOpen', true)}
        className="press w-[440px] max-w-[40vw] h-[28px] flex items-center gap-2.5 px-3 rounded-[8px] border border-ln bg-s1 text-mu text-[12.5px] cursor-pointer hov text-left">
        <Icon name="search" size={14} /><span className="flex-1 truncate">Cerca o esegui un comando…</span><Kbd>Ctrl K</Kbd>
      </button>
      <div className="flex-1 flex items-center justify-end gap-3 h-full min-w-0">
        <SyncStatus />
        <button type="button" onClick={() => set('claudeOpen', !claudeOpen)} aria-pressed={claudeOpen}
          className={clsx('press h-[28px] px-2.5 rounded-[8px] inline-flex items-center gap-1.5 text-[12.5px] font-semibold cursor-pointer border', claudeOpen ? 'bg-s3 border-ol' : 'bg-s1 border-ln hov')}>
          <Icon name="claude" size={14} />Claude<Kbd>Ctrl J</Kbd>
        </button>
        <span className="w-px h-4 bg-ln" />
        <div className="flex h-full">
          <WinBtn label="Riduci a icona" onClick={() => win('minimize')}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" /></svg></WinBtn>
          <WinBtn label="Ingrandisci" onClick={() => win('maximize')}><svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" /></svg></WinBtn>
          <WinBtn label="Chiudi" danger onClick={() => win('close')}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" /></svg></WinBtn>
        </div>
      </div>
    </header>
  )
}
