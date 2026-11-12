import { useMemo, useRef, useState, useEffect } from 'react'
import clsx from 'clsx'
import NumberFlow from '@number-flow/react'
import { useStore, daily, todos, spesa } from '../store'
import { Card, Check, Chip, IconButton, Badge, Empty, Kbd, Dot, relTime, Button, Pop, inputCls, type MenuEntry } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { Modal, Sheet } from '../ui/Sheet'
import {
  appliesOn, isDone, streak, todayKey, startKey, ratioOn, calStreaks, anyStreak, anyBest, ymd, addDays, fromKey, MONTHS, DOW_L, DOW_S, dateLabel, dueLabel,
  CHECK_PATH, LOG_PATH, habitsOn, type Kind, type Item,
} from '../lib/checklist'
import { sectionOf } from '../sections'

// ───────────────────────── cattura ─────────────────────────
export function Capture({ compact }: { compact?: boolean }) {
  const capture = useStore((s) => s.capture)
  const set = useStore((s) => s.set)
  const [text, setText] = useState('')
  const submit = async () => {
    if (!text.trim()) return
    await capture(text, 'nota')
    setText('')
  }
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit() }}
      className="flex items-center gap-2 min-h-[46px] pl-4 pr-2 rounded-[10px] border border-ln bg-s1 focus-within:border-ol"
    >
      <Icon name="plus" size={16} className="text-mu flex-none" />
      <label htmlFor="cattura" className="sr-only">Cattura veloce</label>
      <input
        id="cattura"
        data-capture
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={compact ? 'Cattura un’idea…' : 'Cattura un’idea, un link, una cosa da fare… finisce in Inbox'}
        className="flex-1 min-w-0 bg-transparent outline-none border-0 text-tx text-[14px] h-10 placeholder:text-mu"
        autoComplete="off"
      />
      {compact ? (
        <IconButton icon="chevd" label="Apri la cattura completa" size={34} onClick={() => set('captureOpen', true)} />
      ) : (
        <span className="hidden lg:inline"><Kbd>Ctrl N</Kbd></span>
      )}
    </form>
  )
}

// ───────────────────────── abitudini ─────────────────────────
const WEEK = [1, 2, 3, 4, 5, 6, 0]

function DayPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Giorni">
      {WEEK.map((d) => {
        const on = value.includes(d)
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            className={clsx('press h-8 min-w-[42px] px-2 rounded-md border text-[12px] cursor-pointer', on ? 'bg-s3 border-ol text-tx font-semibold' : 'border-ln text-mu hov')}>
            {DOW_S[d]}
          </button>
        )
      })}
      <span className="text-[12px] text-mu ml-1">{value.length ? '' : 'nessuno = tutti i giorni'}</span>
    </div>
  )
}

