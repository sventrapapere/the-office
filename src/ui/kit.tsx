import clsx from 'clsx'
import type { ReactNode, ButtonHTMLAttributes, ReactElement } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Popover } from '@base-ui/react/popover'
import { Icon, type IconName } from './Icon'

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="num text-[11px] px-1.5 py-px rounded-[5px] border border-ln text-mu leading-none whitespace-nowrap">{children}</kbd>
)

export const Dot = ({ color, size = 7 }: { color: string; size?: number }) => (
  <span aria-hidden="true" data-dot className="flex-none rounded-full" style={{ width: size, height: size, background: color }} />
)

export interface MenuEntry { label: string; icon?: IconName; onClick: () => void; danger?: boolean; checked?: boolean; sep?: boolean }

/** Pulsante ⋯ con menu (Base UI Menu). */
export function MoreMenu({ items, label = 'Altre azioni', size = 30, trigger }: { items: MenuEntry[]; label?: string; size?: number; trigger?: ReactElement }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        title={label}
        render={trigger}
        className={trigger ? undefined : 'press hov flex-none rounded-lg flex items-center justify-center text-mu cursor-pointer data-[popup-open]:bg-s3 data-[popup-open]:text-tx'}
        style={trigger ? undefined : { width: size, height: size }}
      >
        {trigger ? undefined : <Icon name="more" size={17} stroke={2.4} />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-[60] outline-none">
          <Menu.Popup className="pop min-w-[200px] py-1">
            {items.map((it, i) =>
              it.sep ? (
                <Menu.Separator key={i} className="h-px bg-ln my-1 mx-1" />
              ) : (
                <Menu.Item key={i} onClick={it.onClick} className={clsx('menu-item', it.danger && 'text-[var(--danger)]')}>
                  {it.checked != null ? <span className="w-4 flex justify-center">{it.checked && <Icon name="check" size={14} stroke={2.4} />}</span> : it.icon ? <Icon name={it.icon} size={15} className="text-mu" /> : null}
                  <span className="flex-1">{it.label}</span>
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Piccolo pannello che si apre da un pulsante (Base UI Popover). */
export function Pop({ trigger, children, open, onOpenChange, align = 'end', title }: { trigger: ReactElement; children: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void; align?: 'start' | 'center' | 'end'; title?: string }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align={align} className="z-[60] outline-none">
          <Popover.Popup className="pop p-3 outline-none">
            {title && <Popover.Title className="m-0 mb-2 text-[13px] font-semibold">{title}</Popover.Title>}
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function Card({ title, right, children, className, flush, id, menu, bodyClass, plain }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string; menu?: MenuEntry[]; bodyClass?: string; plain?: boolean }) {
  return (
    <section id={id} className={clsx('card border border-ln rounded-xl bg-s1 flex flex-col min-w-0', className)}>
      <div className={clsx('flex items-center gap-2 pr-2', plain ? 'min-h-[38px] pl-3 pt-1' : 'min-h-[44px] pl-4 border-b border-ln')}>
        <h2 className={clsx('m-0 flex-1 min-w-0 truncate', plain ? 'text-[11px] font-semibold uppercase tracking-[0.06em] text-mu' : 'text-[13px] font-semibold')}>{title}</h2>
        {right}
        {menu && <MoreMenu items={menu} label={'Altre azioni: ' + (typeof title === 'string' ? title : '')} />}
      </div>
      <div className={clsx('flex flex-col', flush ? 'px-3 py-1' : 'p-4 gap-3', bodyClass)}>{children}</div>
    </section>
  )
}

/** Casella: "white" per le abitudini (come nella tavola), "accent" per le caselle dentro le note. */
export function Check({ done, round, size = 18, tone = 'white' }: { done: boolean; round?: boolean; size?: number; tone?: 'white' | 'accent' }) {
  return done ? (
    <span
      className={clsx('inline-flex align-middle flex-none items-center justify-center', tone === 'accent' ? 'bg-ac text-[#1A0A02]' : 'bg-tx text-bg', round ? 'rounded-full' : 'rounded-[5px]')}
      style={{ width: size, height: size }}
    >
      <Icon name="check" size={size - 6} stroke={3} />
    </span>
  ) : (
    <span className={clsx('inline-block align-middle flex-none box-border border-[1.5px] border-mu', round ? 'rounded-full' : 'rounded-[5px]')} style={{ width: size, height: size }} />
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'link'; size?: 'sm' | 'md' | 'lg'; kbd?: string }
export function Button({ icon, variant = 'secondary', size = 'md', className, children, kbd, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={clsx(
        'press inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-default',
        variant === 'link' ? 'h-auto px-0 text-[13px]' : size === 'sm' ? 'h-[30px] px-2.5 text-[13px]' : size === 'lg' ? 'h-11 px-4 text-[15px]' : 'h-[34px] px-3 text-[13px]',
        variant === 'primary' && 'bg-tx text-bg border border-tx',
        variant === 'accent' && 'bg-ac text-[#1A0A02] border border-ac',
        variant === 'secondary' && 'bg-s2 text-tx border border-ln hov',
        variant === 'ghost' && 'bg-transparent text-mu border border-transparent hov',
        variant === 'link' && 'text-ac bg-transparent border-0 hover:underline underline-offset-2',
        className,
      )}
    >
      {icon && <Icon name={icon} size={variant === 'link' ? 14 : 15} stroke={2} />}
      {children}
      {kbd && <span className="hidden md:inline ml-1 num text-[11px] font-normal opacity-70">{kbd}</span>}
    </button>
  )
}

export function IconButton({ icon, label, className, size = 34, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} {...p} className={clsx('press hov flex-none rounded-lg flex items-center justify-center text-mu cursor-pointer disabled:opacity-40 disabled:cursor-default', className)} style={{ width: size, height: size }}>
      <Icon name={icon} size={17} />
    </button>
  )
}

export function Chip({ on, children, onClick, count, icon }: { on?: boolean; children: ReactNode; onClick?: () => void; count?: number; icon?: IconName }) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      onClick={onClick}
      className={clsx(
        'press h-[30px] px-2.5 rounded-[7px] inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap cursor-pointer border flex-none',
        on ? 'bg-s3 text-tx border-ol font-semibold' : 'bg-transparent text-mu border-ln hov',
      )}
    >
      {on ? <Icon name="check" size={13} stroke={2.6} /> : icon ? <Icon name={icon} size={13} /> : null}
      {children}
      {count != null && <span className="num text-[11px] opacity-80">· {count}</span>}
    </button>
  )
}

export function Seg<T extends string>({ value, options, onChange, label, size = 'md', full }: { value: T; options: { id: T; label: string; count?: number; icon?: IconName }[]; onChange: (v: T) => void; label: string; size?: 'md' | 'lg'; full?: boolean }) {
  return (
    <div role="group" aria-label={label} className={clsx('border border-ln rounded-lg overflow-hidden bg-s1 max-w-full', full ? 'flex w-full [&>button]:flex-1' : 'inline-flex flex-none')}>
      {options.map((o, i) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={clsx(
              'px-3 text-[13px] whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5 font-semibold',
              size === 'lg' ? 'h-10' : 'h-8',
              i && 'border-l border-ln',
              on ? 'bg-s3 text-tx' : 'text-tx/90 hov font-medium',
            )}
          >
            {on ? <Icon name="check" size={13} stroke={2.6} /> : o.icon ? <Icon name={o.icon} size={14} /> : null}
            {o.label}
            {o.count != null && <span className="num">· {o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export const Badge = ({ children, tone }: { children: ReactNode; tone?: 'accent' }) => (
  <span className={clsx('num text-[11px] px-[7px] py-0.5 rounded-md whitespace-nowrap', tone === 'accent' ? 'bg-[var(--acs)] text-ac' : 'bg-s2 text-mu')}>{children}</span>
)

export const Empty = ({ children, icon, action }: { children: ReactNode; icon?: IconName; action?: ReactNode }) => (
  <div className={clsx('text-mu text-[13px]', icon ? 'flex flex-col items-center text-center gap-2 py-6 px-4' : 'py-3 px-1')}>
    {icon && <span className="w-10 h-10 rounded-lg border border-ln flex items-center justify-center text-tx"><Icon name={icon} size={18} /></span>}
    {children}
    {action}
  </div>
)

/** Etichetta piccola maiuscola (intestazioni di gruppo nelle liste). */
export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={clsx('text-[11px] font-semibold uppercase tracking-[0.06em] text-mu', className)}>{children}</span>
)

export function PageHead({ dot, title, sub, children }: { dot: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[38px]">
      <Dot color={dot} size={8} />
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      <span className="text-mu text-[14px] flex-1 min-w-[120px]">{sub}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/** Numero grande per le statistiche di sezione. */
export function Stat({ value, label, tone = 'accent' }: { value: ReactNode; label: string; tone?: 'accent' | 'ok' | 'plain' }) {
  return (
    <div className="rounded-xl bg-s1 border border-ln px-4 py-3 min-w-0">
      <div className={clsx('num text-[28px] font-semibold leading-tight', tone === 'accent' ? 'text-ac' : tone === 'ok' ? 'text-ok' : 'text-tx')}>{value}</div>
      <div className="text-[13px] text-mu truncate">{label}</div>
    </div>
  )
}

export function relTime(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'ora'
  if (s < 3600) return Math.floor(s / 60) + ' min fa'
  if (s < 86400) return Math.floor(s / 3600) + ' h fa'
  const d = Math.floor(s / 86400)
  if (d === 1) return 'ieri'
  if (d < 7) return d + ' giorni fa'
  if (d < 14) return 'settimana scorsa'
  if (d < 30) return Math.floor(d / 7) + ' settimane fa'
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}

/** Campo di testo nello stile Grafite. */
export const inputCls = 'w-full h-9 px-3 rounded-lg border border-ln bg-s2 text-tx outline-none focus:border-ac placeholder:text-mu'
