import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { Button, IconButton, Seg } from '../ui/kit'
import { Stars } from '../ui/notes'
import { Icon } from '../ui/Icon'
import { useAssetUrl } from '../lib/assets'
import { fmStr, mdRender, mdSection, setFM, type Note } from '../lib/md'
import { addIngredientsToShopping } from './Ricette'
import { useBackClose } from '../lib/backstack'

/** Scheda di una ricetta: foto, dati, ingredienti con porzioni, passaggi, modalità cucina. */

const num = (v: unknown) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x }
const listOf = (s: string) => s.split('\n').map((l) => l.match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/)?.[1]?.trim()).filter((x): x is string => !!x)
const stepsOf = (s: string) => s.split('\n').map((l) => l.match(/^\s*\d+[.)]\s+(.+)$/)?.[1]?.trim()).filter((x): x is string => !!x)
const inline = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)

/** "200 g farina" → quantità scalata in base alle porzioni. */
function scale(line: string, k: number) {
  if (k === 1) return line
  return line.replace(/^(\d+(?:[.,]\d+)?)(\s*)/, (_, n, sp) => {
    const v = parseFloat(n.replace(',', '.')) * k
    const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10
    return String(r).replace('.', ',') + sp
  })
}
/** Minuti citati in un passaggio ("cuoci 5 min") → timer. */
const minutesIn = (s: string) => { const m = s.match(/(\d+)\s*(?:min|minuti)\b/i); return m ? +m[1] : null }

function parse(n: Note) {
  const body = n.body
  const intro = (body.match(/^\s*>\s?(.+(?:\n>.*)*)/m)?.[1] || '').replace(/\n>\s?/g, ' ')
  const ingSec = mdSection(body, 'Ingredienti')
  const ingHead = ingSec.split('\n').find((l) => l.trim() && !/^\s*[-*]/.test(l))?.trim() || ''
  const steps = stepsOf(mdSection(body, 'Procedimento'))
  const extra = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()).filter((h) => !/^(Ingredienti|Procedimento|Fonte originale)$/i.test(h))
  return { intro, ing: listOf(ingSec), ingHead, steps, extra }
}

function Chip({ icon, children }: { icon?: 'clock' | 'star' | 'check'; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-bg/80 backdrop-blur text-[13px] font-semibold">{icon && <Icon name={icon} size={14} />}{children}</span>
}

/** Ingredienti con porzioni e spunte (le spunte restano solo mentre cucini). */
function Ingredients({ n, list, head, base }: { n: Note; list: string[]; head: string; base: number | null }) {
  const [por, setPor] = useState(base ?? 0)
  const [got, setGot] = useState<Set<number>>(new Set())
  const k = base && por ? por / base : 1
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-[17px] font-semibold">Ingredienti</h2>
        {base ? (
          <span className="inline-flex items-center gap-1">
            <IconButton icon="minus" label="Meno porzioni" size={30} onClick={() => setPor((p) => Math.max(1, p - 1))} className="border border-ln" />
            <span className="num min-w-[64px] text-center text-[13px]"><b className="text-[15px]">{por}</b> porz.</span>
            <IconButton icon="plus" label="Più porzioni" size={30} onClick={() => setPor((p) => p + 1)} className="border border-ln" />
          </span>
        ) : head ? <span className="text-[13px] text-mu" dangerouslySetInnerHTML={{ __html: inline(head) }} /> : null}
      </div>
      <ul className="m-0 p-0 list-none flex flex-col">
        {list.map((x, i) => (
          <li key={i}>
            <button type="button" onClick={() => setGot((s) => { const t = new Set(s); t.has(i) ? t.delete(i) : t.add(i); return t })}
              className={clsx('w-full flex items-start gap-3 py-2.5 border-b border-ln text-left cursor-pointer', got.has(i) && 'text-mu line-through decoration-mu/60')}>
              <span className={clsx('mt-0.5 w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center', got.has(i) ? 'bg-ac border-ac text-[#1A0A02]' : 'border-ol')}>{got.has(i) && <Icon name="check" size={12} stroke={3} />}</span>
              <span className="text-[15px] leading-snug" dangerouslySetInnerHTML={{ __html: inline(scale(x, k)) }} />
            </button>
          </li>
        ))}
      </ul>
      <Button icon="cart" onClick={() => addIngredientsToShopping(n)}>Metti tutto nella spesa</Button>
    </section>
  )
}

