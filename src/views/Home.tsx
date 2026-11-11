import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import NumberFlow from '@number-flow/react'
import { useStore, daily, todos, spesa } from '../store'
import { Card, Check, Chip, IconButton, Badge, Empty, Kbd, Dot, relTime, Seg } from '../ui/kit'
import { Icon } from '../ui/Icon'
import {
  appliesOn, isDone, streak, todayKey, startKey, ratioOn, calStreaks, ymd, addDays, MONTHS, dateLabel, type Kind,
} from '../lib/checklist'
import { sectionOf } from '../sections'

export function Capture({ autoFocusKey, compact }: { autoFocusKey?: boolean; compact?: boolean }) {
  const capture = useStore((s) => s.capture)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'nota' | Kind>('nota')
  const ref = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!text.trim()) return
    await capture(text, kind)
    setText('')
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="flex items-center gap-2 min-h-[44px] pl-3.5 pr-1.5 rounded-[10px] border border-ln bg-s1 focus-within:border-ol"
    >
      <Icon name="plus" size={16} className="text-mu flex-none" />
      <label htmlFor="cattura" className="sr-only">Cattura veloce</label>
      <input
        id="cattura"
        ref={ref}
        data-capture
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'nota' ? 'Cattura un’idea, un link… finisce in Inbox' : kind === 'todo' ? 'Nuova cosa da fare…' : 'Da comprare…'}
        className="flex-1 min-w-0 bg-transparent outline-none border-0 text-tx text-[14px] h-10"
        autoComplete="off"
      />
      {!compact && <Seg label="Dove salvare" value={kind} onChange={setKind} options={[{ id: 'nota', label: 'Nota' }, { id: 'todo', label: 'Da fare' }, { id: 'spesa', label: 'Spesa' }]} />}
      {!compact && <span className="hidden lg:inline"><Kbd>Ctrl N</Kbd></span>}
    </form>
  )
}

