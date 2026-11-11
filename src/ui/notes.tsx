import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { sectionOf } from '../sections'
import { excerpt, type Note } from '../lib/md'
import { useAssetUrl } from '../lib/assets'
import { Dot, relTime } from './kit'
import { Icon } from './Icon'

/** Riga di elenco: titolo + dettaglio a destra. */
export function NoteRow({ note, right, dot, sub }: { note: Note; right?: ReactNode; dot?: boolean; sub?: ReactNode }) {
  const open = useStore((s) => s.open)
  return (
    <button type="button" onClick={() => open(note.path)} className="flex items-center gap-3 min-h-[44px] px-1 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md min-w-0">
      {dot && <Dot color={sectionOf(note.path).dot} size={6} />}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{note.title}</span>
        {sub && <span className="block truncate text-[12px] text-mu">{sub}</span>}
      </span>
      {right ?? <span className="text-[12px] text-mu whitespace-nowrap">{relTime(note.mtime)}</span>}
    </button>
  )
}

/** Riquadro con estratto, per le griglie di note. */
export function NoteTile({ note, meta }: { note: Note; meta?: ReactNode }) {
  const open = useStore((s) => s.open)
  const ex = excerpt(note.body, 140)
  return (
    <button type="button" onClick={() => open(note.path)} className="press flex flex-col gap-1.5 p-3.5 rounded-xl border border-ln bg-s1 text-left cursor-pointer hov min-w-0">
      <span className="font-semibold leading-snug line-clamp-2">{note.title}</span>
      {ex && <span className="text-[13px] text-mu leading-snug line-clamp-3">{ex}</span>}
      <span className="flex flex-wrap gap-1.5 mt-auto pt-1 text-[12px] text-mu">{meta ?? relTime(note.mtime)}</span>
    </button>
  )
}

export const Tag = ({ children, strong }: { children: ReactNode; strong?: boolean }) => (
  <span className={clsx('px-1.5 py-px rounded-md border text-[12px] whitespace-nowrap', strong ? 'border-ol text-tx bg-s3' : 'border-ln text-mu bg-s2')}>{children}</span>
)

/** Locandina 2:3: immagine dal vault o titolo su fondo neutro. */
export function Poster({ note, onClick, sub, rating, selected }: { note: Note; onClick: () => void; sub?: string; rating?: string; selected?: boolean }) {
  const vault = useStore((s) => s.vault)
  const p = typeof note.fm.poster === 'string' ? note.fm.poster : ''
  const src = useAssetUrl(vault, p ? (/^https?:/.test(p) ? p : '60 Film, serie e anime/' + p.replace(/^\.?\//, '')) : null)
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group flex flex-col gap-1.5 text-left cursor-pointer min-w-0" title={note.title}>
      <span className={clsx('relative aspect-[2/3] rounded-[10px] overflow-hidden border bg-s2 flex items-center justify-center p-2 text-center text-[12px] text-mu transition-transform duration-150 ease-out group-hover:-translate-y-0.5', selected ? 'border-tx' : 'border-ln')}>
        {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" /> : <span className="line-clamp-4">{note.title}</span>}
        {rating && <span className="num absolute top-1.5 right-1.5 px-1.5 rounded-md bg-bg/85 text-tx text-[11px] font-semibold inline-flex items-center gap-0.5"><Icon name="star" size={10} stroke={2.4} />{rating}</span>}
      </span>
      <span className="text-[13px] leading-tight line-clamp-2">{note.title}</span>
      {sub && <span className="num text-[11px] text-mu truncate">{sub}</span>}
    </button>
  )
}

/** Valutazione da 1 a 5 (riscrive `voto` nel frontmatter). */
export function Stars({ value, onChange, label = 'Voto' }: { value: number; onChange?: (v: number | null) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={i + (i === 1 ? ' stella' : ' stelle')}
          disabled={!onChange}
          onClick={() => onChange?.(value === i ? null : i)}
          className={clsx('w-8 h-8 rounded-md flex items-center justify-center cursor-pointer disabled:cursor-default', i <= value ? 'text-ac' : 'text-ol hov')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={i <= value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
          </svg>
        </button>
      ))}
    </div>
  )
}
