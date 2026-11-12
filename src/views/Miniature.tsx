import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { useStore, daily } from '../store'
import { section } from '../sections'
import { PageHead, Card, Badge, Empty, Button, Chip, Seg, MoreMenu, inputCls } from '../ui/kit'
import { Modal, Sheet } from '../ui/Sheet'
import { Icon } from '../ui/Icon'
import { mdSection, mdTable, setFM, fmStr, type Note } from '../lib/md'
import { todayKey, isDone } from '../lib/checklist'

/**
 * Miniature (MESBG). Legge i file del Kit sincronizzati in "55 Miniature/Kit MESBG" e tre note proprie
 * della sezione, create al primo uso: "Tavolo da pittura" (avanzamento), "Lista desideri", "Partite".
 */
const MIN_DIR = '55 Miniature'
const KIT_DIR = '55 Miniature/Kit MESBG'
const KIT_PAIR = 'Kit MESBG'
const TABLE = MIN_DIR + '/Tavolo da pittura.md'
const WISH = MIN_DIR + '/Lista desideri.md'
const GAMES = MIN_DIR + '/Partite.md'
const STAGES = [
  { k: 'da_montare', l: 'Da montare', c: 'var(--s3)' },
  { k: 'montate', l: 'Montate', c: 'color-mix(in srgb, var(--ac) 30%, var(--bg))' },
  { k: 'primer', l: 'Primer', c: 'color-mix(in srgb, var(--ac) 52%, var(--bg))' },
  { k: 'in_pittura', l: 'In pittura', c: 'color-mix(in srgb, var(--ac) 75%, var(--bg))' },
  { k: 'finite', l: 'Finite', c: 'var(--ac)' },
] as const
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