function HabitEditor({ it, onSave, onCancel, onDelete }: { it?: Item; onSave: (v: { title: string; days: number[]; note: string[] }) => void; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(it?.title || '')
  const [days, setDays] = useState<number[]>(it?.days || [])
  const [note, setNote] = useState(it?.note.join('\n') || '')
  const save = () => title.trim() && onSave({ title: title.trim(), days, note: note.replace(/\s+$/, '') ? note.replace(/\s+$/, '').split('\n') : [] })
  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-lg border border-ol bg-s2" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); save() } }}>
      <input autoFocus className={inputCls + ' bg-s1'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome dell’abitudine" aria-label="Nome dell’abitudine" />
      <DayPicker value={days} onChange={setDays} />
      <textarea className={inputCls + ' bg-s1 h-16 py-2 resize-none'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (dettagli, quanto, come…)" aria-label="Nota" />
      <div className="flex gap-2 items-center">
        {onDelete && <Button variant="ghost" icon="trash" onClick={onDelete}>Elimina</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button variant="primary" onClick={save} disabled={!title.trim()}>Salva</Button>
      </div>
    </div>
  )
}

/** Gestione abitudini: aggiungi, rinomina (il registro segue), giorni, nota, elimina. */
function HabitManager({ open, onClose, phone }: { open: boolean; onClose: () => void; phone?: boolean }) {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const st = useStore.getState()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const items = daily(check)
  const body = (
    <div className="flex flex-col gap-1.5 px-4 pb-4">
      {items.map((it, i) =>
        editing === i ? (
          <HabitEditor key={i} it={it} onCancel={() => setEditing(null)} onSave={(v) => { st.updateItem('daily', i, v); setEditing(null) }}
            onDelete={() => { st.removeItem('daily', i); setEditing(null) }} />
        ) : (
          <button key={i} type="button" onClick={() => setEditing(i)} className="flex items-center gap-3 min-h-[48px] px-3 rounded-lg border border-ln bg-s2 text-left cursor-pointer hov">
            <span className="flex-1 min-w-0">
              <span className="block truncate">{it.title}</span>
              <span className="block text-[12px] text-mu truncate">
                {it.days.length && it.days.length < 7 ? WEEK.filter((d) => it.days.includes(d)).map((d) => DOW_S[d]).join(' · ') : 'tutti i giorni'}
                {' · '}{streak(log, it)} gg di fila{it.note.length ? ' · ' + it.note.join(' ') : ''}
              </span>
            </span>
            <Icon name="edit" size={15} className="text-mu" />
          </button>
        ),
      )}
      {editing === 'new' ? (
        <HabitEditor onCancel={() => setEditing(null)} onSave={(v) => { st.addItem('daily', v.title, { days: v.days, note: v.note }); setEditing(null) }} />
      ) : (
        <Button variant="link" icon="plus" className="self-start mt-1" onClick={() => setEditing('new')}>Nuova abitudine</Button>
      )}
      <p className="m-0 mt-2 text-[12px] text-mu">Rinominando un’abitudine il registro si aggiorna e la serie di giorni resta. Tutto è salvato nella nota Checklist.</p>
    </div>
  )
  return phone ? (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Abitudini">{<div className="-mx-4">{body}</div>}</Sheet>
  ) : (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Abitudini" className="max-h-[80vh] overflow-y-auto">{body}</Modal>
  )
}

function Habits({ phone }: { phone?: boolean }) {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const toggleHabit = useStore((s) => s.toggleHabit)
  const open = useStore((s) => s.open)
  const [manage, setManage] = useState(false)
  const today = new Date()
  const tk = todayKey()
  const all = daily(check)
  const items = all.filter((it) => appliesOn(it, today.getDay()))
  const others = all.filter((it) => !appliesOn(it, today.getDay()))
  const done = items.filter((it) => isDone(log, tk, it.title)).length
  const menu: MenuEntry[] = [
    { label: 'Gestisci abitudini', icon: 'edit', onClick: () => setManage(true) },
    { label: 'Apri la nota Checklist', icon: 'note', onClick: () => open(CHECK_PATH) },
  ]
  return (
    <Card title="Ogni giorno" plain={phone} right={<Badge>{done} di {items.length}</Badge>} menu={menu}>
      {items.length === 0 && <Empty>Nessuna abitudine per oggi.</Empty>}
      <div className="grid gap-2" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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
              className="press flex items-center gap-3 min-h-[44px] px-3 rounded-lg border border-ln bg-s2 text-left cursor-pointer hov"
            >
              <Check done={d} />
              <span className={clsx('flex-1 min-w-0 leading-tight', d && 'text-mu')}>{it.title}</span>
              <span className="num text-[11px] text-mu whitespace-nowrap">{st ? st + ' gg' : '–'}</span>
            </button>
          )
        })}
      </div>
      {others.length > 0 && <p className="m-0 text-[12px] text-mu">Non oggi: {others.map((o) => o.title).join(', ')}</p>}
      <HabitManager open={manage} onClose={() => setManage(false)} phone={phone} />
    </Card>
  )
}

// ───────────────────────── costanza ─────────────────────────
const heat = (r: number) => (r <= 0 ? 'var(--s2)' : r >= 1 ? 'var(--ac)' : `color-mix(in srgb, var(--ac) ${Math.round(28 + r * 52)}%, var(--bg))`)