function Steps({ steps, onCook }: { steps: string[]; onCook: (i: number) => void }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="m-0 flex-1 text-[17px] font-semibold">Procedimento</h2>
        <span className="text-[13px] text-mu">{steps.length} passaggi</span>
      </div>
      <ol className="m-0 p-0 list-none flex flex-col">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-4 py-3 border-b border-ln last:border-b-0">
            <button type="button" onClick={() => onCook(i)} title="Cucina da qui" className="num w-8 h-8 flex-none rounded-full bg-s3 text-[13px] font-semibold flex items-center justify-center cursor-pointer hover:bg-ac hover:text-[#1A0A02]">{i + 1}</button>
            <span className="text-[15px] leading-relaxed pt-1" dangerouslySetInnerHTML={{ __html: inline(s) }} />
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Modalità cucina: un passaggio alla volta, testo grande, timer, schermo sempre acceso. */
function CookMode({ n, steps, ing, start, onClose, phone }: { n: Note; steps: string[]; ing: string[]; start: number; onClose: () => void; phone?: boolean }) {
  const [i, setI] = useState(start)
  const [showIng, setShowIng] = useState(false)
  const [timer, setTimer] = useState<{ end: number; label: string } | null>(null)
  const [, tick] = useState(0)
  useBackClose(true, onClose)
  useEffect(() => {
    let lock: { release: () => void } | null = null
    ;(navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } }).wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === ' ') setI((x) => Math.min(steps.length - 1, x + 1)); else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); else if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('keydown', k); lock?.release() }
  }, [steps.length, onClose])
  useEffect(() => { if (!timer) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [timer])
  const left = timer ? Math.max(0, Math.round((timer.end - Date.now()) / 1000)) : 0
  const mins = minutesIn(steps[i])
  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col fade-in">
      <div className="flex items-center gap-3 px-5 h-[60px] border-b border-ln">
        <span className="font-semibold truncate flex-1">{n.title}</span>
        <Button variant={showIng ? 'secondary' : 'ghost'} icon="cart" onClick={() => setShowIng((v) => !v)}>Ingredienti</Button>
        <IconButton icon="close" label="Esci dalla modalità cucina" onClick={onClose} />
      </div>
      <div className="h-1 bg-s2"><div className="bar-fill h-full bg-ac" style={{ width: ((i + 1) / steps.length) * 100 + '%' }} /></div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col justify-center px-6 md:px-16 max-w-[900px] mx-auto w-full">
          <span className="num text-[13px] font-semibold uppercase tracking-[0.06em] text-ac mb-4">Passaggio {i + 1} di {steps.length}</span>
          <p key={i} className={clsx('m-0 page-in leading-snug font-medium', phone ? 'text-[24px]' : 'text-[34px]')} dangerouslySetInnerHTML={{ __html: inline(steps[i]) }} />
          {mins && (!timer || timer.label !== `${i}`) && <Button variant="accent" icon="clock" onClick={() => setTimer({ end: Date.now() + mins * 60000, label: `${i}` })} className="self-start mt-8">Timer {mins} min</Button>}
          {timer && <div className="mt-8 self-start inline-flex items-center gap-3 h-12 px-4 rounded-xl bg-s2"><Icon name="clock" size={18} className="text-ac" /><span className="num text-[22px] font-semibold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>{left === 0 && <span className="text-ac font-semibold">Fatto!</span>}<IconButton icon="close" label="Ferma il timer" size={30} onClick={() => setTimer(null)} /></div>}
        </div>
        {showIng && (
          <aside className={clsx('border-l border-ln bg-s1 overflow-y-auto p-5', phone ? 'absolute inset-x-0 bottom-[84px] top-[64px] border-l-0' : 'w-[340px]')}>
            {ing.map((x, k) => <div key={k} className="py-2 border-b border-ln text-[15px]" dangerouslySetInnerHTML={{ __html: inline(x) }} />)}
          </aside>
        )}
      </div>
      <div className="flex gap-3 p-4 border-t border-ln">
        <Button size="lg" icon="back" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="flex-1">Indietro</Button>
        {i < steps.length - 1
          ? <Button size="lg" variant="accent" onClick={() => setI((x) => x + 1)} className="flex-[2]">Avanti</Button>
          : <Button size="lg" variant="accent" icon="check" onClick={onClose} className="flex-[2]">Finito</Button>}
      </div>
    </div>
  )
}