/** Passaggi di uno schema del ricettario: "Sequenza al banco" numerata se c'è, altrimenti le voci dell'elenco. */
export function recipeSteps(ricettario: string, head: string): string[] {
  const sec = mdSection(ricettario, head)
  if (!sec) return []
  const seq = sec.match(/###\s+Sequenza[^\n]*\n([\s\S]*)/)
  const src = seq ? seq[1] : sec
  const num = [...src.matchAll(/^\d+\.\s+(.+)$/gm)].map((m) => m[1])
  const items = num.length ? num : [...src.matchAll(/^[-*]\s+(.+)$/gm)].map((m) => m[1])
  return items.map((s) => { const b = s.match(/^\*\*([^*]+?):?\*\*/); return strip(b ? b[1] : s.split(/[:—]/)[0]).replace(/:$/, '').slice(0, 70) })
}

async function patch(path: string, fields: Record<string, string | number | boolean | null>, label?: string, fallback?: string) {
  const st = useStore.getState()
  let t = (await st.vault!.read(path)) ?? fallback ?? ''
  for (const [k, v] of Object.entries(fields)) t = setFM(t, k, v)
  await st.write(path, t, { undoLabel: label })
}

// ───────────── tavolo da pittura ─────────────
function Table({ table, ric, groups, phone }: { table: Note | undefined; ric: Note | undefined; groups: { nome: string; qta: number }[]; phone?: boolean }) {
  const st = useStore.getState()
  const heads = ric ? [...ric.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()).filter((h) => !/tavolozza|tabella|scenografia|basette/i.test(h)) : []
  const g0 = groups[0]
  if (!table)
    return (
      <Card title="Al tavolo da pittura" plain={phone}>
        <Empty icon="brush" action={g0 && (
          <Button variant="primary" onClick={() => st.write(TABLE, `---\ngruppo: ${JSON.stringify(g0.nome)}\npezzi: ${g0.qta}\nricetta: ${JSON.stringify(heads.find((h) => h.toLowerCase().includes(g0.nome.toLowerCase().split(' ')[0])) || heads[0] || '')}\nda_montare: ${g0.qta}\nmontate: 0\nprimer: 0\nin_pittura: 0\nfinite: 0\npasso: 1\n---\n\n# Tavolo da pittura\n\nAvanzamento del lotto sul tavolo: lo aggiorna The Office (sezione Miniature).\n`, { undoLabel: 'Lotto messo sul tavolo' })}>Metti sul tavolo: {g0.nome}</Button>
        )}>Nessun lotto sul tavolo. Scegli cosa dipingere: The Office terrà il conto di montaggio, primer e passaggi della ricetta.</Empty>
      </Card>
    )
  const fm = table.fm
  const total = n0(fm.pezzi) || STAGES.reduce((a, s) => a + n0(fm[s.k]), 0)
  const counts = STAGES.map((s) => n0(fm[s.k]))
  const steps = ric && fm.ricetta ? recipeSteps(ric.body, fmStr(fm.ricetta)) : []
  const step = Math.max(1, n0(fm.passo))
  const done = counts[4], painting = counts[3]
  const move = (i: number, d: 1 | -1) => {
    const from = d === 1 ? i : i, to = i + d
    if (to < 0 || to >= STAGES.length || counts[from] <= 0) return
    patch(TABLE, { [STAGES[from].k]: counts[from] - 1, [STAGES[to].k]: counts[to] + 1 }, `1 pezzo: ${STAGES[from].l} → ${STAGES[to].l}`)
  }
  const recipeName = fmStr(fm.ricetta).split(/\s+—\s+/)
  return (
    <Card title="Al tavolo da pittura" plain={phone} right={ric && fm.ricetta && !phone ? <Button size="sm" onClick={() => st.open(ric.path, fmStr(fm.ricetta))}>Apri ricetta</Button> : undefined}
      menu={[
        ...groups.map((g) => ({ label: 'Metti sul tavolo: ' + g.nome, icon: 'brush' as const, onClick: () => patch(TABLE, { gruppo: g.nome, pezzi: g.qta, da_montare: g.qta, montate: 0, primer: 0, in_pittura: 0, finite: 0, passo: 1 }, 'Nuovo lotto sul tavolo') })),
        { sep: true, label: '', onClick: () => {} },
        ...heads.map((h) => ({ label: 'Ricetta: ' + h.split(/\s+—\s+/)[0], checked: h === fmStr(fm.ricetta), onClick: () => patch(TABLE, { ricetta: h, passo: 1 }, 'Ricetta cambiata') })),
        { sep: true, label: '', onClick: () => {} },
        { label: 'Apri la nota del tavolo', icon: 'note', onClick: () => st.open(TABLE) },
      ]}>
      <div>
        <div className="text-[20px] font-semibold">{fmStr(fm.gruppo)} × {total}</div>
        <div className="text-[13px] text-mu">Ricetta: {recipeName[1] || recipeName[0] || '—'}{steps.length ? ` · passaggio ${Math.min(step, steps.length)} di ${steps.length}` : ''} · {done} finit{done === 1 ? 'o' : 'i'}, {painting} in pittura</div>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-[3px] bg-s2" aria-label="Avanzamento del lotto">
        {STAGES.map((s, i) => counts[i] > 0 && <span key={s.k} style={{ flex: counts[i], background: s.c }} title={`${s.l}: ${counts[i]}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {STAGES.map((s, i) => (
          <span key={s.k} className="group inline-flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-md text-[13px] text-mu hov">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.c, boxShadow: i === 0 ? 'inset 0 0 0 1px var(--ol)' : undefined }} />
            {s.l} · <span className="num text-tx">{counts[i]}</span>
            {i < STAGES.length - 1 && <button type="button" disabled={!counts[i]} onClick={() => move(i, 1)} aria-label={`Sposta un pezzo da ${s.l} a ${STAGES[i + 1].l}`} title={`Un pezzo → ${STAGES[i + 1].l}`} className="w-6 h-6 rounded flex items-center justify-center text-mu hover:text-tx hover:bg-s3 disabled:opacity-30 cursor-pointer disabled:cursor-default"><Icon name="right" size={13} stroke={2.4} /></button>}
          </span>
        ))}
      </div>
      {steps.length > 0 && (
        <ol className="m-0 p-0 list-none flex flex-col gap-1 mt-1">
          {steps.map((s, i) => {
            const n = i + 1, past = n < step, cur = n === step
            return (
              <li key={i}>
                <button type="button" onClick={() => patch(TABLE, { passo: cur ? n + 1 : n }, cur ? 'Passaggio fatto' : 'Passaggio corrente')} className="w-full flex items-center gap-3 min-h-[40px] text-left cursor-pointer rounded-md hov px-1">
                  {past ? <span className="w-[22px] h-[22px] rounded-full bg-ac text-[#1A0A02] flex items-center justify-center flex-none"><Icon name="check" size={13} stroke={3} /></span>
                    : <span className={clsx('w-[22px] h-[22px] rounded-full flex items-center justify-center flex-none num text-[11px]', cur ? 'border-[1.5px] border-ac text-ac font-semibold' : 'border border-ol text-mu')}>{n}</span>}
                  <span className={clsx('flex-1', past && 'line-through text-mu', cur && 'font-semibold')}>{s}</span>
                  {cur && <span className="text-[11px] font-semibold px-1.5 h-5 rounded bg-s3 inline-flex items-center">ora</span>}
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {!steps.length && <p className="m-0 text-[13px] text-mu">Scegli una ricetta dal menu ⋯ per avere i passaggi.</p>}
    </Card>
  )
}

// ───────────── lista desideri e partite ─────────────
const listItems = (n?: Note) => (n ? [...n.body.matchAll(/^[-*]\s+(?!\[x\])(?:\[ \]\s+)?(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean) : [])

function Wishlist({ wish, phone }: { wish?: Note; phone?: boolean }) {
  const st = useStore.getState()
  const check = useStore((s) => s.check)
  const log = useStore((s) => s.log)
  const [text, setText] = useState('')
  const vinted = daily(check).find((h) => /vinted/i.test(h.title))
  const vintedTodo = vinted && !isDone(log, todayKey(), vinted.title)
  const items = listItems(wish)
  const rule = wish?.body.match(/^>\s*(.+)$/m)?.[1]
  const add = async () => {
    const t = text.trim()
    if (!t) return
    const cur = (await st.vault!.read(WISH)) ?? `---\ntags: [miniature, desideri]\n---\n\n# Lista desideri\n\n> **La tua regola:** compra solo quello che ti piace davvero, senza esagerare con quantità e spesa.\n\n`
    await st.write(WISH, cur.replace(/\s*$/, '\n') + `- ${t}\n`, { undoLabel: 'Aggiunto ai desideri' })
    setText('')
  }
  return (
    <Card title="Lista desideri" plain={phone} right={vinted ? <span className={clsx('text-[12px] font-semibold px-2 h-6 rounded-md inline-flex items-center', vintedTodo ? 'bg-s3 text-tx' : 'text-mu')}>{vintedTodo ? 'Vinted: oggi da controllare' : 'Vinted controllato'}</span> : undefined}
      menu={wish ? [{ label: 'Apri la nota', icon: 'note', onClick: () => st.open(WISH) }] : undefined}>
      <div className="px-3.5 py-3 rounded-lg bg-s2 text-[14px] leading-snug" dangerouslySetInnerHTML={{ __html: rule ? rule.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') : '<b>La tua regola:</b> compra solo quello che ti piace davvero, senza esagerare con quantità e spesa.' }} />
      {items.map((it, i) => {
        const [a, b] = it.split(/\s+—\s+/)
        return <div key={i} className="flex items-center gap-3 min-h-[52px] border-b border-ln last:border-b-0"><span className="flex-1">{strip(a)}</span>{b && <span className="text-[12px] text-mu">{strip(b)}</span>}</div>
      })}
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex items-center gap-2">
        <Icon name="plus" size={15} className="text-mu" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Aggiungi (es. Guerrieri nani — da cercare su Vinted)" aria-label="Aggiungi ai desideri" className="flex-1 min-w-0 h-9 bg-transparent outline-none text-[14px] placeholder:text-mu" />
      </form>
    </Card>
  )
}

interface Game { date: string; scen: string; vs: string; res: string; note: string }
const parseGames = (n?: Note): Game[] => (n ? [...n.body.matchAll(/^-\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.*)$/gm)].map((m) => { const p = m[2].split(' · '); return { date: m[1], scen: p[0] || '', vs: (p[1] || '').replace(/^contro\s+/, ''), res: p[2] || '', note: p.slice(3).join(' · ') } }) : [])

function GameForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useStore.getState()
  const [g, setG] = useState<Game>({ date: todayKey(), scen: '', vs: '', res: 'vinta', note: '' })
  const save = async () => {
    const cur = (await st.vault!.read(GAMES)) ?? `---\ntags: [miniature, partite]\n---\n\n# Partite\n\nUna riga per partita: data · scenario · contro chi · risultato · note.\n\n`
    const line = `- ${g.date} · ${g.scen || 'Partita'} · contro ${g.vs || '?'} · ${g.res}${g.note ? ' · ' + g.note : ''}`
    await st.write(GAMES, cur.replace(/\s*$/, '\n') + line + '\n', { undoLabel: 'Partita registrata' })
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
        <input className={inputCls} value={g.note} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="Note (liste, cosa ha funzionato…)" aria-label="Note" />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Annulla</Button><Button variant="primary" type="submit">Registra</Button></div>
      </form>
    </Modal>
  )
}

function Games({ games, onAdd, phone }: { games?: Note; onAdd: () => void; phone?: boolean }) {
  const st = useStore.getState()
  const list = parseGames(games).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Card title="Partite" plain={phone} right={list.length ? <Badge>{list.length}</Badge> : undefined} menu={games ? [{ label: 'Registra partita', icon: 'plus', onClick: onAdd }, { label: 'Apri la nota', icon: 'note', onClick: () => st.open(GAMES) }] : undefined}>
      {!list.length ? (
        <Empty icon="dice" action={<Button icon="plus" onClick={onAdd}>Registra la prima partita</Button>}>
          <b className="text-tx text-[15px]">Nessuna partita registrata</b>
          Dopo la prima partita segna scenario, liste e risultato: qui vedrai lo storico.
        </Empty>
      ) : (
        list.slice(0, 6).map((g, i) => (
          <div key={i} className="flex items-center gap-3 min-h-[48px] border-b border-ln last:border-b-0">
            <span className="flex-1 min-w-0"><span className="block truncate">{g.scen}</span><span className="block text-[12px] text-mu truncate">{g.date.split('-').reverse().join('/')} · contro {g.vs}</span></span>
            <span className={clsx('text-[12px] font-semibold', g.res === 'vinta' ? 'text-ok' : g.res === 'persa' ? 'text-ac' : 'text-mu')}>{g.res}</span>
          </div>
        ))
      )}
    </Card>
  )
}

// ───────────── pagina ─────────────
export default function Miniature({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)
  const st = useStore.getState()
  const [tab, setTab] = useState<'pittura' | 'collezione' | 'ricette' | 'regole'>('pittura')
  const [gameOpen, setGameOpen] = useState(false)
  const [sheet, setSheet] = useState<'wish' | 'games' | null>(null)
  const get = (p: string) => notes.find((n) => n.path === p)
  const kit = (f: string) => get(KIT_DIR + '/' + f)
  const inv = kit('inventario.md'), lav = kit('lavorazione.md'), ric = kit('ricettario-pittura.md')
  const table = get(TABLE), wish = get(WISH), games = get(GAMES)
  const desktop = vault?.kind === 'desktop'

  const coll = useMemo(() => {
    if (!inv) return []
    const out: { side: string; cod: string; nome: string; qta: number; mat: string; fonte: string }[] = []
    for (const side of ['Male', 'Bene'])
      mdTable(mdSection(mdSection(inv.body, '1. Sculture'), side, 3)).slice(1).filter((r) => r[0] && r[1])
        .forEach((r) => out.push({ side, cod: strip(r[0]), nome: strip(r[1]), qta: parseInt(strip(r[2] || ''), 10) || 0, mat: strip(r[3] || ''), fonte: '' }))
    return out
  }, [inv])
  const groups = coll.map((c) => ({ nome: c.nome.replace(/\s*\(.*\)$/, ''), qta: c.qta }))
  const pieces = coll.reduce((a, c) => a + c.qta, 0)
  const heads = ric ? [...ric.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()).filter((h) => !/^tabella/i.test(h)) : []
  const supplies = lav ? mdTable(mdSection(mdSection(lav.body, '5. Attrezzatura e colori'), 'Cosa ho', 3)).slice(1).map((r) => strip(r[0])).filter(Boolean) : []
  const caps = notes.filter((n) => n.path.startsWith(KIT_DIR + '/Manuale ITA/Traduzione/')).sort((a, b) => a.name.localeCompare(b.name))
  const vad = get(MIN_DIR + '/Vademecum prime partite.md')
  const refs = kit('riferimenti.md')

  const collection = (
    <Card title="Collezione" plain={phone} right={<span className="text-[13px] text-mu pr-1">{pieces} miniature</span>} menu={inv ? [{ label: 'Apri l’inventario', icon: 'note', onClick: () => st.open(inv.path) }] : undefined}>
      {!coll.length && <Empty>Nessuna scultura nell’inventario del kit.</Empty>}
      {coll.map((c) => {
        const onTable = table && fmStr(table.fm.gruppo).toLowerCase() === c.nome.replace(/\s*\(.*\)$/, '').toLowerCase()
        const counts = onTable ? STAGES.map((s) => n0(table!.fm[s.k])) : null
        return (
          <div key={c.cod + c.nome} className="flex items-center gap-3.5 px-3.5 py-3 rounded-lg bg-s2">
            <Icon name="mini" size={17} className="text-mu flex-none" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2"><span className="font-semibold flex-1 truncate">{c.nome}</span><span className="text-[12px] text-mu whitespace-nowrap">{[c.qta, c.mat, c.fonte].filter(Boolean).join(' · ')}</span></div>
              {counts ? (
                <div className="flex h-2 rounded-full overflow-hidden gap-[3px]">{STAGES.map((s, i) => counts[i] > 0 && <span key={s.k} style={{ flex: counts[i], background: s.c }} />)}</div>
              ) : <span className="text-[12px] text-mu">{c.side === 'Male' ? 'Esercito del Male' : 'Esercito del Bene'}</span>}
            </div>
          </div>
        )
      })}
      {coll.length === 1 && <p className="m-0 text-[13px] text-mu">Per ora un solo gruppo. Quando aggiungi miniature all’inventario compaiono qui.</p>}
    </Card>
  )

  const recipes = (
    <Card title="Ricette di pittura" plain={phone} right={ric ? <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => st.open(ric.path)}>Tutte</button> : undefined} flush>
      {heads.filter((h) => !/tavolozza/i.test(h)).map((h) => {
        const k = recipeSteps(ric!.body, h).length
        return (
          <button key={h} type="button" onClick={() => st.open(ric!.path, h)} className="flex items-center gap-3 min-h-[56px] px-1.5 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
            <span className="flex-1 min-w-0 truncate">{h.split(/\s+—\s+/)[0]}</span>
            {k > 0 && <span className="text-[12px] text-mu whitespace-nowrap">{k} passaggi</span>}
          </button>
        )
      })}
      {!heads.length && <Empty>Ricettario non trovato.</Empty>}
    </Card>
  )

  const colors = (
    <Card title="Colori e materiali" plain={phone} right={lav ? <button type="button" className="text-[12px] text-mu px-2 h-7 rounded-md hov cursor-pointer" onClick={() => st.open(lav.path, 'Cosa ho')}>Inventario</button> : undefined}>
      <div className="flex flex-wrap gap-2">{supplies.map((s) => <span key={s} className="h-8 px-3 rounded-md bg-s2 text-[13px] inline-flex items-center">{s}</span>)}</div>
      {!supplies.length && <Empty>—</Empty>}
    </Card>
  )

  const rules = (
    <Card title="Regole e riferimenti" plain={phone} flush>
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

  if (!inv && !lav && !table)
    return (
      <div className="flex flex-col gap-4">
        {!phone && <PageHead dot={section('miniature').dot} title="Miniature" />}
        <Card title="Kit MESBG"><p className="m-0 text-mu">Non trovo i file del kit in «{KIT_DIR}». La cartella si riempie quando l’app sul PC sincronizza Documenti\Kit MESBG.</p></Card>
      </div>
    )

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        <div className="chips" role="group" aria-label="Sezione">
          <Chip on={tab === 'pittura'} onClick={() => setTab('pittura')}>Pittura</Chip>
          <Chip on={tab === 'collezione'} onClick={() => setTab('collezione')}>Collezione</Chip>
          <Chip on={tab === 'ricette'} onClick={() => setTab('ricette')}>Ricette di pittura</Chip>
          <Chip on={tab === 'regole'} onClick={() => setTab('regole')}>Regole</Chip>
        </div>
        {tab === 'pittura' && (
          <>
            <Table table={table} ric={ric} groups={groups} phone />
            <RowLink icon="heart" title="Lista desideri" sub={`${listItems(wish).length} voci`} onClick={() => setSheet('wish')} />
            <RowLink icon="dice" title="Partite" sub={parseGames(games).length ? `${parseGames(games).length} registrate` : 'Nessuna ancora · registra la prima'} onClick={() => setSheet('games')} />
          </>
        )}
        {tab === 'collezione' && <>{collection}{colors}</>}
        {tab === 'ricette' && recipes}
        {tab === 'regole' && rules}
        <Sheet open={sheet === 'wish'} onOpenChange={(o) => !o && setSheet(null)} title="Lista desideri" hideTitle><Wishlist wish={wish} phone /></Sheet>
        <Sheet open={sheet === 'games'} onOpenChange={(o) => !o && setSheet(null)} title="Partite" hideTitle><Games games={games} phone onAdd={() => { setSheet(null); setGameOpen(true) }} /></Sheet>
        <GameForm open={gameOpen} onClose={() => setGameOpen(false)} />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <PageHead dot={section('miniature').dot} title="Miniature" sub="Il Signore degli Anelli SBG · dati da Documenti\Kit MESBG">
        <Button icon="dice" onClick={() => setGameOpen(true)}>Registra partita</Button>
        <MoreMenu label="Aggiungi miniature" items={[
          { label: 'Aggiorna l’inventario (chiedi a Claude)', icon: 'claude', onClick: () => st.set('claudeOpen', true) },
          ...(inv ? [{ label: 'Apri l’inventario', icon: 'note' as const, onClick: () => st.open(inv.path) }] : []),
        ]} trigger={<button type="button" className="press h-[34px] px-3 rounded-lg bg-tx text-bg border border-tx inline-flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer"><Icon name="plus" size={15} stroke={2} />Aggiungi miniature</button>} />
      </PageHead>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        <Table table={table} ric={ric} groups={groups} />
        <div className="flex flex-col gap-4 min-w-0">{collection}<Wishlist wish={wish} /></div>
      </div>
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {recipes}
        {colors}
        <Games games={games} onAdd={() => setGameOpen(true)} />
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
const RowLink = ({ icon, title, sub, onClick }: { icon: 'heart' | 'dice'; title: string; sub: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="press flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-s1 border border-ln text-left cursor-pointer">
    <Icon name={icon} size={17} className="text-mu" />
    <span className="flex-1 min-w-0"><span className="block font-semibold">{title}</span><span className="block text-[12px] text-mu truncate">{sub}</span></span>
    <Icon name="chev" size={15} className="text-mu" />
  </button>
)