/** Giorno passato selezionato: si vedono e si correggono le spunte di quel giorno. */
function DayDetail({ k, onClose }: { k: string; onClose: () => void }) {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const toggleHabit = useStore((s) => s.toggleHabit)
  const d = fromKey(k)
  const hs = habitsOn(log, daily(check), d)
  return (
    <div className="rounded-lg border border-ol bg-s2 p-3 flex flex-col gap-1.5">
      <div className="flex items-center">
        <span className="font-semibold flex-1">{DOW_L[d.getDay()].replace(/^./, (c) => c.toUpperCase())} {d.getDate()} {MONTHS[d.getMonth()]}</span>
        <IconButton icon="close" label="Chiudi il giorno" size={28} onClick={onClose} />
      </div>
      {!hs.length && <span className="text-[13px] text-mu">Nessuna abitudine prevista quel giorno.</span>}
      {hs.map((it) => {
        const on = isDone(log, k, it.title)
        return (
          <button key={it.title} type="button" aria-pressed={on} onClick={() => toggleHabit(it.title, k)} className="flex items-center gap-2.5 min-h-[36px] px-1 text-left cursor-pointer rounded-md hov">
            <Check done={on} size={16} />
            <span className={clsx(on && 'text-mu')}>{it.title}</span>
          </button>
        )
      })}
    </div>
  )
}

