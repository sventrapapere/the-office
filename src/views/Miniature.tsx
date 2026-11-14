import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { useStore } from '../store'
import { section } from '../sections'
import { PageHead, Card, useListAnim, Badge, Empty, Button, IconButton, Chip, Seg, inputCls } from '../ui/kit'
import { Modal } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { mdSection, mdTable, type Note } from '../lib/md'
import { todayKey } from '../lib/checklist'
import { parseGuides, findGuide, type Guide } from '../lib/guide'
import PaintGuide, { GUIDE_SUB, guideSub, GuideThumb } from './PaintGuide'
import { KIT, LAV, INV, GAMES, STAGES, lots, setLot, punto, schemes, addScheme, nextSteps, quadro, wishes, addWish, removeWish, questions, toggleQuestion, games as parseGames, addGame, type Lot, type Game } from '../lib/kit'

/**
 * Miniature (MESBG). Unica fonte: i file del Kit ("55 Miniature/Kit MESBG", sincronizzati con Documenti\Kit MESBG),
 * gli stessi che usa l'agente del progetto. La pagina li legge e cambia solo righe e tabelle nel loro formato
 * (vedi src/lib/kit.ts); per tutto quello che richiede giudizio passa la palla all'agente (askClaude 'mesbg').
 */
const MIN_DIR = '55 Miniature'
const KIT_DIR = KIT
const KIT_PAIR = 'Kit MESBG'
const RIC_FILE = KIT + '/ricettario-pittura.md'
const STAGE_C = ['var(--s3)', 'color-mix(in srgb, var(--ac) 30%, var(--bg))', 'color-mix(in srgb, var(--ac) 52%, var(--bg))', 'color-mix(in srgb, var(--ac) 75%, var(--bg))', 'var(--ac)']
const RM_CAP: Record<number, string> = {
  1: 'Introduzione e regole di base', 2: 'Sequenza del turno, priorità, movimento', 3: 'Movimento: cariche e terreno', 4: 'Fase di tiro',
  5: 'Fase di combattimento', 6: 'Coraggio, intelligenza e tipi di unità', 7: 'Cavalleria', 8: 'Eroi: Might, Will, Fate e azioni eroiche',
  9: 'Mostri, bestie da guerra e carri', 10: 'Armi ed equipaggiamento', 11: 'Magia', 12: 'Regole speciali',
  13: 'Regole avanzate e macchine d’assedio', 14: 'Assedi', 15: 'Narrative Play e Matched Play', 16: 'Scenari di Matched Play',
}
const LIBRARY: [string, string, 'pdf' | 'dir'][] = [
  ['Rules Manual 2024 · ITA', 'Manuale ITA/Rules-Manual-2024-ITA.pdf', 'pdf'],
  ['Vademecum · PDF', 'Manuale ITA/Vademecum-MESBG-prime-partite.pdf', 'pdf'],
  ['Armies of The Lord of the Rings', 'LOTR Manuals/Middle-Earth_SBG_Armies_of_The_Lord_of_the_Rings_2024.pdf', 'pdf'],
  ['Armies of The Hobbit', 'LOTR Manuals/Middle-Earth_SBG_Armies_of_the_Hobbit_2024.pdf', 'pdf'],
  ['Supplementi gratuiti GW', 'Supplementi gratuiti GW', 'dir'],
  ['Terreno 3D', 'Terreno 3D', 'dir'],
  ['Cartella del kit', '', 'dir'],
]
const strip = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
const n0 = (v: unknown) => { const x = parseInt(String(v ?? ''), 10); return isNaN(x) ? 0 : x }

function kitOpen(rel: string, desktop: boolean) {
  if (!desktop) { toast('I file del kit si aprono dall’app sul PC.'); return }
  fetch('/_api/open-source?pair=' + encodeURIComponent(KIT_PAIR) + '&rel=' + encodeURIComponent(rel)).then((r) => { if (r.status === 404) toast('File non trovato nel kit: ' + rel) }).catch(() => toast('L’app non riesce ad aprire il file.'))
}

/** Titoli dei passaggi di uno schema del ricettario (formato standard delle guide). */
export function recipeSteps(ricettario: string, head: string): string[] {
  const g = findGuide(parseGuides(ricettario), head)
  return g ? g.steps.map((s) => s.title) : []
}

