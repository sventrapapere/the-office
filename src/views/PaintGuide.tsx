import { useEffect, useMemo, useState, useCallback } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { useStore } from '../store'
import { Button, IconButton, Badge, Chip, Empty } from '../ui/kit'
import { Modal } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { mdInline } from '../lib/md'
import { todayKey } from '../lib/checklist'
import { LAV, lots, setLot } from '../lib/kit'
import { parseGuides, findGuide, dryingSeconds, stepImages, mixNamesIn, type Guide, type GuideStep, type RefImg } from '../lib/guide'

/**
 * Guida "al tavolo": un passaggio alla volta, grande e leggibile, con le sei voci del formato standard,
 * il timer dell'asciugatura, i mix da preparare e le immagini di riferimento (finita da più lati + passaggi).
 * Si apre da Miniature (indirizzo #/miniature/d/guida:<titolo>[|<lotto>]); se arriva da un lotto,
 * il passaggio raggiunto si salva nella colonna «Passo» di lavorazione.md, altrimenti solo su questo dispositivo.
 */
export const GUIDE_SUB = 'guida:'
export const guideSub = (head: string, lotto?: string) => GUIDE_SUB + head + (lotto ? '|' + lotto : '')
export const RIC_PATH = '55 Miniature/Kit MESBG/ricettario-pittura.md'

const FIELDS: [keyof GuideStep['fields'], string][] = [
  ['colore', 'Colore'], ['diluizione', 'Diluizione'], ['pennello', 'Pennello e tecnica'], ['come', 'Come'],
]
const VIEWS = ['davanti', 'tre quarti', 'lato', 'dietro']
const lsKey = (h: string) => 'office.guida.' + h
const lsGet = (h: string) => { try { return parseInt(localStorage.getItem(lsKey(h)) || '', 10) || 1 } catch { return 1 } }
const lsSet = (h: string, n: number) => { try { localStorage.setItem(lsKey(h), String(n)) } catch { /* niente */ } }
const fmt = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0') }

function Inline({ text, className }: { text: string; className?: string }) {
  const notes = useStore((s) => s.notes)
  const html = useMemo(() => mdInline(text || '', { notes, from: RIC_PATH }), [text, notes])
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (a?.href && /^https?:/i.test(a.href)) { e.preventDefault(); openExt(a.href) }
  }
  return <span className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
function openExt(url: string) {
  const v = useStore.getState().vault
  if (v?.openExternal) v.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

/** Immagine esterna: se il sito la toglie, resta il collegamento alla fonte. */
function RefImage({ r, className, onClick }: { r: RefImg; className?: string; onClick?: () => void }) {
  const [bad, setBad] = useState(false)
  if (bad) return (
    <span className={clsx('flex flex-col items-center justify-center gap-1 bg-s2 text-mu text-[11px] p-2 text-center leading-tight', className)} title="Il sito che la ospitava non la mostra più: resta il collegamento alla fonte">
      <Icon name="alert" size={15} />{!/w-1[0-6]\b|w-11/.test(className || '') && 'Immagine non disponibile'}
    </span>
  )
  return <img src={r.url} alt={r.caption} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} onClick={onClick} className={clsx('object-cover bg-s2', onClick && 'cursor-zoom-in', className)} />
}