function Costanza({ phone }: { phone?: boolean }) {
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const open = useStore((s) => s.open)
  const items = daily(check)
  const [filter, setFilter] = useState('all')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tk = ymd(today)
  const [month, setMonth] = useState(() => tk.slice(0, 7))
  const [sel, setSel] = useState<string | null>(null)
  const [full, setFull] = useState(!phone)
  const f = filter !== 'all' && items.some((i) => i.title === filter) ? filter : 'all'
  const cur = f === 'all' ? anyStreak(log, today) : calStreaks(log, items, f, today).cur
  const best = f === 'all' ? anyBest(log) : calStreaks(log, items, f, today).best
  const [y, m] = month.split('-').map(Number)
  const base = new Date(y, m - 1, 1)
  const months = useMemo(() => {
    const first = Object.keys(log.days).sort()[0] || tk
    const out: string[] = []
    for (let d = new Date(today.getFullYear(), today.getMonth(), 1); ymd(d).slice(0, 7) >= first.slice(0, 7) && out.length < 24; d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) out.push(ymd(d).slice(0, 7))
    return out
  }, [log, tk])

  type Cell = { d: Date; k: string; r: number | null; future: boolean }
  const cell = (d: Date): Cell => {
    const k = ymd(d)
    const future = d > today
    const before = items.length > 0 && items.every((it) => k < startKey(log, it))
    return { d, k, future, r: future || before ? null : ratioOn(log, items, d, f) }
  }
  let cells: Cell[] = []
  let lead = 0
  if (full) {
    lead = (base.getDay() + 6) % 7
    const n = new Date(y, m, 0).getDate()
    for (let i = 1; i <= n; i++) cells.push(cell(new Date(y, m - 1, i)))
  } else {
    const mon = addDays(today, -((today.getDay() + 6) % 7))
    cells = Array.from({ length: 7 }, (_, i) => cell(addDays(mon, i)))
  }
  const monthCells = full ? cells : Array.from({ length: new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() }, (_, i) => cell(new Date(today.getFullYear(), today.getMonth(), i + 1)))
  const past = monthCells.filter((c) => c.r !== null && c.k !== tk)
  const pct = past.length ? Math.round((past.reduce((a, c) => a + (c.r || 0), 0) / past.length) * 100) : null

  const menu: MenuEntry[] = [
    { label: 'Tutte le abitudini', checked: f === 'all', onClick: () => setFilter('all') },
    ...items.map((it) => ({ label: it.title, checked: f === it.title, onClick: () => setFilter(it.title) })),
    { sep: true, label: '', onClick: () => {} },
    { label: 'Apri il registro', icon: 'note' as const, onClick: () => open(LOG_PATH) },
  ]
  const monthPicker = (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Mese</span>
      <select value={month} onChange={(e) => { setMonth(e.target.value); setSel(null); setFull(true) }}
        className="appearance-none h-8 pl-3 pr-8 rounded-lg border border-ln bg-s1 text-[13px] font-semibold text-tx cursor-pointer hov capitalize">
        {months.map((mm) => { const [yy, mo] = mm.split('-').map(Number); return <option key={mm} value={mm}>{MONTHS[mo - 1].replace(/^./, (c) => c.toUpperCase())}{yy !== today.getFullYear() ? ' ' + yy : ''}</option> })}
      </select>
      <Icon name="chevd" size={14} className="absolute right-2.5 pointer-events-none text-mu" />
    </label>
  )

  return (
    <Card
      title={phone && !full ? 'Costanza · questa settimana' : 'Costanza'}
      plain={phone}
      right={phone ? <Button size="sm" variant="ghost" onClick={() => { setFull((v) => !v); setSel(null) }}>{full ? 'Settimana' : 'Mese'}<Icon name="chevd" size={13} /></Button> : monthPicker}
      menu={menu}
    >
      <div className="flex items-end gap-4">
        <div className="min-w-0">
          <div className="num text-[44px] font-semibold leading-none text-ac"><NumberFlow value={cur} /></div>
          <div className="text-[13px] text-mu mt-1.5 truncate">{f === 'all' ? `giorni di fila con almeno un’abitudine` : `giorni di fila · ${f}`}</div>
        </div>
        <span className="flex-1" />
        <div className="text-right flex-none">
          <div className="num text-[18px] font-semibold">{pct == null ? '–' : pct + '%'}</div>
          <div className="text-[12px] text-mu">del mese · record <span className="num text-tx">{best}</span></div>
        </div>
      </div>
      {phone && full && <div className="self-start">{monthPicker}</div>}
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Calendario della costanza">
        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((w, i) => <span key={i} className="text-[11px] text-mu text-center pb-0.5">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={'e' + i} />)}
        {cells.map(({ d, k, r, future }) => {
          const isToday = k === tk
          const lbl = `${d.getDate()} ${MONTHS[d.getMonth()]}: ` + (future ? 'futuro' : r == null ? 'nessuna abitudine' : Math.round(r * 100) + '% — tocca per modificare')
          return (
            <button
              key={k}
              type="button"
              disabled={future}
              title={lbl}
              aria-label={lbl}
              aria-pressed={sel === k}
              onClick={() => setSel(sel === k ? null : k)}
              className="press rounded-md cursor-pointer disabled:cursor-default relative"
              style={{
                height: phone ? 40 : 30,
                background: r == null ? 'transparent' : heat(r),
                boxShadow: sel === k || isToday ? '0 0 0 1.5px var(--s1), 0 0 0 3px var(--tx)' : r == null || r === 0 ? 'inset 0 0 0 1px var(--s3)' : undefined,
              }}
            >
              {phone && !full && <span className="absolute bottom-1 left-0 right-0 text-center num text-[10px] text-mu">{d.getDate()}</span>}
            </button>
          )
        })}
      </div>
      {sel && <DayDetail k={sel} onClose={() => setSel(null)} />}
      {!sel && !phone && <span className="text-[12px] text-mu">Tocca un giorno passato per vedere o correggere cosa hai fatto.</span>}
    </Card>
  )
}