/** Legge un file del kit, lo trasforma e lo riscrive (con "Annulla"). */
async function edit(path: string, f: (t: string) => string, label: string, fallback = '') {
  const st = useStore.getState()
  const cur = (await st.vault!.read(path)) ?? fallback
  const next = f(cur)
  if (next !== cur) await st.write(path, next, { undoLabel: label })
}
const ask = (text: string) => useStore.getState().askClaude(text, 'mesbg')
const AskBtn = ({ text, children, variant = 'secondary', size }: { text: string; children: React.ReactNode; variant?: 'secondary' | 'accent' | 'ghost'; size?: 'sm' }) => (
  <Button variant={variant} size={size} icon="claude" onClick={() => ask(text)}>{children}</Button>
)

// ───────────── il punto e i prossimi passi ─────────────
function Focus({ lav, phone }: { lav: Note; phone?: boolean }) {
  const p = punto(lav.body)
  const steps = nextSteps(lav.body)
  const st = useStore.getState()
  return (
    <Card title="A che punto sei" plain={phone} menu={[{ label: 'Apri lavorazione.md', icon: 'note', onClick: () => st.open(lav.path, '6. Prossimi passi') }]}>
      {p && <p className="m-0 text-[18px] leading-snug font-medium" dangerouslySetInnerHTML={{ __html: p.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') }} />}
      <ol className="m-0 p-0 list-none flex flex-col">
        {steps.map((s) => (
          <li key={s.n} className="group flex items-center gap-3 min-h-[44px] border-b border-ln last:border-b-0">
            {s.done ? <span className="w-[22px] h-[22px] rounded-full bg-ac text-[#1A0A02] flex items-center justify-center flex-none"><Icon name="check" size={13} stroke={3} /></span>
              : <span className="w-[22px] h-[22px] rounded-full border border-ol text-mu num text-[11px] flex items-center justify-center flex-none">{s.n}</span>}
            <span className={clsx('flex-1 text-[14px]', s.done && 'line-through text-mu')}>{s.text}</span>
            {!s.done && <button type="button" onClick={() => ask(`Prossimo passo dalla lavorazione: «${s.text}». Aiutami a farlo, partendo da quello che c'è già nei file.`)} className={clsx('text-[12px] font-semibold text-ac px-2 h-7 rounded-md hov cursor-pointer whitespace-nowrap', !phone && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}>Chiedi</button>}
          </li>
        ))}
      </ol>
      {!steps.length && <Empty>Nessun prossimo passo in lavorazione.md §6.</Empty>}
      <div className="flex flex-wrap gap-2">
        <AskBtn text="Rivediamo i prossimi passi: guarda inventario, lavorazione e partite e dimmi da dove ripartire. Se cambia qualcosa, aggiorna §6 di lavorazione.md quando te lo dico.">Rivedi i prossimi passi</AskBtn>
      </div>
    </Card>
  )
}

// ───────────── lotti in lavorazione ─────────────
function LotCard({ lot, lav, guides, phone }: { lot: Lot; lav: Note; guides: Guide[]; phone?: boolean }) {
  const st = useStore.getState()
  const total = lot.pezzi || lot.fasi.reduce((a, b) => a + b, 0)
  const save = (next: Partial<Lot>, label: string) => edit(LAV, (t) => setLot(t, lot.lotto, { ...lot, ...next, agg: todayKey() }), label)
  const move = (i: number, d: 1 | -1) => {
    const j = i + d
    if (j < 0 || j >= STAGES.length || lot.fasi[i] <= 0) return
    const f = [...lot.fasi]; f[i]--; f[j]++
    save({ fasi: f }, `1 pezzo: ${STAGES[i]} → ${STAGES[j]}`)
  }
  const heads = guides.map((g) => g.head).filter((h) => !/scenografia|basette/i.test(h))
  const chosen = schemes(lav.body)
  const guide = lot.schema ? findGuide(guides, lot.schema) : undefined
  const steps = guide ? guide.steps.map((s) => s.title) : []
  const table = () => guide && st.goSub(guideSub(guide.head, lot.lotto))
  const step = lot.passo ?? 1
  const useScheme = (h: string) => edit(LAV, (t) => addScheme(setLot(t, lot.lotto, { ...lot, schema: h, passo: 1, agg: todayKey() }), { cosa: lot.lotto, schema: h, fonte: 'ricettario-pittura.md', manca: 'da verificare con Claude' }), 'Schema scelto: ' + h.split(/\s+—\s+/)[0])
  const name = lot.lotto.replace(/^[A-Z]{2,5}\s+—\s+/, '')
  return (
    <Card title={phone ? 'In lavorazione' : `In lavorazione · ${name}`} plain={phone}
      right={guide && !phone ? <Button size="sm" variant="ghost" onClick={() => st.open(RIC_FILE, guide.head)}>Nel ricettario</Button> : undefined}
      menu={[
        ...chosen.map((c) => ({ label: 'Schema: ' + c.schema.split(/\s+—\s+/)[0], checked: c.schema === lot.schema, onClick: () => save({ schema: c.schema, passo: 1 }, 'Schema cambiato') })),
        ...(chosen.length ? [{ sep: true, label: '', onClick: () => {} }] : []),
        ...heads.filter((h) => !chosen.some((c) => c.schema === h)).map((h) => ({ label: 'Dal ricettario: ' + h.split(/\s+—\s+/)[0], onClick: () => useScheme(h) })),
        { sep: true, label: '', onClick: () => {} },
        { label: 'Apri la tabella in lavorazione.md', icon: 'note', onClick: () => st.open(lav.path, 'Avanzamento dei lotti') },
      ]}>
      <div>
        {phone && <div className="text-[20px] font-semibold">{name} × {total}</div>}
        <div className="text-[13px] text-mu">{lot.schema ? `Schema: ${lot.schema.split(/\s+—\s+/).pop()}${steps.length ? ` · passaggio ${Math.min(step, steps.length)} di ${steps.length}` : ''}` : 'Nessuno schema scelto'} · {lot.fasi[4]} finit{lot.fasi[4] === 1 ? 'o' : 'i'} su {total}{lot.agg ? ` · aggiornato ${lot.agg.split('-').reverse().slice(0, 2).join('/')}` : ''}</div>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[3px] bg-s2" aria-label="Avanzamento del lotto">
        {STAGES.map((s, i) => lot.fasi[i] > 0 && <span key={s} className="transition-[flex-grow] duration-300 ease-out" style={{ flex: lot.fasi[i], background: STAGE_C[i] }} title={`${s}: ${lot.fasi[i]}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {STAGES.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-md text-[13px] text-mu hov">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STAGE_C[i], boxShadow: i === 0 ? 'inset 0 0 0 1px var(--ol)' : undefined }} />
            {s} · <span className="num text-tx">{lot.fasi[i]}</span>
            {i < STAGES.length - 1 && <button type="button" disabled={!lot.fasi[i]} onClick={() => move(i, 1)} aria-label={`Sposta un pezzo da ${s} a ${STAGES[i + 1]}`} title={`Un pezzo → ${STAGES[i + 1]}`} className="w-6 h-6 rounded flex items-center justify-center text-mu hover:text-tx hover:bg-s3 disabled:opacity-30 cursor-pointer disabled:cursor-default"><Icon name="right" size={13} stroke={2.4} /></button>}
          </span>
        ))}
      </div>
      {!lot.schema && (
        <div className="flex flex-col gap-2.5 p-3.5 rounded-lg bg-s2">
          <span className="text-[14px]"><b>Prima di colorare si sceglie lo schema.</b> L’agente guarda il ricettario, cerca come lo dipingono altri pittori e ti propone qualche possibilità; quella che scegli finisce in lavorazione.md e qui compaiono i passaggi.</span>
          <div className="flex flex-wrap gap-2">
            <AskBtn variant="accent" text={`Vorrei scegliere lo schema di colore per il lotto «${lot.lotto}». Segui il procedimento delle istruzioni: guarda il ricettario, cerca sul web e proponimi qualche possibilità con le fonti. Quando scelgo, salvalo in lavorazione.md §5 e nella tabella Avanzamento dei lotti.`}>Scegli lo schema con Claude</AskBtn>
            {heads.some((h) => h.toLowerCase().includes(name.toLowerCase().split(' ').pop()!.replace(/s$/, ''))) && (() => {
              const h = heads.find((x) => x.toLowerCase().includes(name.toLowerCase().split(' ').pop()!.replace(/s$/, '')))!
              return <Button onClick={() => useScheme(h)}>Usa «{h.split(/\s+—\s+/)[0]}» dal ricettario</Button>
            })()}
          </div>
        </div>
      )}
      {guide && (
        <button type="button" onClick={table} className="flex items-center gap-3 p-2.5 pr-3.5 rounded-xl bg-s2 hov cursor-pointer text-left press">
          <GuideThumb g={guide} className="w-16 h-16 rounded-lg flex-none" />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] text-mu">Passaggio <span className="num">{Math.min(step, steps.length)}</span> di <span className="num">{steps.length}</span></span>
            <span className="block text-[16px] font-semibold truncate">{steps[Math.min(step, steps.length) - 1]}</span>
            <span className="block text-[12px] text-mu truncate">{guide.refs.finished.length + guide.refs.steps.length ? `${guide.refs.finished.length + guide.refs.steps.length} immagini di riferimento` : 'nessuna immagine di riferimento ancora'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-ac text-[#1A0A02] font-semibold text-[14px] flex-none"><Icon name="brush" size={15} />Al tavolo</span>
        </button>
      )}
      {lot.schema && !guide && <Empty>Non trovo «{lot.schema}» nel ricettario.</Empty>}
      {lot.schema && (
        <div className="flex flex-wrap gap-2">
          <AskBtn size="sm" text={`Sto dipingendo il lotto «${lot.lotto}» con lo schema «${lot.schema}», sono al passaggio ${step}${steps[step - 1] ? ` («${steps[step - 1]}»)` : ''}. Spiegami come farlo bene con i colori che ho.`}>Come faccio questo passaggio?</AskBtn>
        </div>
      )}
    </Card>
  )
}

// ───────────── collezione, desideri, domande ─────────────
function Collection({ inv, phone }: { inv: Note; phone?: boolean }) {
  const st = useStore.getState()
  const q = quadro(inv.body).filter(([k]) => /pezzi|eroi|eserciti|prossimo acquisto|blocco/i.test(k))
  return (
    <Card title="Collezione" plain={phone} menu={[{ label: 'Apri inventario.md', icon: 'note', onClick: () => st.open(inv.path) }]}>
      <dl className="m-0 flex flex-col">
        {q.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2 border-b border-ln last:border-b-0">
            <dt className="w-[130px] flex-none text-[13px] text-mu">{k.replace(/, zero acquisti/, '')}</dt><dd className="m-0 flex-1 text-[14px]">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <AskBtn text="Ho delle novità per la collezione: ti dico cosa ho preso o finito e tu aggiorni inventario.md (e lavorazione.md, compresa la tabella dei lotti, se servono)." >Aggiorna l’inventario</AskBtn>
        <AskBtn variant="ghost" text="Con quello che ho in inventario, cosa conviene prendere adesso? Ricorda le mie regole: solo cose che mi piacciono, e solo se servono adesso. Dimmi anche cosa NON comprare.">Cosa comprare dopo?</AskBtn>
      </div>
    </Card>
  )
}

function Wishlist({ inv, phone }: { inv: Note; phone?: boolean }) {
  const [text, setText] = useState('')
  const items = wishes(inv.body)
  const wl = useListAnim()
  const add = () => { const t = text.trim(); if (!t) return; edit(INV, (x) => addWish(x, t), 'Aggiunto ai desideri'); setText('') }
  return (
    <Card title="Lista dei desideri" plain={phone} right={<Badge>{items.length}</Badge>}>
      <div className="px-3.5 py-3 rounded-lg bg-s2 text-[14px] leading-snug"><b>La tua regola:</b> solo cose che ti piacciono davvero, e solo quando servono.</div>
      <div ref={wl} className="flex flex-col">{items.map((it) => (
        <div key={it.line} className="group flex items-center gap-3 min-h-[48px] border-b border-ln last:border-b-0">
          <span className="flex-1 min-w-0"><span className="block">{it.name}</span>{it.note && <span className="block text-[12px] text-mu">{it.note}</span>}</span>
          <button type="button" onClick={() => ask(`Sto pensando a «${it.name}» dalla lista dei desideri. Mi serve davvero adesso? Se sì, cosa prendere esattamente e a che prezzo (verifica sul web).`)} className="text-[12px] font-semibold text-ac px-2 h-7 rounded-md hov cursor-pointer">Valuta</button>
          <IconButton icon="close" label={'Togli ' + it.name} size={28} onClick={() => edit(INV, (x) => removeWish(x, it.line), 'Tolto dai desideri')} />
        </div>
      ))}</div>
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex items-center gap-2">
        <Icon name="plus" size={15} className="text-mu" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Aggiungi (es. Guerrieri nani — da cercare su Vinted)" aria-label="Aggiungi ai desideri" className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[14px] placeholder:text-mu" />
      </form>
    </Card>
  )
}

function Questions({ inv, phone }: { inv: Note; phone?: boolean }) {
  const qs = questions(inv.body)
  if (!qs.length) return null
  const open = qs.filter((q) => !q.done)
  return (
    <Card title="Da chiarire" plain={phone} right={<Badge tone={open.length ? 'accent' : undefined}>{open.length} aperte</Badge>}>
      {qs.map((q) => (
        <button key={q.line} type="button" onClick={() => edit(INV, (x) => toggleQuestion(x, q.line, todayKey()), q.done ? 'Domanda riaperta' : 'Domanda chiarita')} className="flex items-start gap-3 py-2 text-left cursor-pointer rounded-md hov px-1">
          <span className={clsx('mt-0.5 w-[18px] h-[18px] rounded-[5px] border flex-none flex items-center justify-center', q.done ? 'bg-ac border-ac text-[#1A0A02]' : 'border-ol')}>{q.done && <Icon name="check" size={12} stroke={3} />}</span>
          <span className={clsx('text-[14px]', q.done && 'line-through text-mu')}>{q.text}</span>
        </button>
      ))}
    </Card>
  )
}

// ───────────── partite ─────────────
function GameForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [g, setG] = useState<Omit<Game, 'line'>>({ date: todayKey(), scen: '', vs: '', res: 'vinta', note: '' })
  const save = async () => {
    await edit(GAMES, (t) => addGame(t, g), 'Partita registrata', '# Partite giocate\n\n## Registro\n\n')
    onClose()
    setG({ date: todayKey(), scen: '', vs: '', res: 'vinta', note: '' })
  }
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Registra partita">
      <form className="flex flex-col gap-3 px-4 pb-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="flex gap-2">
          <input type="date" className={inputCls + ' w-44'} value={g.date} onChange={(e) => setG({ ...g, date: e.target.value })} aria-label="Data" />
          <input className={inputCls} value={g.scen} onChange={(e) => setG({ ...g, scen: e.target.value })} placeholder="Scenario (es. Domina il campo)" aria-label="Scenario" />
        </div>
        <input className={inputCls} value={g.vs} onChange={(e) => setG({ ...g, vs: e.target.value })} placeholder="Contro chi, con che esercito" aria-label="Avversario" />
        <Seg label="Risultato" value={g.res} onChange={(res) => setG({ ...g, res })} options={[{ id: 'vinta', label: 'Vinta' }, { id: 'pari', label: 'Pari' }, { id: 'persa', label: 'Persa' }]} />
        <input className={inputCls} value={g.note} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="Note (cosa ha funzionato, regole sbagliate…)" aria-label="Note" />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annulla</Button><Button variant="primary" type="submit">Registra</Button></div>
      </form>
    </Modal>
  )
}

function Games({ games, onAdd, phone }: { games?: Note; onAdd: () => void; phone?: boolean }) {
  const st = useStore.getState()
  const list = parseGames(games?.body || '')
  const gl = useListAnim()
  const last = list[0]
  return (
    <Card title="Partite" plain={phone} right={list.length ? <Badge>{list.length}</Badge> : undefined} menu={[{ label: 'Registra partita', icon: 'plus', onClick: onAdd }, ...(games ? [{ label: 'Apri partite.md', icon: 'note' as const, onClick: () => st.open(games.path) }] : [])]}>
      {!list.length ? (
        <Empty icon="dice" action={<Button icon="plus" onClick={onAdd}>Registra la prima partita</Button>}>
          <b className="text-tx text-[15px]">Nessuna partita registrata</b>
          Dopo ogni partita segna scenario, avversario e risultato: l’agente le usa per consigliarti lista e regole da ripassare.
        </Empty>
      ) : (
        <>
          <div ref={gl} className="flex flex-col">{list.slice(0, 6).map((g) => (
            <div key={g.line} className="flex items-center gap-3 min-h-[48px] border-b border-ln last:border-b-0">
              <span className="flex-1 min-w-0"><span className="block truncate">{g.scen}</span><span className="block text-[12px] text-mu truncate">{g.date.split('-').reverse().join('/')} · contro {g.vs}{g.note ? ' · ' + g.note : ''}</span></span>
              <span className={clsx('text-[12px] font-semibold', g.res === 'vinta' ? 'text-ok' : g.res === 'persa' ? 'text-ac' : 'text-mu')}>{g.res}</span>
            </div>
          ))}</div>
          <div className="flex gap-2">
            <Button icon="plus" onClick={onAdd}>Registra</Button>
            {last && <AskBtn variant="ghost" text={`Ho giocato «${last.scen}» contro ${last.vs} (${last.res})${last.note ? `, note: ${last.note}` : ''}. Cosa ho sbagliato o cosa posso migliorare, e quali regole conviene ripassare? Guarda anche le altre partite in partite.md.`}>Analizza l’ultima</AskBtn>}
          </div>
        </>
      )}
    </Card>
  )
}

// ───────────── pagina ─────────────
export default function Miniature({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)
  const st = useStore.getState()
  const [tab, setTab] = useState<'pittura' | 'collezione' | 'partite' | 'regole'>('pittura')
  const [gameOpen, setGameOpen] = useState(false)
  const sub = useStore((s) => s.sub)
  const get = (p: string) => notes.find((n) => n.path === p)
  const kit = (f: string) => get(KIT_DIR + '/' + f)
  const inv = get(INV), lav = get(LAV), ric = kit('ricettario-pittura.md'), games = get(GAMES)
  const desktop = vault?.kind === 'desktop'
  const lotList = useMemo(() => (lav ? lots(lav.body) : []), [lav])
  const guides = useMemo(() => parseGuides(ric?.body || ''), [ric?.body])
  const supplies = lav ? mdTable(mdSection(mdSection(lav.body, '5. Attrezzatura e colori'), 'Cosa ho', 3)).slice(1).map((r) => strip(r[0])).filter(Boolean) : []
  const caps = notes.filter((n) => n.path.startsWith(KIT_DIR + '/Manuale ITA/Traduzione/')).sort((a, b) => a.name.localeCompare(b.name))
  const vad = get(MIN_DIR + '/Vademecum prime partite.md')
  const refs = kit('riferimenti.md')

  const recipes = (
    <Card title="Ricettario di pittura" plain={phone} right={ric ? <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => st.open(ric.path)}>Tutto</button> : undefined} flush>
      {guides.map((g) => {
        const used = lotList.find((l) => l.schema && findGuide(guides, l.schema) === g)
        const imgs = g.refs.finished.length + g.refs.steps.length
        return (
          <button key={g.head} type="button" onClick={() => st.goSub(guideSub(g.head, used?.lotto))} className="flex items-center gap-3 min-h-[60px] px-1.5 py-1.5 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
            <GuideThumb g={g} className="w-11 h-11 rounded-md flex-none" />
            <span className="flex-1 min-w-0"><span className="block truncate">{g.title}</span><span className="block text-[12px] text-mu truncate">{g.steps.length} passaggi · {imgs ? imgs + ' immagini' : 'senza immagini'}</span></span>
            {used && <Badge tone="accent">in uso</Badge>}
          </button>
        )
      })}
      {!guides.length && <Empty>Ricettario non trovato.</Empty>}
    </Card>
  )
  const colors = (
    <Card title="Colori e materiali" plain={phone} right={lav ? <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => st.open(lav.path, 'Cosa ho')}>In lavorazione.md</button> : undefined}>
      <div className="flex flex-wrap gap-2">{supplies.map((s) => <span key={s} className="h-8 px-3 rounded-md bg-s2 text-[13px] inline-flex items-center">{s}</span>)}</div>
      {!supplies.length && <Empty>—</Empty>}
    </Card>
  )
  const rules = (
    <Card title="Regole e riferimenti" plain={phone} flush>
      <div className="px-1.5 pt-1 pb-2"><AskBtn text="Ho un dubbio sulle regole: " variant="secondary">Fai una domanda sulle regole</AskBtn></div>
      {vad && <RuleRow title="Vademecum per le prime partite" onClick={() => st.open(vad.path)} />}
      {caps.length > 0 && <RuleRow title="Regolamento (traduzione italiana)" onClick={() => st.open(caps[0].path)} />}
      {refs && <RuleRow title="Profili, scenari e riferimenti" onClick={() => st.open(refs.path)} />}
      {phone && caps.slice(1).map((n) => { const m = n.name.match(/^(\d+)-/); const k = m ? +m[1] : 0; return <RuleRow key={n.path} title={`${k}. ${RM_CAP[k] || n.title}`} onClick={() => st.open(n.path)} /> })}
      {!phone && (
        <div className="flex flex-wrap gap-1.5 px-1.5 py-3">
          {LIBRARY.map(([l, rel, k]) => <Chip key={l} icon={k === 'pdf' ? 'book' : 'folder'} onClick={() => kitOpen(rel, desktop)}>{l}</Chip>)}
        </div>
      )}
    </Card>
  )

  if (sub?.startsWith(GUIDE_SUB)) return <PaintGuide sub={sub} phone={phone} />

  if (!inv || !lav)
    return (
      <div className="flex flex-col gap-4">
        {!phone && <PageHead dot={section('miniature').dot} title="Miniature" />}
        <Card title="Kit MESBG"><p className="m-0 text-mu">Non trovo inventario.md e lavorazione.md in «{KIT_DIR}». La cartella si riempie quando l’app sul PC sincronizza Documenti\Kit MESBG.</p></Card>
      </div>
    )

  const lotCards = lotList.length ? lotList.map((l) => <LotCard key={l.lotto} lot={l} lav={lav} guides={guides} phone={phone} />)
    : <Card title="In lavorazione" plain={phone}><Empty icon="brush" action={<AskBtn text="Aggiungi alla tabella Avanzamento dei lotti di lavorazione.md i lotti che sto lavorando, in base all'inventario.">Chiedi all’agente di preparare i lotti</AskBtn>}>Nessun lotto nella tabella «Avanzamento dei lotti» di lavorazione.md.</Empty></Card>

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        <div className="chips" role="group" aria-label="Sezione">
          <Chip on={tab === 'pittura'} onClick={() => setTab('pittura')}>Pittura</Chip>
          <Chip on={tab === 'collezione'} onClick={() => setTab('collezione')}>Collezione</Chip>
          <Chip on={tab === 'partite'} onClick={() => setTab('partite')}>Partite</Chip>
          <Chip on={tab === 'regole'} onClick={() => setTab('regole')}>Regole e ricette</Chip>
        </div>
        {tab === 'pittura' && <><Focus lav={lav} phone />{lotCards}</>}
        {tab === 'collezione' && <><Collection inv={inv} phone /><Wishlist inv={inv} phone /><Questions inv={inv} phone />{colors}</>}
        {tab === 'partite' && <Games games={games} phone onAdd={() => setGameOpen(true)} />}
        {tab === 'regole' && <>{rules}{recipes}</>}
        <GameForm open={gameOpen} onClose={() => setGameOpen(false)} />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <PageHead dot={section('miniature').dot} title="Miniature" sub="Il Signore degli Anelli SBG · stessi file dell’agente del progetto (Kit MESBG)">
        <Button icon="dice" onClick={() => setGameOpen(true)}>Registra partita</Button>
        <Button variant="primary" icon="claude" onClick={() => st.askClaude('', 'mesbg')}>Chiedi all’agente</Button>
      </PageHead>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        <div className="flex flex-col gap-4 min-w-0"><Focus lav={lav} />{lotCards}</div>
        <div className="flex flex-col gap-4 min-w-0"><Collection inv={inv} /><Wishlist inv={inv} /><Questions inv={inv} /></div>
      </div>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Games games={games} onAdd={() => setGameOpen(true)} />
        {recipes}
        {colors}
        {rules}
      </div>
      <GameForm open={gameOpen} onClose={() => setGameOpen(false)} />
    </div>
  )
}

const RuleRow = ({ title, onClick }: { title: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-3 min-h-[56px] px-1.5 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
    <Icon name="note" size={15} className="text-mu flex-none" /><span className="flex-1 min-w-0">{title}</span>
  </button>
)