/** Riferimento ingrandito, con le frecce per scorrere. */
function Lightbox({ list, i, onClose, setI }: { list: RefImg[]; i: number | null; onClose: () => void; setI: (n: number) => void }) {
  const r = i == null ? null : list[i]
  useEffect(() => {
    if (i == null) return
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' && i < list.length - 1) setI(i + 1); if (e.key === 'ArrowLeft' && i > 0) setI(i - 1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [i, list.length, setI])
  return (
    <Modal open={!!r} onOpenChange={(o) => !o && onClose()} title={r?.caption || 'Immagine'} hideTitle className="!max-w-[min(1100px,96vw)] !w-auto">
      {r && (
        <div className="flex flex-col">
          <div className="relative bg-black flex items-center justify-center">
            <img src={r.url} alt={r.caption} referrerPolicy="no-referrer" className="max-h-[78vh] max-w-full object-contain" />
            {i! > 0 && <IconButton icon="left" label="Precedente" className="!absolute left-2 top-1/2 -translate-y-1/2 bg-black/60" onClick={() => setI(i! - 1)} />}
            {i! < list.length - 1 && <IconButton icon="right" label="Successiva" className="!absolute right-2 top-1/2 -translate-y-1/2 bg-black/60" onClick={() => setI(i! + 1)} />}
          </div>
          <div className="px-4 py-3 flex flex-col gap-1">
            <div className="text-[14px] font-medium">{r.caption}{r.view && <span className="text-mu"> · {r.view}</span>}{r.steps.length > 0 && <span className="text-mu"> · passaggio {r.steps.join(', ')}</span>}</div>
            {r.note && <div className="text-[13px] text-mu">{r.note}</div>}
            {r.source && <button type="button" onClick={() => openExt(r.source!.url)} className="self-start text-[13px] text-ac cursor-pointer hover:underline">{r.source.label} ↗</button>}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ───────────── riferimenti: la miniatura finita da più lati ─────────────
function Finished({ g, onZoom }: { g: Guide; onZoom: (list: RefImg[], i: number) => void }) {
  const f = g.refs.finished
  const [i, setI] = useState(0)
  const cur = f[Math.min(i, f.length - 1)]
  const missing = VIEWS.filter((v) => g.refs.missing.includes(v) && !f.some((x) => x.view === v))
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2"><h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-mu">Finita</h3>{f.length > 0 && <span className="text-[12px] text-mu">{f.length} {f.length === 1 ? 'foto' : 'foto'}</span>}</div>
      {cur ? (
        <>
          <RefImage r={cur} onClick={() => onZoom(f, i)} className="w-full aspect-[4/3] rounded-lg" />
          <div className="flex flex-wrap gap-1.5">
            {f.map((x, k) => <Chip key={x.url} on={k === i} onClick={() => setI(k)}>{x.view || 'foto ' + (k + 1)}</Chip>)}
            {missing.map((v) => <span key={v} className="h-8 px-3 rounded-full border border-dashed border-ol text-mu text-[13px] inline-flex items-center" title="Non trovata: chiedi a Claude di cercarla">{v}</span>)}
          </div>
          {cur.note && <p className="m-0 text-[12px] text-mu leading-snug">{cur.note}</p>}
          {cur.source && <button type="button" onClick={() => openExt(cur.source!.url)} className="self-start text-[12px] text-ac cursor-pointer hover:underline">{cur.source.label} ↗</button>}
        </>
      ) : <div className="rounded-lg bg-s2 px-3.5 py-4 text-[13px] text-mu">Nessuna foto verificata della miniatura finita{missing.length ? ` (mancano: ${missing.join(', ')})` : ''}.</div>}
      {g.refs.videos.map((v) => (
        <button key={v.url} type="button" onClick={() => openExt(v.url)} className="flex items-start gap-2.5 text-left px-2.5 py-2 rounded-md bg-s2 hov cursor-pointer">
          <Icon name="play" size={15} className="text-ac mt-0.5 flex-none" />
          <span className="min-w-0"><span className="block text-[13px] font-medium">{v.title}</span>{v.note && <span className="block text-[12px] text-mu">{v.note}</span>}</span>
        </button>
      ))}
    </section>
  )
}

function Mixes({ g, done, toggle }: { g: Guide; done: Set<string>; toggle: (n: string) => void }) {
  if (!g.mixes.length) return null
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2"><h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-mu">Mix da preparare</h3><span className="text-[12px] text-mu num">{done.size}/{g.mixes.length}</span></div>
      {g.mixes.map((m) => {
        const on = done.has(m.name)
        return (
          <button key={m.name} type="button" onClick={() => toggle(m.name)} className="flex items-start gap-3 py-2 text-left cursor-pointer rounded-md hov px-1">
            <span className={clsx('mt-0.5 w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center', on ? 'bg-ok border-ok text-[#06140D]' : 'border-ol')}>{on && <Icon name="check" size={12} stroke={3} />}</span>
            <span className={clsx('min-w-0 flex-1', on && 'opacity-55')}>
              <span className="block text-[14px] font-semibold">{m.name}</span>
              <Inline text={m.recipe} className="block text-[13px]" />
              <span className="block text-[12px] text-mu">{m.where}</span>
            </span>
          </button>
        )
      })}
      <p className="m-0 text-[12px] text-mu">Si spuntano solo su questo schermo: servono per non dimenticarne uno a inizio sessione.</p>
    </section>
  )
}

function StepList({ g, cur, go }: { g: Guide; cur: number; go: (n: number) => void }) {
  return (
    <section className="flex flex-col">
      <h3 className="m-0 mb-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-mu">Tutti i passaggi</h3>
      {g.phases.map((ph) => (
        <div key={ph.title} className="flex flex-col">
          <div className="text-[12px] text-mu pt-2 pb-1 px-1">{ph.title}</div>
          {ph.steps.map((s) => {
            const idx = g.steps.indexOf(s) + 1, past = idx < cur, now = idx === cur
            return (
              <button key={idx} type="button" onClick={() => go(idx)} className={clsx('flex items-center gap-2.5 min-h-[36px] px-1 rounded-md text-left cursor-pointer hov', now && 'bg-acs')}>
                {past ? <span className="w-5 h-5 rounded-full bg-ac text-[#1A0A02] flex items-center justify-center flex-none"><Icon name="check" size={11} stroke={3} /></span>
                  : <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center flex-none num text-[10px]', now ? 'border-[1.5px] border-ac text-ac' : 'border border-ol text-mu')}>{s.n}</span>}
                <span className={clsx('flex-1 min-w-0 truncate text-[13px]', past && 'text-mu line-through', now && 'font-semibold')}>{s.title}</span>
                {stepImages(g, s.n).length > 0 && <Icon name="eye" size={13} className="text-mu flex-none" />}
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
}

// ───────────── il passaggio corrente ─────────────
function StepCard({ g, guides, s, idx, total, timer, onTimer, onZoom, phone }: { g: Guide; guides: Guide[]; s: GuideStep; idx: number; total: number; timer: number | null; onTimer: (sec: number | null) => void; onZoom: (list: RefImg[], i: number) => void; phone?: boolean }) {
  const st = useStore.getState()
  const imgs = stepImages(g, s.n)
  const mixes = mixNamesIn(g, (s.fields.colore || '') + ' ' + (s.fields.come || ''))
  const dry = dryingSeconds(s.fields.asciugatura)
  const target = s.goto ? findGuide(guides, s.goto) : undefined
  return (
    <article className="page-in flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-[12px] text-mu">{s.phase} · passaggio <span className="num">{idx}</span> di <span className="num">{total}</span></div>
        <h2 className={clsx('m-0 font-semibold tracking-[-0.015em] leading-tight', phone ? 'text-[24px]' : 'text-[30px]')}><span className="num text-ac mr-2">{s.n}.</span>{s.title}</h2>
        {s.zone && <div className="text-[15px] text-mu italic">{s.zone}</div>}
      </div>
      {s.goto && (
        <div className="rounded-lg bg-s2 px-4 py-3.5 flex flex-wrap items-center gap-3">
          <span className="flex-1 min-w-[200px] text-[15px]">Questo passaggio è un'altra guida: <b>{s.goto}</b>{s.extra.length ? ' — ' + s.extra.join(' ') : '.'}</span>
          {target && <Button icon="right" onClick={() => st.goSub(guideSub(target.head))}>Apri la guida</Button>}
        </div>
      )}
      {!s.goto && (
        <dl className="m-0 flex flex-col rounded-xl border border-ln overflow-hidden">
          {FIELDS.map(([k, label]) => s.fields[k] && (
            <div key={k} className={clsx('flex gap-4 px-4 py-3 border-b border-ln last:border-b-0', phone && 'flex-col gap-0.5')}>
              <dt className={clsx('text-[12px] uppercase tracking-[0.06em] text-mu pt-[3px]', !phone && 'w-[150px] flex-none')}>{label}</dt>
              <dd className={clsx('m-0 flex-1 leading-snug', k === 'colore' ? 'text-[19px] font-medium' : k === 'come' ? 'text-[17px]' : 'text-[16px]')}>
                <Inline text={s.fields[k]!} />
                {k === 'colore' && mixes.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-1.5">{mixes.map((m) => <span key={m.name} className="text-[12px] px-2 py-1 rounded-md bg-s2 text-mu"><b className="text-tx">{m.name}</b> = <Inline text={m.recipe} /></span>)}</span>
                )}
              </dd>
            </div>
          ))}
          {s.extra.length > 0 && (
            <div className="px-4 py-3 text-[15px] flex flex-col gap-1">{s.extra.map((e, i) => <Inline key={i} text={e} />)}</div>
          )}
        </dl>
      )}
      {s.fields.attenzione && s.fields.attenzione !== '—' && (
        <div className="flex gap-3 rounded-xl px-4 py-3.5 bg-acs">
          <Icon name="alert" size={18} className="text-ac flex-none mt-0.5" />
          <div><div className="text-[12px] uppercase tracking-[0.06em] text-ac font-semibold mb-0.5">Attenzione</div><Inline text={s.fields.attenzione} className="text-[16px] leading-snug" /></div>
        </div>
      )}
      {s.fields.asciugatura && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ln px-4 py-3">
          <Icon name="clock" size={18} className="text-mu" />
          <span className="flex-1 min-w-[180px]"><span className="text-[12px] uppercase tracking-[0.06em] text-mu block">Asciugatura</span><Inline text={s.fields.asciugatura} className="text-[16px]" /></span>
          {timer != null ? <Button variant="secondary" icon="close" onClick={() => onTimer(null)}><span className="num">{fmt(timer)}</span> · Ferma</Button>
            : dry ? <Button icon="clock" onClick={() => onTimer(dry)}>Avvia timer {fmt(dry)}</Button> : null}
        </div>
      )}
      {imgs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-mu">Come viene, da una guida vera</h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${phone ? 140 : 180}px, 1fr))` }}>
            {imgs.map((r) => (
              <figure key={r.url + r.steps.join()} className="m-0 flex flex-col gap-1">
                <RefImage r={r} onClick={() => onZoom(imgs, imgs.indexOf(r))} className="w-full aspect-square rounded-lg" />
                <figcaption className="text-[12px] text-mu leading-snug">{r.note || r.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

// ───────────── pagina ─────────────
export default function PaintGuide({ sub, phone }: { sub: string; phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const st = useStore.getState()
  const [headRaw, lotto] = sub.slice(GUIDE_SUB.length).split('|')
  const ric = notes.find((n) => n.path === RIC_PATH)
  const lav = notes.find((n) => n.path === LAV)
  const guides = useMemo(() => parseGuides(ric?.body || ''), [ric?.body])
  const g = findGuide(guides, headRaw)
  const lot = lotto && lav ? lots(lav.body).find((l) => l.lotto === lotto) : undefined
  const total = g?.steps.length || 0
  const [cur, setCurState] = useState(() => Math.max(1, (lot?.passo ?? (g ? lsGet(g.head) : 1)) || 1))
  const [tab, setTab] = useState<'passo' | 'rif' | 'mix' | 'tutti'>('passo')
  const [mixDone, setMixDone] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState<{ list: RefImg[]; i: number } | null>(null)
  const [timer, setTimer] = useState<number | null>(null)

  const clamped = Math.min(Math.max(cur, 1), Math.max(total, 1))
  const finished = cur > total && total > 0
  const setCur = useCallback((n: number) => {
    if (!g) return
    const next = Math.max(1, Math.min(n, total + 1))
    setCurState(next)
    if (lot) {
      const t = useStore.getState().notes.find((x) => x.path === LAV)?.body
      if (t != null) {
        const p = next > total ? total : next
        useStore.getState().write(LAV, setLot(t, lot.lotto, { ...lot, passo: p, agg: todayKey() }))
      }
    } else lsSet(g.head, next)
  }, [g, lot, total])

  // timer dell'asciugatura
  useEffect(() => {
    if (timer == null) return
    if (timer <= 0) {
      setTimer(null)
      toast.success('Asciutto: puoi andare avanti')
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('The Office', { body: 'Asciutto: puoi andare avanti' }) } catch { /* niente */ }
      try { navigator.vibrate?.([200, 100, 200]) } catch { /* niente */ }
      return
    }
    const t = setTimeout(() => setTimer((x) => (x == null ? null : x - 1)), 1000)
    return () => clearTimeout(t)
  }, [timer])
  const startTimer = (s: number | null) => {
    setTimer(s)
    try { if (s && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission() } catch { /* niente */ }
  }

  // schermo acceso mentre dipingi
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }
    const req = () => nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    req()
    const vis = () => { if (document.visibilityState === 'visible') req() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}) }
  }, [])

  // tastiera: ← → per scorrere, Invio = fatto
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (zoom || (e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable]')) return
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); setCur(clamped + 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setCur(clamped - 1) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [clamped, setCur, zoom])

  if (!ric) return <Empty icon="brush">Ricettario non trovato nel kit.</Empty>
  if (!g) return (
    <div className="flex flex-col gap-3">
      <Button variant="ghost" icon="back" onClick={() => st.back()} className="self-start">Miniature</Button>
      <Empty icon="brush">Non trovo la guida «{headRaw}» nel ricettario.</Empty>
    </div>
  )

  const s = g.steps[clamped - 1]
  const askImgs = () => st.askClaude(`Cerca immagini di riferimento per lo schema «${g.head}» seguendo lo standard del ricettario: la miniatura finita da più lati (davanti, lato, dietro) e le foto dei passaggi, guardando OGNI immagine prima di inserirla (stessa scultura? stessi colori? niente illustrazioni, loghi o miniature diverse). ${g.refs.missing.length ? `Mancano: ${g.refs.missing.join(', ')}. ` : ''}Quando ti dico di sì, aggiorna la sezione «Immagini di riferimento» della guida in ricettario-pittura.md.`, 'mesbg')
  const askStep = () => s && st.askClaude(`Sto dipingendo con lo schema «${g.head}», passaggio ${s.n} («${s.title}»)${lot ? ` del lotto «${lot.lotto}»` : ''}. Ho un dubbio: `, 'mesbg')
  const zoomTo = (list: RefImg[], i: number) => setZoom({ list, i })

  const head = (
    <header className={clsx('flex items-center gap-3', phone ? 'flex-wrap' : '')}>
      <IconButton icon="back" label="Indietro" onClick={() => st.back()} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-mu truncate">Al tavolo{lot ? ' · ' + lot.lotto : ''}</div>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] truncate">{g.title}{g.sub && <span className="text-mu font-normal"> — {g.sub}</span>}</h1>
      </div>
      {timer != null && <Badge tone="accent"><span className="num">{fmt(timer)}</span></Badge>}
      {!phone && <Button size="sm" variant="ghost" icon="note" onClick={() => st.open(RIC_PATH, g.head)}>Nel ricettario</Button>}
      {!phone && <Button size="sm" variant="ghost" icon="claude" onClick={askStep}>Chiedi</Button>}
    </header>
  )
  const progress = (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-s2" aria-label={`Passaggio ${clamped} di ${total}`}>
      <span className="bg-ac transition-[width] duration-300 ease-out" style={{ width: `${((finished ? total : clamped - 1) / Math.max(total, 1)) * 100}%` }} />
    </div>
  )
  const intro = (g.aspetto || g.oltre || g.fonte) && (
    <div className="flex flex-col gap-1 text-[13px] text-mu">
      {g.aspetto && <div><b className="text-tx font-medium">Aspetto:</b> <Inline text={g.aspetto} /></div>}
      {g.oltre && <div><b className="text-tx font-medium">Oltre ai tuoi colori:</b> <Inline text={g.oltre} /></div>}
      {g.fonte && <div><b className="text-tx font-medium">Fonte:</b> <Inline text={g.fonte} /></div>}
    </div>
  )
  const prima = g.prima.length > 0 && clamped === 1 && !finished && (
    <div className="rounded-xl bg-s2 px-4 py-3.5 flex flex-col gap-1.5">
      <div className="text-[12px] uppercase tracking-[0.06em] text-mu font-semibold">Prima di cominciare</div>
      {g.prima.map((p, i) => <div key={i} className="flex gap-2 text-[15px] leading-snug"><span className="text-mu">·</span><Inline text={p} /></div>)}
    </div>
  )
  const done = (
    <div className="page-in rounded-xl bg-s2 px-5 py-6 flex flex-col gap-3 items-start">
      <div className="w-10 h-10 rounded-full bg-ok text-[#06140D] flex items-center justify-center"><Icon name="check" size={20} stroke={3} /></div>
      <h2 className="m-0 text-[24px] font-semibold">Guida finita</h2>
      <p className="m-0 text-mu text-[15px]">{lot ? `Ricordati di spostare i pezzi finiti nella colonna «Finiti» del lotto ${lot.lotto}.` : 'Tutti i passaggi fatti.'}</p>
      <Button onClick={() => setCur(1)} icon="undo">Ricomincia dal primo</Button>
    </div>
  )
  const nav = (
    <div className={clsx('flex items-center gap-2', phone && 'sticky z-10 -mx-3 px-3 py-2 bg-bg/95 backdrop-blur border-t border-ln bottom-[calc(72px+env(safe-area-inset-bottom))]')}>
      <Button variant="secondary" icon="left" disabled={clamped <= 1 && !finished} onClick={() => setCur((finished ? total + 1 : clamped) - 1)}>{phone ? '' : 'Precedente'}</Button>
      <span className="flex-1 text-center text-[13px] text-mu num">{finished ? `${total}/${total}` : `${clamped}/${total}`}</span>
      {!finished && <Button variant="primary" icon="check" onClick={() => setCur(clamped + 1)}>{clamped === total ? 'Fatto, ho finito' : 'Fatto, avanti'}</Button>}
    </div>
  )
  const refsPanel = (
    <div className="flex flex-col gap-5">
      <Finished g={g} onZoom={zoomTo} />
      {g.refs.steps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.06em] text-mu">Passaggi in foto</h3>
          <div className="grid grid-cols-4 gap-1.5">
            {g.refs.steps.map((r, i) => (
              <button key={r.url + i} type="button" onClick={() => r.steps[0] ? setCur(g.steps.findIndex((x) => x.n === r.steps[0]) + 1) : zoomTo(g.refs.steps, i)} className="relative cursor-pointer" title={`Passaggio ${r.steps.join(', ')} · ${r.caption}`}>
                <RefImage r={r} className="w-full aspect-square rounded-md" />
                <span className="absolute left-1 bottom-1 text-[10px] num px-1 rounded bg-black/70 text-white">{r.steps.join(',')}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {g.refs.intro && <p className="m-0 text-[12px] text-mu leading-snug">{g.refs.intro}</p>}
      <Button size="sm" variant="ghost" icon="claude" className="self-start" onClick={askImgs}>{g.refs.missing.length || !g.refs.finished.length ? 'Cerca le immagini che mancano' : 'Cerca altre immagini'}</Button>
    </div>
  )

  const lightbox = <Lightbox list={zoom?.list || []} i={zoom?.i ?? null} onClose={() => setZoom(null)} setI={(i) => setZoom((z) => (z ? { ...z, i } : z))} />
  const main = finished ? done : s && <StepCard key={clamped} g={g} guides={guides} s={s} idx={clamped} total={total} timer={timer} onTimer={startTimer} onZoom={zoomTo} phone={phone} />
  const mixToggle = (n: string) => setMixDone((d) => { const x = new Set(d); if (x.has(n)) x.delete(n); else x.add(n); return x })

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        {head}
        {progress}
        <div className="chips" role="group" aria-label="Vista">
          <Chip on={tab === 'passo'} onClick={() => setTab('passo')}>Passaggio</Chip>
          <Chip on={tab === 'rif'} onClick={() => setTab('rif')} count={g.refs.finished.length + g.refs.steps.length || undefined}>Riferimenti</Chip>
          {g.mixes.length > 0 && <Chip on={tab === 'mix'} onClick={() => setTab('mix')}>Mix</Chip>}
          <Chip on={tab === 'tutti'} onClick={() => setTab('tutti')}>Tutti</Chip>
        </div>
        {tab === 'passo' && <>{prima}{main}</>}
        {tab === 'rif' && <>{intro}{refsPanel}</>}
        {tab === 'mix' && <Mixes g={g} done={mixDone} toggle={mixToggle} />}
        {tab === 'tutti' && <StepList g={g} cur={finished ? total + 1 : clamped} go={(n) => { setCur(n); setTab('passo') }} />}
        {nav}
        {lightbox}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      {head}
      {progress}
      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)' }}>
        <div className="flex flex-col gap-4 min-w-0">
          {prima}
          {main}
          {nav}
          <p className="m-0 text-[12px] text-mu">← → per scorrere · Invio = fatto · {lot ? 'il passaggio si salva nel lotto' : 'il passaggio si ricorda su questo dispositivo'}</p>
        </div>
        <aside className="flex flex-col gap-6 min-w-0 lg:sticky lg:top-4 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
          {intro}
          {refsPanel}
          <Mixes g={g} done={mixDone} toggle={mixToggle} />
          <StepList g={g} cur={finished ? total + 1 : clamped} go={setCur} />
        </aside>
      </div>
      {lightbox}
    </div>
  )
}

/** Miniatura della prima immagine verificata, per le schede del ricettario. */
export function GuideThumb({ g, className }: { g: Guide; className?: string }) {
  const r = g.refs.finished[0]
  if (!r) return <span className={clsx('flex items-center justify-center bg-s2 text-mu', className)}><Icon name="brush" size={16} /></span>
  return <RefImage r={r} className={className} />
}