function Habits() {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const toggleHabit = useStore((s) => s.toggleHabit)
  const today = new Date()
  const tk = todayKey()
  const items = daily(check).filter((it) => appliesOn(it, today.getDay()))
  const done = items.filter((it) => isDone(log, tk, it.title)).length
  return (
    <Card title="Ogni giorno" right={<Badge>{done}/{items.length}</Badge>} flush>
      {items.length === 0 && <Empty>Nessuna abitudine per oggi. Aggiungile nella nota Checklist, sezione “Ogni giorno”.</Empty>}
      <div className="flex flex-col gap-1.5 py-2">
        {items.map((it) => {
          const d = isDone(log, tk, it.title)
          const st = streak(log, it, today)
          return (
            <button
              key={it.title}
              type="button"
              aria-pressed={d}
              onClick={() => toggleHabit(it.title)}
              title={it.note.length ? it.note.join('\n') : undefined}
              className="press flex items-center gap-2.5 min-h-[44px] px-3 rounded-lg border border-ln bg-s2 text-left cursor-pointer hov"
            >
              <Check done={d} />
              <span className={clsx('flex-1 min-w-0', d && 'text-mu')}>{it.title}</span>
              <span className="num text-[11px] text-mu">{st ? st + ' gg' : '—'}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function ItemList({ kind, title, empty, placeholder }: { kind: Kind; title: string; empty: string; placeholder: string }) {
  const check = useStore((s) => s.check)
  const toggleItem = useStore((s) => s.toggleItem)
  const removeItem = useStore((s) => s.removeItem)
  const addItem = useStore((s) => s.addItem)
  const mutateCheck = useStore((s) => s.mutateCheck)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const all = (kind === 'todo' ? todos : spesa)(check).map((it, i) => ({ it, i }))
  const open = all.filter((x) => !x.it.done)
  const closed = all.filter((x) => x.it.done)
  const tk = todayKey()
  return (
    <Card
      title={title}
      right={
        <>
          <Badge>{open.length}</Badge>
          {closed.length > 0 && (
            <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => setShowDone((v) => !v)}>
              {showDone ? 'Nascondi fatte' : (kind === 'spesa' ? 'Presi ' : 'Fatte ') + closed.length}
            </button>
          )}
        </>
      }
      flush
    >
      {open.length === 0 && <Empty>{empty}</Empty>}
      {[...open, ...(showDone ? closed : [])].map(({ it, i }) => (
        <div key={i + it.title} className="group flex items-center gap-3 min-h-[42px] px-1 border-b border-ln last:border-b-0">
          <button type="button" aria-label={(it.done ? 'Riapri: ' : 'Completa: ') + it.title} onClick={() => toggleItem(kind, i)} className="press cursor-pointer p-0.5 -m-0.5">
            <Check done={it.done} round={kind === 'todo'} />
          </button>
          <span className={clsx('flex-1 min-w-0', it.done && 'text-mu line-through')}>
            {it.title}
            {it.note.length > 0 && <span className="block text-[12px] text-mu truncate">{it.note.join(' ')}</span>}
          </span>
          {kind === 'todo' && it.doneAt && <span className="text-[12px] text-mu">{it.doneAt === tk ? 'oggi' : it.doneAt.slice(5).split('-').reverse().join('/')}</span>}
          <IconButton icon="trash" label={'Elimina: ' + it.title} size={30} onClick={() => removeItem(kind, i)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60" />
        </div>
      ))}
      {showDone && closed.length > 0 && (
        <button type="button" className="self-start text-[12px] text-mu my-1.5 px-2 h-7 rounded-md hov cursor-pointer" onClick={() => mutateCheck((d) => { const s = d.find((b) => b.type === 'sec' && b.kind === kind); if (s && s.type === 'sec') s.items = s.items.filter((x) => !x.done) }, kind === 'spesa' ? 'Lista ripulita' : 'Fatte rimosse')}>
          {kind === 'spesa' ? 'Togli i presi dalla lista' : 'Togli le fatte'}
        </button>
      )}
      <form onSubmit={(e) => { e.preventDefault(); addItem(kind, text); setText('') }} className="flex items-center gap-2 min-h-[40px] px-1">
        <Icon name="plus" size={15} className="text-mu" />
        <label className="sr-only" htmlFor={'add-' + kind}>{placeholder}</label>
        <input id={'add-' + kind} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="flex-1 min-w-0 bg-transparent outline-none border-0 text-[14px] h-9 text-tx placeholder:text-mu" autoComplete="off" />
      </form>
    </Card>
  )
}

/** Protagonista della Home: calendario della costanza con la serie di giorni. */
function Costanza() {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const items = daily(check)
  const [filter, setFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const { cur, best } = useMemo(() => calStreaks(log, items, filter, today), [log, items, filter])
  const first = (base.getDay() + 6) % 7
  const daysIn = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const cells: { d: Date; r: number | null; future: boolean; before: boolean }[] = []
  let sum = 0, cnt = 0
  for (let i = 1; i <= daysIn; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), i)
    const future = d > today
    const before = items.length > 0 && items.every((it) => ymd(d) < startKey(log, it))
    const r = future || before ? null : ratioOn(log, items, d, filter)
    if (r !== null && ymd(d) !== todayKey()) { sum += r; cnt++ }
    cells.push({ d, r, future, before })
  }
  const pct = cnt ? Math.round((sum / cnt) * 100) : null
  const fill = (r: number) => (r <= 0 ? 'var(--s2)' : r >= 1 ? 'var(--ac)' : `color-mix(in srgb, var(--ac) ${Math.round(20 + r * 55)}%, var(--s2))`)
  return (
    <Card
      title="Costanza"
      right={
        <div className="flex items-center gap-1">
          <IconButton icon="left" label="Mese precedente" size={28} onClick={() => setOffset((o) => o - 1)} />
          <span className="text-[12px] text-mu min-w-[92px] text-center capitalize">{MONTHS[base.getMonth()]} {base.getFullYear()}</span>
          <IconButton icon="right" label="Mese successivo" size={28} onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset >= 0} />
        </div>
      }
    >
      <div className="flex items-end gap-4">
        <div>
          <div className="num text-[40px] font-semibold leading-none text-ac"><NumberFlow value={cur} /></div>
          <div className="text-[12px] text-mu mt-1">{cur === 1 ? 'giorno' : 'giorni'} di fila con tutto fatto{filter !== 'all' ? ' · ' + filter : ''}</div>
        </div>
        <span className="flex-1" />
        <div className="text-right">
          <div className="num text-[17px] font-semibold">{best}</div>
          <div className="text-[12px] text-mu">record</div>
        </div>
        <div className="text-right">
          <div className="num text-[17px] font-semibold">{pct == null ? '—' : pct + '%'}</div>
          <div className="text-[12px] text-mu">del mese</div>
        </div>
      </div>
      <div className="chips" role="group" aria-label="Filtra per abitudine">
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Tutte</Chip>
        {items.map((it) => <Chip key={it.title} on={filter === it.title} onClick={() => setFilter(it.title)}>{it.title}</Chip>)}
      </div>
      <div className="grid grid-cols-7 gap-[5px]">
        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((w, i) => <span key={i} className="text-[10px] text-mu text-center">{w}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={'e' + i} />)}
        {cells.map(({ d, r, future, before }) => {
          const isToday = ymd(d) === todayKey()
          const lbl = `${d.getDate()} ${MONTHS[d.getMonth()]}: ` + (r == null ? (future ? 'futuro' : 'nessuna abitudine') : Math.round(r * 100) + '%')
          return (
            <span
              key={d.getDate()}
              title={lbl}
              aria-label={lbl}
              className="h-7 rounded-md flex items-center justify-center text-[10px] num"
              style={{
                background: r == null ? 'transparent' : fill(r),
                boxShadow: isToday ? '0 0 0 1.5px var(--s1), 0 0 0 3px var(--tx)' : r == null ? 'inset 0 0 0 1px var(--s3)' : undefined,
                color: r != null && r >= 0.6 ? '#1A0A02' : 'var(--mu)',
                opacity: before ? 0.4 : 1,
              }}
            >
              {d.getDate()}
            </span>
          )
        })}
      </div>
    </Card>
  )
}

function Recent() {
  const notes = useStore((s) => s.notes)
  const open = useStore((s) => s.open)
  const list = notes.filter((x) => !x.path.startsWith('04 Checklist/') && !x.path.startsWith('_raw/')).sort((a, b) => b.mtime - a.mtime).slice(0, 8)
  return (
    <Card title="Modificate di recente" flush>
      {list.map((n) => (
        <button key={n.path} type="button" onClick={() => open(n.path)} className="flex items-center gap-2.5 min-h-[38px] px-1 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
          <Dot color={sectionOf(n.path).dot} size={6} />
          <span className="flex-1 min-w-0 truncate">{n.title}</span>
          <span className="text-[12px] text-mu whitespace-nowrap">{relTime(n.mtime)}</span>
        </button>
      ))}
    </Card>
  )
}

export default function Home({ phone }: { phone?: boolean }) {
  const cards = useStore((s) => s.settings.homeCards)
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const today = new Date()
  const left = daily(check).filter((it) => appliesOn(it, today.getDay()) && !isDone(log, todayKey(), it.title)).length
  const dueToday = todos(check).filter((t) => !t.done).length
  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Oggi</h1>
          <span className="text-mu text-[14px] flex-1">{dateLabel(today)} · {left ? `manca${left > 1 ? 'no' : ''} ${left} abitudin${left > 1 ? 'i' : 'e'}` : 'abitudini fatte'} · {dueToday} da fare</span>
        </div>
      )}
      {phone && <p className="-mt-2 mb-0 px-1 text-[13px] text-mu">{dateLabel(today)} · {left ? `${left} abitudin${left > 1 ? 'i' : 'e'} da fare` : 'abitudini fatte'}</p>}
      {!phone && cards.cattura && <Capture />}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <div className="flex flex-col gap-4 min-w-0">
          {cards.abitudini && <Habits />}
          {cards.dafare && <ItemList kind="todo" title="Da fare" empty="Niente in sospeso." placeholder="Aggiungi una cosa da fare" />}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          {cards.costanza && <Costanza />}
          {cards.spesa && <ItemList kind="spesa" title="Lista della spesa" empty="La lista è vuota." placeholder="Aggiungi alla spesa" />}
          {cards.recenti && !phone && <Recent />}
        </div>
      </div>
      {cards.recenti && phone && <Recent />}
    </div>
  )
}