// ───────────────────────── da fare ─────────────────────────
function TodoEditor({ it, onSave, onCancel, onDelete }: { it?: Item; onSave: (v: { title: string; due?: string; note: string[] }) => void; onCancel: () => void; onDelete?: () => void }) {
  const [title, setTitle] = useState(it?.title || '')
  const [due, setDue] = useState(it?.due || '')
  const [note, setNote] = useState(it?.note.join('\n') || '')
  const save = () => title.trim() && onSave({ title: title.trim(), due: due || undefined, note: note.replace(/\s+$/, '') ? note.replace(/\s+$/, '').split('\n') : [] })
  const quick = (n: number) => setDue(ymd(addDays(new Date(), n)))
  return (
    <div className="flex flex-col gap-2 p-3 my-1.5 rounded-lg border border-ol bg-s2" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); save() } }}>
      <input autoFocus className={inputCls + ' bg-s1'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cosa devi fare?" aria-label="Cosa devi fare" />
      <div className="flex flex-wrap items-center gap-1.5">
        <Icon name="cal" size={15} className="text-mu" />
        <Chip on={due === todayKey()} onClick={() => quick(0)}>Oggi</Chip>
        <Chip on={due === ymd(addDays(new Date(), 1))} onClick={() => quick(1)}>Domani</Chip>
        <label className="sr-only" htmlFor="due">Scadenza</label>
        <input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-[30px] px-2 rounded-[7px] border border-ln bg-s1 text-[13px] text-tx" />
        {due && <Button size="sm" variant="ghost" onClick={() => setDue('')}>Senza data</Button>}
      </div>
      <textarea className={inputCls + ' bg-s1 h-14 py-2 resize-none'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota" aria-label="Nota" />
      <div className="flex gap-2 items-center">
        {onDelete && <Button variant="ghost" icon="trash" onClick={onDelete}>Elimina</Button>}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button variant="primary" onClick={save} disabled={!title.trim()}>{it ? 'Salva' : 'Aggiungi'}</Button>
      </div>
    </div>
  )
}

function Todos({ phone }: { phone?: boolean }) {
  const check = useStore((s) => s.check)
  const st = useStore.getState()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [showDone, setShowDone] = useState(false)
  const tk = todayKey()
  const all = todos(check).map((it, i) => ({ it, i }))
  const open = all.filter((x) => !x.it.done).sort((a, b) => (a.it.due || '9999') .localeCompare(b.it.due || '9999') || a.i - b.i)
  const closed = all.filter((x) => x.it.done).sort((a, b) => (b.it.doneAt || '').localeCompare(a.it.doneAt || ''))
  const menu: MenuEntry[] = [
    { label: showDone ? 'Nascondi le fatte' : `Mostra le fatte (${closed.length})`, icon: 'check', onClick: () => setShowDone((v) => !v) },
    ...(closed.length ? [{ label: 'Togli le fatte dalla lista', icon: 'trash' as const, onClick: () => st.mutateCheck((d) => { const s = d.find((b) => b.type === 'sec' && b.kind === 'todo'); if (s && s.type === 'sec') s.items = s.items.filter((x) => !x.done) }, 'Fatte tolte') }] : []),
    { label: 'Apri la nota Checklist', icon: 'note', onClick: () => st.open(CHECK_PATH) },
  ]
  const row = ({ it, i }: { it: Item; i: number }) =>
    editing === i ? (
      <TodoEditor key={i} it={it} onCancel={() => setEditing(null)} onSave={(v) => { st.updateItem('todo', i, { title: v.title, due: v.due, note: v.note }); setEditing(null) }}
        onDelete={() => { st.removeItem('todo', i); setEditing(null) }} />
    ) : (
      <div key={i + it.title} className="flex items-center gap-3 min-h-[50px] px-1 border-b border-ln last:border-b-0">
        <button type="button" aria-label={(it.done ? 'Riapri: ' : 'Completa: ') + it.title} onClick={() => st.toggleItem('todo', i)} className="press cursor-pointer p-1 -m-1">
          <Check done={it.done} round size={20} />
        </button>
        <button type="button" onClick={() => setEditing(i)} className="flex-1 min-w-0 text-left cursor-pointer" title="Modifica">
          <span className={clsx('block leading-snug', it.done && 'text-mu line-through')}>{it.title}</span>
          {it.note.length > 0 && <span className="block text-[12px] text-mu truncate">{it.note.join(' ')}</span>}
        </button>
        {it.done ? (
          <span className="text-[12px] text-mu whitespace-nowrap">{it.doneAt === tk ? 'oggi' : it.doneAt?.slice(5).split('-').reverse().join('/')}</span>
        ) : (
          (() => { const l = dueLabel(it.due, tk); return <span className={clsx('text-[13px] whitespace-nowrap', l.tone === 'today' || l.tone === 'late' ? 'text-ac font-semibold' : 'text-mu')}>{l.text}</span> })()
        )}
      </div>
    )
  return (
    <Card title="Da fare" plain={phone} right={<button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => setShowDone((v) => !v)}>{showDone ? 'Aperte' : 'Tutte'}{phone ? ' · ' + open.length : ''}</button>} menu={menu} flush>
      {open.length === 0 && editing !== 'new' && <Empty>Niente in sospeso.</Empty>}
      {open.map(row)}
      {showDone && closed.length > 0 && <div className="pt-2 pb-1 px-1"><span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mu">Fatte · {closed.length}</span></div>}
      {showDone && closed.map(row)}
      {editing === 'new' ? (
        <TodoEditor onCancel={() => setEditing(null)} onSave={(v) => { st.addItem('todo', v.title, { due: v.due, note: v.note }); setEditing(null) }} />
      ) : (
        <Button variant="link" icon="plus" className="self-start my-3 mx-1 text-[14px]" onClick={() => setEditing('new')}>Aggiungi</Button>
      )}
    </Card>
  )
}

