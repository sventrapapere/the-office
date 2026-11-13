import { useMemo, useState } from 'react'
import clsx from 'clsx'
import NumberFlow from '@number-flow/react'
import { useStore, inDir } from '../store'
import { section } from '../sections'
import { PageHead, Card, Badge, Button, IconButton, relTime, Empty, Chip, Seg, useListAnim } from '../ui/kit'
import { MdBlock } from '../ui/MdBlock'
import { Icon } from '../ui/Icon'
import { todayKey } from '../lib/checklist'
import { setFM } from '../lib/md'
import {
  JP, TRIP, ITIN, BUY, PHRASES, MONTHS, PREFERRED, SOGLIA_DIRETTO, SOGLIA_SCALO,
  checks, nextWindow, tripParams, budgetTotal, items, toggleItem, addItem, moveItem, phrases, phraseOfDay, type Check, type Item,
} from '../lib/japan'

/**
 * Giappone: voli (dal task programmato che salva un controllo in "10 Giappone/Voli/"), quando partire e budget,
 * itinerario, checklist per partire, acquisti, frase del giorno; indice e note del viaggio.
 */
const MONTH_NAME: Record<string, string> = { ott: 'ottobre', nov: 'novembre', dic: 'dicembre', gen: 'gennaio', feb: 'febbraio', mar: 'marzo', apr: 'aprile' }
const eur = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('it-IT') + ' €')
const dmy = (d: string) => d.split('-').reverse().slice(0, 2).join('/')

async function edit(path: string, f: (t: string) => string, label: string, fallback = '') {
  const st = useStore.getState()
  const cur = (await st.vault!.read(path)) ?? fallback
  const next = f(cur)
  if (next !== cur) await st.write(path, next, { undoLabel: label })
}
const ext = (u: string) => { const v = useStore.getState().vault; if (v?.openExternal) v.openExternal(u); else window.open(u, '_blank') }

// ───────────── voli ─────────────
function Trend({ list }: { list: Check[] }) {
  const pts = [...list].reverse().filter((c) => c.direct != null)
  if (pts.length < 2) return null
  const W = 260, H = 54, vals = pts.map((p) => p.direct!), lo = Math.min(...vals, SOGLIA_DIRETTO) - 40, hi = Math.max(...vals, SOGLIA_DIRETTO) + 40
  const x = (i: number) => (i / (pts.length - 1)) * (W - 8) + 4, y = (v: number) => H - 4 - ((v - lo) / (hi - lo)) * (H - 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[54px]" role="img" aria-label="Andamento del miglior diretto nei controlli">
      <line x1="0" x2={W} y1={y(SOGLIA_DIRETTO)} y2={y(SOGLIA_DIRETTO)} stroke="var(--ol)" strokeDasharray="3 4" />
      <polyline fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p, i) => `${x(i)},${y(p.direct!)}`).join(' ')} />
      {pts.map((p, i) => <circle key={p.path} cx={x(i)} cy={y(p.direct!)} r={i === pts.length - 1 ? 3.5 : 2} fill="var(--ac)"><title>{dmy(p.date)}: {eur(p.direct)}</title></circle>)}
    </svg>
  )
}