export function RecipeView({ n, phone }: { n: Note; phone?: boolean }) {
  const st = useStore.getState()
  const vault = useStore((s) => s.vault)
  const src = useAssetUrl(vault, fmStr(n.fm.foto) || null, n.path)
  const r = useMemo(() => parse(n), [n])
  const [cook, setCook] = useState<number | null>(null)
  const [tab, setTab] = useState<'ing' | 'proc'>('ing')
  const ref = useRef<HTMLDivElement>(null)
  const tested = n.fm.testato === true
  const base = num(n.fm.porzioni)
  const extraHtml = useMemo(() => r.extra.map((h) => {
    const t = mdSection(n.body, h)
    return t.trim() && !/^\s*-\s*$/.test(t) ? `<h3>${h}</h3>` + mdRender(t, { notes: useStore.getState().notes, from: n.path }) : ''
  }).join(''), [n, r.extra])
  const setTested = async (v: number | null) => {
    let t = (await vault!.read(n.path)) ?? ''
    t = setFM(t, 'testato', true)
    t = setFM(t, 'voto', v || null)
    await st.write(n.path, t, { undoLabel: v ? `Voto ${v}: ${n.title}` : 'Ricetta provata' })
  }
  const chips = (
    <div className="flex flex-wrap gap-2">
      {fmStr(n.fm.tempo_totale) && <Chip icon="clock">{fmStr(n.fm.tempo_totale).replace(/\s*\(.*\)$/, '')}</Chip>}
      {fmStr(n.fm.difficolta) && <Chip>{fmStr(n.fm.difficolta)[0].toUpperCase() + fmStr(n.fm.difficolta).slice(1)}</Chip>}
      {base && <Chip>{base} porzioni</Chip>}
      {tested ? <Chip icon="check">Provata</Chip> : <span className="inline-flex items-center h-8 px-3 rounded-full border border-dashed border-tx/60 bg-bg/60 text-[13px] font-semibold">Da provare</span>}
    </div>
  )
  const photo = (cls: string) => (
    <div className={clsx('relative overflow-hidden bg-s3', cls)}>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" /> : <Icon name="ricette" size={32} className="absolute inset-0 m-auto text-mu" />}
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
    </div>
  )
  const rating = (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[13px] text-mu">{tested ? 'Il tuo voto' : 'Provata? Dai un voto'}</span>
      <Stars value={num(n.fm.voto) ?? 0} onChange={(v) => setTested(v)} size={22} />
    </div>
  )
  const extras = extraHtml && <div className="md text-[15px] text-mu [&_h3]:text-tx [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:mt-5" dangerouslySetInnerHTML={{ __html: extraHtml }} />
  const cookBtn = r.steps.length > 0 && <Button size="lg" variant="accent" icon="play" onClick={() => setCook(0)}>Inizia a cucinare</Button>
  const cookLayer = cook != null && <CookMode n={n} steps={r.steps} ing={r.ing} start={cook} onClose={() => setCook(null)} phone={phone} />

  if (phone) return (
    <div ref={ref} className="flex flex-col gap-4 -mx-4 -mt-1 pb-24">
      <div className="relative">
        {photo('h-[260px]')}
        <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ac">{n.path.split('/')[1]}</span>
          <h1 className="m-0 text-[26px] leading-tight font-semibold">{n.title}</h1>
          {chips}
        </div>
      </div>
      <div className="px-4 flex flex-col gap-4">
        {r.intro && <p className="m-0 text-[15px] text-mu leading-relaxed" dangerouslySetInnerHTML={{ __html: inline(r.intro) }} />}
        {rating}
        <Seg label="Sezione" value={tab} onChange={setTab} size="lg" full options={[{ id: 'ing', label: `Ingredienti · ${r.ing.length}` }, { id: 'proc', label: `Procedimento · ${r.steps.length}` }]} />
        {tab === 'ing' ? <Ingredients n={n} list={r.ing} head={r.ingHead} base={base} /> : <Steps steps={r.steps} onCook={setCook} />}
        {extras}
      </div>
      {r.steps.length > 0 && <div className="fixed inset-x-4 bottom-[96px] z-20 [&>button]:w-full [&>button]:shadow-[var(--shadow)]">{cookBtn}</div>}
      {cookLayer}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="relative rounded-2xl overflow-hidden border border-ln">
        {photo('h-[300px]')}
        <div className="absolute inset-x-7 bottom-6 flex items-end gap-6">
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ac">{n.path.split('/')[1]}</span>
            <h1 className="m-0 text-[34px] leading-[1.1] font-semibold tracking-[-0.015em]">{n.title}</h1>
            {chips}
          </div>
          {cookBtn}
        </div>
      </div>
      {r.intro && <p className="m-0 text-[16px] text-mu leading-relaxed max-w-[860px]" dangerouslySetInnerHTML={{ __html: inline(r.intro) }} />}
      <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-8 items-start">
        <div className="sticky top-[76px] rounded-xl border border-ln bg-s1 p-5 flex flex-col gap-5">
          <Ingredients n={n} list={r.ing} head={r.ingHead} base={base} />
          <div className="pt-1 border-t border-ln">{rating}</div>
        </div>
        <div className="flex flex-col gap-6">
          <Steps steps={r.steps} onCook={setCook} />
          {extras}
        </div>
      </div>
      {cookLayer}
    </div>
  )
}