// ───────────────────────── spesa ─────────────────────────
function Spesa({ phone }: { phone?: boolean }) {
  const check = useStore((s) => s.check)
  const st = useStore.getState()
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(!phone)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (adding) ref.current?.focus() }, [adding])
  const all = spesa(check).map((it, i) => ({ it, i }))
  const left = all.filter((x) => !x.it.done)
  const got = all.filter((x) => x.it.done)
  const menu: MenuEntry[] = [
    ...(got.length ? [{ label: `Togli i presi (${got.length})`, icon: 'trash' as const, onClick: () => st.mutateCheck((d) => { const s = d.find((b) => b.type === 'sec' && b.kind === 'spesa'); if (s && s.type === 'sec') s.items = s.items.filter((x) => !x.done) }, 'Lista ripulita') }] : []),
    { label: 'Apri la nota Checklist', icon: 'note', onClick: () => st.open(CHECK_PATH) },
  ]
  if (phone && !open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="press flex items-center gap-3 min-h-[52px] px-4 rounded-xl border border-ln bg-s1 cursor-pointer text-left">
        <Icon name="cart" size={17} className="text-mu" />
        <span className="flex-1 font-semibold">Lista della spesa</span>
        <Badge>{left.length}</Badge>
        <Icon name="chev" size={15} className="text-mu" />
      </button>
    )
  return (
    <Card title="Lista della spesa" plain={phone} right={<><Badge>{left.length}</Badge>{phone && <IconButton icon="chevd" label="Chiudi" size={28} onClick={() => setOpen(false)} />}</>} menu={menu}>
      <div className="flex flex-wrap gap-2">
        {[...left, ...got].map(({ it, i }) => (
          <span key={i + it.title} className={clsx('group inline-flex items-center rounded-lg border min-h-[40px]', it.done ? 'border-ln bg-transparent' : 'border-ol bg-s1')}>
            <button type="button" onClick={() => st.toggleItem('spesa', i)} aria-pressed={it.done} title={it.note.join(' ') || undefined}
              className="press inline-flex items-center gap-2.5 pl-3 pr-2 h-10 cursor-pointer">
              <Check done={it.done} size={17} />
              <span className={clsx('text-[14px]', it.done && 'text-mu line-through')}>{it.title}</span>
            </button>
            <button type="button" aria-label={'Togli: ' + it.title} onClick={() => st.removeItem('spesa', i)} className="w-7 h-10 pr-1.5 text-mu opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden cursor-pointer flex items-center justify-center">
              <Icon name="close" size={13} />
            </button>
          </span>
        ))}
        {adding ? (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { st.addItem('spesa', text); setText('') } else setAdding(false) }} className="inline-flex">
            <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setAdding(false)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder="Es. latte, pane…" aria-label="Aggiungi alla spesa" className="h-10 w-[180px] px-3 rounded-lg border border-ac bg-s1 text-tx outline-none placeholder:text-mu" />
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="press inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-dashed border-ol text-ac font-semibold text-[14px] cursor-pointer">
            <Icon name="plus" size={14} stroke={2.2} />Aggiungi
          </button>
        )}
      </div>
      {!all.length && <span className="text-[13px] text-mu">La lista è vuota.</span>}
    </Card>
  )
}

