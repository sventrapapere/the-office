import clsx from 'clsx'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="num text-[11px] px-1.5 py-px rounded-[5px] border border-ln text-mu leading-none">{children}</kbd>
)

export const Dot = ({ color, size = 7 }: { color: string; size?: number }) => (
  <span aria-hidden="true" className="flex-none rounded-full" style={{ width: size, height: size, background: color }} />
)

export function Card({ title, right, children, className, flush, id }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; flush?: boolean; id?: string }) {
  return (
    <section id={id} className={clsx('border border-ln rounded-xl bg-s1 overflow-hidden flex flex-col min-w-0', className)}>
      <div className="flex items-center gap-2 min-h-[42px] pl-4 pr-2.5 border-b border-ln">
        <h2 className="m-0 text-[13px] font-semibold flex-1 min-w-0 truncate">{title}</h2>
        {right}
      </div>
      <div className={clsx('flex flex-col', flush ? 'px-3 py-1' : 'p-4 gap-2.5')}>{children}</div>
    </section>
  )
}

export function Check({ done, round, size = 18 }: { done: boolean; round?: boolean; size?: number }) {
  return done ? (
    <span className={clsx('inline-flex align-middle flex-none items-center justify-center bg-tx text-bg', round ? 'rounded-full' : 'rounded-[5px]')} style={{ width: size, height: size }}>
      <Icon name="check" size={size - 6} stroke={3} />
    </span>
  ) : (
    <span className={clsx('inline-block align-middle flex-none box-border border-[1.5px] border-mu', round ? 'rounded-full' : 'rounded-[5px]')} style={{ width: size, height: size }} />
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; variant?: 'primary' | 'secondary' | 'ghost' | 'accent'; size?: 'sm' | 'md' }
export function Button({ icon, variant = 'secondary', size = 'md', className, children, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={clsx(
        'press inline-flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap flex-none cursor-pointer disabled:opacity-50 disabled:cursor-default',
        size === 'sm' ? 'h-[30px] px-2.5 text-[13px]' : 'h-[34px] px-3 text-[13px]',
        variant === 'primary' && 'bg-tx text-bg border border-tx',
        variant === 'accent' && 'bg-ac text-[#1A0A02] border border-ac',
        variant === 'secondary' && 'bg-s2 text-tx border border-ln hov',
        variant === 'ghost' && 'bg-transparent text-mu border border-transparent hov',
        className,
      )}
    >
      {icon && <Icon name={icon} size={15} stroke={2} />}
      {children}
    </button>
  )
}

export function IconButton({ icon, label, className, size = 34, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: number }) {
  return (
    <button type="button" aria-label={label} title={label} {...p} className={clsx('press hov flex-none rounded-lg flex items-center justify-center text-mu cursor-pointer', className)} style={{ width: size, height: size }}>
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
        'press h-[30px] px-2.5 rounded-[7px] inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap cursor-pointer border',
        on ? 'bg-s3 text-tx border-ol font-semibold' : 'bg-transparent text-mu border-ln hov',
      )}
    >
      {on ? <Icon name="check" size={13} stroke={2.6} /> : icon ? <Icon name={icon} size={13} /> : null}
      {children}
      {count != null && <span className="num text-[11px] text-mu">{count}</span>}
    </button>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-ln rounded-lg overflow-hidden flex-none">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={clsx('h-8 px-3 text-[13px] whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5', i && 'border-l border-ln', o.id === value ? 'bg-s3 text-tx font-semibold' : 'text-mu hov')}
        >
          {o.label}
          {o.count != null && <span className="num text-[11px] text-mu">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export const Badge = ({ children }: { children: ReactNode }) => <span className="num text-[11px] px-[7px] py-0.5 rounded-md bg-s2 text-mu whitespace-nowrap">{children}</span>

export const Empty = ({ children }: { children: ReactNode }) => <div className="text-mu text-[13px] py-3 px-1">{children}</div>

export function PageHead({ dot, title, sub, children }: { dot: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Dot color={dot} size={8} />
      <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">{title}</h1>
      <span className="text-mu text-[14px] flex-1 min-w-[120px]">{sub}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
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
  if (d < 30) return Math.floor(d / 7) + ' sett. fa'
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