function Months({ c }: { c: Check }) {
  const vals = MONTHS.map((m) => c.months[m]).filter((v): v is number => v != null)
  if (!vals.length) return null
  const lo = Math.min(...vals), hi = Math.max(...vals)
  return (
    <div className="flex items-end gap-1.5 h-[92px]" role="img" aria-label="Miglior diretto per mese">
      {MONTHS.map((m) => {
        const v = c.months[m]
        const h = v == null ? 0 : 20 + ((v - lo) / Math.max(1, hi - lo)) * 48
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${MONTH_NAME[m]}: ${eur(v)}`}>
            <span className={clsx('num text-[10px]', v === lo ? 'text-ac font-semibold' : 'text-mu')}>{v ? Math.round(v / 10) * 10 : ''}</span>
            <span className="w-full rounded-[4px] bar-fill" style={{ height: h || 4, background: v == null ? 'var(--s2)' : v <= SOGLIA_DIRETTO ? 'var(--ok)' : PREFERRED.has(m) ? 'var(--ac)' : 'color-mix(in srgb, var(--ac) 45%, var(--bg))' }} />
            <span className={clsx('text-[11px]', PREFERRED.has(m) ? 'text-tx font-semibold' : 'text-mu')}>{m}</span>
          </div>
        )
      })}
    </div>
  )
}

function Flights({ list, phone }: { list: Check[]; phone?: boolean }) {
  const st = useStore.getState()
  const c = list[0]
  if (!c)
    return (
      <Card title="Voli" plain={phone}>
        <Empty icon="plane">
          <b className="text-tx text-[15px]">Nessun controllo ancora</b>
          Il monitoraggio programmato gira il martedì e il mercoledì alle 7:46 e salva qui ogni controllo: miglior diretto e con 1 scalo (treno da Trento incluso), prezzi per mese e andamento.
        </Empty>
      </Card>
    )
  const prev = list[1]
  const delta = c.direct != null && prev?.direct != null ? c.direct - prev.direct : null
  const row = (label: string, v: number | null, soglia: number, text: string, link: string) => (
    <div className="flex flex-col gap-1 p-3.5 rounded-lg bg-s2 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-mu flex-1">{label}</span>
        <span className={clsx('text-[11px] font-semibold px-1.5 h-5 rounded inline-flex items-center', v != null && v <= soglia ? 'bg-ok/15 text-ok' : 'bg-s3 text-mu')}>{v != null && v <= soglia ? 'sotto soglia' : `soglia ${soglia} €`}</span>
      </div>
      <div className="num text-[28px] font-semibold leading-tight text-ac">{v != null ? <NumberFlow value={v} locales="it-IT" format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }} /> : '—'}</div>
      <div className="text-[13px] leading-snug">{text || '—'}</div>
      {link && <button type="button" onClick={() => ext(link)} className="self-start text-[12px] text-ac font-semibold cursor-pointer hover:underline">Apri l’offerta</button>}
    </div>
  )
  return (
    <Card title="Voli" plain={phone} right={<span className="text-[12px] text-mu">controllo del {dmy(c.date)}{delta != null && delta !== 0 ? ` · ${delta < 0 ? '↓' : '↑'} ${Math.abs(delta)} € dal precedente` : ''}</span>}
      menu={[{ label: 'Apri il report completo', icon: 'note', onClick: () => st.open(c.path) }, ...list.slice(1, 6).map((x) => ({ label: `Controllo del ${dmy(x.date)} · ${eur(x.direct)}`, onClick: () => st.open(x.path) }))]}>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: phone ? '1fr' : '1fr 1fr' }}>
        {row('Miglior diretto · volo + treno', c.direct, SOGLIA_DIRETTO, c.directText, c.directLink)}
        {row('Con 1 scalo · volo + treno', c.stop, SOGLIA_SCALO, c.stopText, c.stopLink)}
      </div>
      <Months c={c} />
      {list.length > 1 && <div><div className="text-[12px] text-mu mb-1">Andamento del miglior diretto · {list.length} controlli</div><Trend list={list} /></div>}
      <div className="flex items-center gap-2 text-[12px] text-mu">
        <Icon name="clock" size={13} /><span className="flex-1">Prossimo controllo martedì o mercoledì alle 7:46{c.ana && !/non eseguito/i.test(c.ana) ? ` · ANA: ${c.ana}` : ''}</span>
        <button type="button" onClick={() => st.open(c.path)} className="text-ac font-semibold cursor-pointer hover:underline">Report</button>
      </div>
    </Card>
  )
}

// ───────────── quando partire e budget ─────────────
function Plan({ trip, last, phone }: { trip?: import('../lib/md').Note; last?: Check; phone?: boolean }) {
  const p = tripParams(trip)
  const w = nextWindow()
  const [month, setMonth] = useState<string>(w.months[0])
  const [days, setDays] = useState(p.giorni)
  const best = last?.months[month] ?? null
  const total = budgetTotal({ notti: days - 1, volo: best, alloggio: p.alloggio, trasporti: p.trasporti, cibo: p.cibo, extra: p.extra })
  const setParam = (k: string, v: number) => edit(TRIP, (t) => setFM(t, k, v), 'Budget aggiornato')
  const Field = ({ k, label, v, unit }: { k: string; label: string; v: number; unit: string }) => (
    <label className="flex items-center gap-2 py-1.5 border-b border-ln last:border-b-0">
      <span className="flex-1 text-[13px] text-mu">{label}</span>
      <input type="number" min={0} defaultValue={v} key={v} onBlur={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n !== v) setParam(k, n) }}
        className="num w-[72px] h-8 px-2 rounded-md bg-s2 border border-ln text-right text-[13px] outline-none focus:border-ol" aria-label={label} />
      <span className="text-[12px] text-mu w-[52px]">{unit}</span>
    </label>
  )
  return (
    <Card title="Quando partire e budget" plain={phone} menu={trip ? [{ label: 'Apri Viaggio.md', icon: 'note', onClick: () => useStore.getState().open(TRIP) }] : undefined}>
      <div className="flex items-baseline gap-3">
        <span className="num text-[34px] font-semibold text-ac leading-none">{w.open ? 'ora' : w.days}</span>
        <span className="text-[14px]">{w.open ? <>Sei nella finestra <b>{w.label}</b></> : <>giorni alla prossima finestra, <b>{w.label}</b></>}</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[12px] text-mu">Mese</span>
        <div className="flex flex-wrap gap-1.5">{MONTHS.map((m) => <Chip key={m} on={month === m} onClick={() => setMonth(m)}>{m}</Chip>)}</div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[13px] text-mu flex-1">Durata</span>
        <IconButton icon="minus" label="Un giorno in meno" size={30} onClick={() => setDays((d) => Math.max(7, d - 1))} className="border border-ln" />
        <span className="num w-[86px] text-center whitespace-nowrap"><b>{days}</b> giorni</span>
        <IconButton icon="plus" label="Un giorno in più" size={30} onClick={() => setDays((d) => Math.min(15, d + 1))} className="border border-ln" />
      </div>
      <div className="flex flex-col p-3.5 rounded-lg bg-s2">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[13px] text-mu flex-1">Totale stimato · {MONTH_NAME[month]}, {days} giorni</span>
          <span className="num text-[26px] font-semibold"><NumberFlow value={total} locales="it-IT" format={{ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }} /></span>
        </div>
        <div className="text-[12px] text-mu">Volo + treno {best != null ? eur(best) : 'non ancora visto per questo mese'} · {days - 1} notti · {days} giorni di spese</div>
      </div>
      {trip ? (
        <div className="flex flex-col">
          <Field k="alloggio_notte" label="Alloggio a notte" v={p.alloggio} unit="€" />
          <Field k="trasporti_giorno" label="Trasporti al giorno" v={p.trasporti} unit="€" />
          <Field k="cibo_giorno" label="Cibo al giorno" v={p.cibo} unit="€" />
          <Field k="extra" label="Extra (ingressi, souvenir)" v={p.extra} unit="€ totali" />
        </div>
      ) : <Empty>Manca {TRIP}.</Empty>}
      <p className="m-0 text-[12px] text-mu">Alloggio, trasporti e cibo sono stime tue: cambiale quando hai prezzi veri.</p>
    </Card>
  )
}

// ───────────── itinerario ─────────────
const GROUPS = [{ id: 'Da vedere', l: 'Da vedere' }, { id: 'Da valutare', l: 'Da valutare' }, { id: 'Da skippare', l: 'Da skippare' }] as const
function Itinerary({ note, phone }: { note?: import('../lib/md').Note; phone?: boolean }) {
  const st = useStore.getState()
  const [g, setG] = useState<(typeof GROUPS)[number]['id']>('Da vedere')
  const [city, setCity] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [where, setWhere] = useState('')
  const lists = Object.fromEntries(GROUPS.map((x) => [x.id, note ? items(note.body, new RegExp('^' + x.id, 'i')) : []])) as Record<string, Item[]>
  const cities = [...new Set(Object.values(lists).flat().map((i) => i.city).filter(Boolean))]
  const shown = lists[g].filter((i) => !city || i.city === city)
  const anim = useListAnim()
  const add = () => {
    const n = name.trim()
    if (!n) return
    const [c, ...rest] = where.split(/\s*[,·]\s*/)
    edit(ITIN, (t) => addItem(t, g, `**${n}**${c ? ` — ${c.trim()}${rest.length ? ' · ' + rest.join(', ') : ''}` : ''}`), 'Aggiunto all’itinerario')
    setName(''); setWhere('')
  }
  const maps = (i: Item) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${i.name} ${i.city || 'Japan'}`)
  return (
    <Card title="Itinerario" plain={phone} menu={note ? [{ label: 'Apri la nota', icon: 'note', onClick: () => st.open(note.path) }] : undefined}
      right={<AskBtn text="Aiutami con l'itinerario del Giappone: leggi la nota «Giappone — Itinerario e cose da skippare» in 10 Giappone e proponimi cosa aggiungere a Da vedere / Da valutare / Da skippare, una voce per riga nel formato «- **Luogo** — Città · nota». Aggiungile quando ti dico ok.">Proponi</AskBtn>}>
      <Seg label="Gruppo" value={g} onChange={setG} full options={GROUPS.map((x) => ({ id: x.id, label: phone ? x.l.replace('Da ', '').replace(/^./, (c) => c.toUpperCase()) : x.l, count: lists[x.id].length }))} />
      {cities.length > 1 && <div className="chips"><Chip on={!city} onClick={() => setCity(null)}>Tutte le città</Chip>{cities.map((c) => <Chip key={c} on={city === c} onClick={() => setCity(city === c ? null : c)}>{c}</Chip>)}</div>}
      <div ref={anim} className="flex flex-col">
        {shown.map((i) => (
          <div key={i.line} className="group flex items-center gap-3 min-h-[52px] border-b border-ln last:border-b-0">
            <button type="button" onClick={() => edit(ITIN, (t) => toggleItem(t, i.line), i.done ? 'Da rifare' : 'Fatto')} aria-label={(i.done ? 'Togli la spunta a ' : 'Segna come visto ') + i.name}
              className={clsx('w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center cursor-pointer', i.done ? 'bg-ac border-ac text-[#1A0A02]' : 'border-ol')}>{i.done && <Icon name="check" size={12} stroke={3} />}</button>
            <span className="flex-1 min-w-0"><span className={clsx('block', i.done && 'line-through text-mu')}>{i.name}{i.city && <span className="text-mu"> · {i.city}</span>}</span>{i.note && <span className="block text-[12px] text-mu truncate">{i.note}</span>}</span>
            <IconButton icon="pin" label={'Apri ' + i.name + ' su Maps'} size={30} onClick={() => ext(maps(i))} />
            {GROUPS.filter((x) => x.id !== g).map((x) => (
              <button key={x.id} type="button" onClick={() => edit(ITIN, (t) => moveItem(t, i.line, x.id), 'Spostato in ' + x.l)} className={clsx('text-[11px] text-mu px-1.5 h-7 rounded hov cursor-pointer whitespace-nowrap', !phone && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}>→ {x.l.replace('Da ', '')}</button>
            ))}
          </div>
        ))}
        {!shown.length && <Empty>Niente in «{g}»{city ? ` a ${city}` : ''}.</Empty>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex items-center gap-2">
        <Icon name="plus" size={15} className="text-mu flex-none" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Aggiungi a ${g.toLowerCase()}`} aria-label="Luogo" className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[14px] placeholder:text-mu" />
        <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Città · nota" aria-label="Città e nota" className="w-[40%] min-w-0 h-9 bg-transparent outline-none text-[14px] placeholder:text-mu border-l border-ln pl-2" />
        <button type="submit" hidden />
      </form>
    </Card>
  )
}

const AskBtn = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <Button size="sm" variant="ghost" icon="claude" onClick={() => useStore.getState().askClaude(text)}>{children}</Button>
)

// ───────────── per partire ─────────────
function Checklist({ title, path, head, note, phone, add, empty }: { title: string; path: string; head: string; note?: import('../lib/md').Note; phone?: boolean; add: string; empty: string }) {
  const [text, setText] = useState('')
  const list = note ? items(note.body, new RegExp('^' + head, 'i')) : []
  const done = list.filter((i) => i.done).length
  const anim = useListAnim()
  return (
    <Card title={title} plain={phone} right={list.length ? <span className="num text-[12px] text-mu">{done}/{list.length}</span> : undefined} menu={note ? [{ label: 'Apri la nota', icon: 'note', onClick: () => useStore.getState().open(note.path) }] : undefined}>
      {list.length > 0 && <div className="h-1.5 rounded-full bg-s2 overflow-hidden"><div className="bar-fill h-full bg-ac" style={{ width: (done / list.length) * 100 + '%' }} /></div>}
      <div ref={anim} className="flex flex-col">
        {list.map((i) => (
          <button key={i.line} type="button" onClick={() => edit(path, (t) => toggleItem(t, i.line), i.done ? 'Da fare' : 'Fatto')} className="flex items-start gap-3 py-2 text-left cursor-pointer rounded-md hov px-1">
            <span className={clsx('mt-0.5 w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center', i.done ? 'bg-ac border-ac text-[#1A0A02]' : 'border-ol')}>{i.done && <Icon name="check" size={12} stroke={3} />}</span>
            <span className="min-w-0"><span className={clsx('block text-[14px]', i.done && 'line-through text-mu')}>{i.name}</span>{i.note && <span className="block text-[12px] text-mu">{i.note}</span>}</span>
          </button>
        ))}
        {!list.length && <Empty>{empty}</Empty>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { edit(path, (x) => addItem(x, head, `[ ] ${t}`), 'Aggiunto'); setText('') } }} className="flex items-center gap-2">
        <Icon name="plus" size={15} className="text-mu" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={add} aria-label={add} className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[14px] placeholder:text-mu" />
      </form>
    </Card>
  )
}

function Phrase({ note, phone }: { note?: import('../lib/md').Note; phone?: boolean }) {
  const ps = useMemo(() => (note ? phrases(note.body) : []), [note])
  const [k, setK] = useState(0)
  const p0 = phraseOfDay(ps)
  if (!p0) return null
  const p = k ? ps[(ps.indexOf(p0) + k) % ps.length] : p0
  return (
    <Card title="Frase del giorno" plain={phone} right={<IconButton icon="refresh" label="Un’altra frase" size={30} onClick={() => setK((x) => x + 1)} />} menu={note ? [{ label: 'Apri il frasario', icon: 'note', onClick: () => useStore.getState().open(note.path) }] : undefined}>
      <div key={p.ja} className="fade-in flex flex-col gap-1">
        <span className="text-[24px] font-semibold leading-tight">{p.ja}</span>
        <span className="text-[15px]">{p.it}</span>
        <span className="text-[12px] text-mu">{p.topic}{p.note ? ' · ' + p.note : ''}</span>
      </div>
    </Card>
  )
}

// ───────────── pagina ─────────────
export default function Giappone({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [all, setAll] = useState(false)
  const [tab, setTab] = useState<'voli' | 'piano' | 'itinerario' | 'partire' | 'note'>('voli')
  const get = (p: string) => notes.find((n) => n.path === p)
  const list = useMemo(() => checks(notes), [notes])
  const trip = get(TRIP), itin = get(ITIN), buy = get(BUY), fr = get(PHRASES)
  const notesIn = useMemo(() => inDir(notes, JP).filter((n) => !n.path.startsWith(JP + '/Voli/')), [notes])
  const moc = notesIn.find((n) => /moc/i.test(n.name))
  const rest = notesIn.filter((n) => n !== moc).sort((a, b) => b.mtime - a.mtime)
  const newNote = () => st.createNote(`${JP}/Nuova nota ${todayKey()}.md`, '# Nuova nota\n\n', { edit: true, label: 'Nota creata' })

  const mocCard = moc ? (
    <Card title="Indice" plain={phone} right={<IconButton icon="edit" label="Modifica l’indice" size={30} onClick={() => { st.open(moc.path); st.setEditing(true) }} />}>
      <MdBlock text={moc.body} from={moc.path} className="moc" />
    </Card>
  ) : null
  const listCard = (
    <Card title="Note del viaggio" plain={phone} right={<Badge>{rest.length}</Badge>} flush>
      {rest.slice(0, all ? undefined : 6).map((n) => (
        <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-3 min-h-[52px] px-2 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
          <span className="flex-1 min-w-0 truncate">{n.title}</span>
          <span className="text-[12px] text-mu whitespace-nowrap">{relTime(n.mtime)}</span>
        </button>
      ))}
      {rest.length > 6 && !all && <Button variant="link" className="self-start mx-2 my-3 text-[14px]" onClick={() => setAll(true)}>Tutte le {rest.length} note</Button>}
      {!rest.length && <Empty>Ancora nessuna nota.</Empty>}
    </Card>
  )
  const ready = <Checklist title="Pronti a partire" path={TRIP} head="Pronti a partire" note={trip} phone={phone} add="Aggiungi alla checklist" empty="Checklist vuota." />
  const shop = <Checklist title="Da comprare in Giappone" path={BUY} head="Da comprare" note={buy} phone={phone} add="Aggiungi agli acquisti" empty="Niente in lista." />

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        <div className="chips" role="group" aria-label="Sezione">
          {([['voli', 'Voli'], ['piano', 'Budget'], ['itinerario', 'Itinerario'], ['partire', 'Per partire'], ['note', 'Note']] as const).map(([id, l]) => <Chip key={id} on={tab === id} onClick={() => setTab(id)}>{l}</Chip>)}
        </div>
        {tab === 'voli' && <Flights list={list} phone />}
        {tab === 'piano' && <Plan trip={trip} last={list[0]} phone />}
        {tab === 'itinerario' && <Itinerary note={itin} phone />}
        {tab === 'partire' && <><Phrase note={fr} phone />{ready}{shop}</>}
        {tab === 'note' && <>{mocCard}{listCard}</>}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <PageHead dot={section('giappone').dot} title="Giappone" sub="Viaggio in preparazione · voli dal monitoraggio programmato">
        <Button icon="plus" onClick={newNote}>Nuova nota</Button>
      </PageHead>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 1fr)' }}>
        <Flights list={list} />
        <Plan trip={trip} last={list[0]} />
      </div>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 1fr)' }}>
        <div className="flex flex-col gap-4 min-w-0"><Itinerary note={itin} />{mocCard}</div>
        <div className="flex flex-col gap-4 min-w-0"><Phrase note={fr} />{ready}{shop}{listCard}</div>
      </div>
    </div>
  )
}