// ───────────────────────── recenti ─────────────────────────
function Recent({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const open = useStore((s) => s.open)
  const go = useStore((s) => s.go)
  const list = notes.filter((x) => !x.path.startsWith('04 Checklist/') && !x.path.startsWith('_raw/')).sort((a, b) => b.mtime - a.mtime).slice(0, phone ? 5 : 8)
  return (
    <Card title="Modificate di recente" plain={phone} right={<button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => go('note')}>Tutte le note</button>}>
      <div className="grid gap-2" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {list.map((n) => {
          const s = sectionOf(n.path)
          return (
            <button key={n.path} type="button" onClick={() => open(n.path)} className="press flex items-center gap-3 min-h-[56px] px-3.5 py-2 rounded-lg bg-s2 text-left cursor-pointer hov min-w-0">
              <Icon name="note" size={17} className="text-mu flex-none" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{n.title}</span>
                <span className="flex items-center gap-1.5 text-[12px] text-mu truncate"><Dot color={s.dot} size={5} />{s.label} · {relTime(n.mtime)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

// ───────────────────────── pagina ─────────────────────────
const CARD_LABELS: [string, string][] = [['cattura', 'Cattura veloce'], ['abitudini', 'Ogni giorno'], ['dafare', 'Da fare'], ['costanza', 'Costanza'], ['spesa', 'Lista della spesa'], ['recenti', 'Modificate di recente']]

export function HomeCardsToggles() {
  const cards = useStore((s) => s.settings.homeCards)
  const save = useStore((s) => s.saveSettings)
  return (
    <div className="flex flex-col gap-0.5 min-w-[230px]">
      {CARD_LABELS.map(([id, l]) => (
        <button key={id} type="button" role="menuitemcheckbox" aria-checked={cards[id] !== false} onClick={() => save({ homeCards: { ...cards, [id]: cards[id] === false } })}
          className="flex items-center gap-2.5 h-9 px-2 rounded-md hov cursor-pointer text-left text-[13px]">
          <Check done={cards[id] !== false} size={16} />{l}
        </button>
      ))}
    </div>
  )
}

export default function Home({ phone }: { phone?: boolean }) {
  const cards = useStore((s) => s.settings.homeCards)
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const today = new Date()
  const tk = todayKey()
  const left = daily(check).filter((it) => appliesOn(it, today.getDay()) && !isDone(log, tk, it.title)).length
  const due = todos(check).filter((t) => !t.done && t.due && t.due <= tk).length
  const sub = [dateLabel(today), left ? `manca${left > 1 ? 'no' : ''} ${left} abitudin${left > 1 ? 'i' : 'e'}` : 'abitudini fatte', due ? `${due} scadenz${due > 1 ? 'e' : 'a'}` : null].filter(Boolean).join(' · ')

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        <p className="-mt-1 mb-1 px-1 text-[13px] text-mu">{sub}</p>
        {cards.abitudini && <Habits phone />}
        {cards.costanza && <Costanza phone />}
        {cards.dafare && <Todos phone />}
        {cards.spesa && <Spesa phone />}
        {cards.recenti && <Recent phone />}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 min-h-[38px]">
        <h1 className="m-0 text-[22px] font-semibold tracking-[-0.01em]">Oggi</h1>
        <span className="text-mu text-[14px] flex-1">{sub}</span>
        <Pop title="Cosa mostrare in Home" trigger={<button type="button" className="press h-[34px] px-3 rounded-lg border border-ln bg-s1 text-[13px] inline-flex items-center gap-2 cursor-pointer hov"><Icon name="tune" size={15} />Personalizza</button>}>
          <HomeCardsToggles />
        </Pop>
      </div>
      {cards.cattura && <Capture />}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <div className="flex flex-col gap-4 min-w-0">
          {cards.abitudini && <Habits />}
          {cards.dafare && <Todos />}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          {cards.costanza && <Costanza />}
          {cards.spesa && <Spesa />}
        </div>
      </div>
      {cards.recenti && <Recent />}
    </div>
  )
}

