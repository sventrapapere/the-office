import { useMemo } from 'react'
import { toast } from 'sonner'
import { useStore } from '../store'
import { section } from '../sections'
import { PageHead, Card, Badge, Empty, Button } from '../ui/kit'
import { Tag } from '../ui/notes'
import { MdBlock } from '../ui/MdBlock'
import { mdSection, mdTable, mdInline, type Note } from '../lib/md'

/**
 * Sezione Miniature (MESBG): legge i file del Kit sincronizzati in "55 Miniature/Kit MESBG".
 * I PDF e i file 3D restano nel kit sul PC e si aprono dall'app desktop.
 */
const MIN_DIR = '55 Miniature'
const KIT_DIR = '55 Miniature/Kit MESBG'
const KIT_PAIR = 'Kit MESBG'
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
  ['Manuali in inglese', 'LOTR Manuals', 'dir'],
  ['Terreno 3D', 'Terreno 3D', 'dir'],
  ['Cartella del kit', '', 'dir'],
]

const strip = (s: string) => s.replace(/\*\*/g, '').replace(/\*/g, '')

function kitOpen(rel: string, desktop: boolean) {
  if (!desktop) { toast('I file del kit si aprono dall’app sul PC.'); return }
  fetch('/_api/open-source?pair=' + encodeURIComponent(KIT_PAIR) + '&rel=' + encodeURIComponent(rel)).then((r) => {
    if (r.status === 404) toast('File non trovato nel kit: ' + rel)
  }).catch(() => toast('L’app non riesce ad aprire il file.'))
}

export default function Miniature({ phone }: { phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)
  const st = useStore.getState()
  const kit = (f: string) => notes.find((n) => n.path === KIT_DIR + '/' + f)
  const inv = kit('inventario.md'), lav = kit('lavorazione.md'), ric = kit('ricettario-pittura.md')
  const ctx = { notes, from: inv?.path || KIT_DIR }

  const coll = useMemo(() => {
    if (!inv) return null
    const t = inv.body
    const quadro = mdTable(mdSection(t, 'Quadro in poche righe')).filter((r) => r[0])
    const scult: { side: string; cod: string; nome: string; qta: string; mat: string; base: string; prof: string }[] = []
    for (const side of ['Male', 'Bene'])
      mdTable(mdSection(mdSection(t, '1. Sculture'), side, 3)).slice(1).filter((r) => r[0] && r[1])
        .forEach((r) => scult.push({ side, cod: r[0], nome: r[1], qta: r[2] || '', mat: r[3] || '', base: r[4] || '', prof: r[5] || '' }))
    const pezzi = scult.reduce((a, s) => a + (parseInt(s.qta, 10) || 0), 0) || parseInt((t.match(/(\d+)\s+pezzi/) || [])[1] || '0', 10)
    const upd = (t.match(/\*Aggiornato:\s*([^*·]+)/) || [])[1]?.trim()
    return { quadro, scult, pezzi, upd }
  }, [inv])

  const caps = notes.filter((n) => n.path.startsWith(KIT_DIR + '/Manuale ITA/Traduzione/')).sort((a, b) => a.name.localeCompare(b.name))
  const vad = notes.find((n) => n.path === MIN_DIR + '/Vademecum prime partite.md')
  const moc = notes.find((n) => n.path === MIN_DIR + '/Miniature - MOC.md')
  const heads = ric ? [...ric.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()).filter((h) => !/^tabella delle miscele/i.test(h)) : []
  const desc: Record<number, string> = {}
  const index = caps.find((n) => /^00-/.test(n.name))
  if (index) mdTable(index.body).forEach((r) => { const k = parseInt(String(r[0]).replace(/\*/g, ''), 10); if (k && r[3]) desc[k] = strip(r[3]).replace(/\s+/g, ' ') })

  if (!inv && !lav)
    return (
      <div className="flex flex-col gap-4">
        {!phone && <PageHead dot={section('miniature').dot} title="Miniature" />}
        <Card title="Kit MESBG"><p className="m-0 text-mu">Non trovo i file del kit in «{KIT_DIR}». La cartella si riempie quando l’app sul PC sincronizza Documenti\Kit MESBG.</p></Card>
      </div>
    )

  const punto = lav ? mdSection(lav.body, 'Il punto in una riga') : ''
  const passi = lav ? mdSection(lav.body, '6. Prossimi passi') : ''
  const chiarire = inv ? mdSection(inv.body, '6. Da chiarire') : ''
  const desktop = vault?.kind === 'desktop'

  return (
    <div className="flex flex-col gap-4">
      {!phone && (
        <PageHead dot={section('miniature').dot} title="Miniature" sub={'Il Signore degli Anelli SBG' + (coll?.upd ? ' · inventario aggiornato il ' + coll.upd : '')}>
          {moc && <Button variant="ghost" icon="note" onClick={() => st.open(moc.path)}>Indice della sezione</Button>}
        </PageHead>
      )}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: phone ? '1fr' : 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <Card title="Al banco" right={lav && <Button size="sm" variant="ghost" onClick={() => st.open(lav.path)}>Lavorazione</Button>}>
          {punto && <div className="text-[15px] leading-relaxed"><MdBlock text={punto} from={lav!.path} /></div>}
          {passi && (<><h3 className="m-0 mt-1 text-[12px] font-semibold text-mu uppercase tracking-[0.04em]">Prossimi passi</h3><MdBlock text={passi} from={lav!.path} className="text-[14px]" /></>)}
          {chiarire && (<><h3 className="m-0 mt-1 text-[12px] font-semibold text-mu uppercase tracking-[0.04em]">Da chiarire</h3><MdBlock text={chiarire} from={inv!.path} className="text-[14px] [&_input]:pointer-events-none" /></>)}
        </Card>
        {coll && (
          <Card title="Collezione" right={<><Badge>{coll.pezzi} pezzi</Badge><Button size="sm" variant="ghost" onClick={() => st.open(inv!.path)}>Inventario</Button></>}>
            <dl className={'m-0 grid gap-x-4 text-[13px] ' + (phone ? 'grid-cols-1 gap-y-0.5 [&_dd]:mb-2' : 'grid-cols-[minmax(100px,auto)_1fr] gap-y-2')}>
              {coll.quadro.map((r) => (
                <div key={r[0]} className="contents">
                  <dt className="text-mu">{strip(r[0])}</dt>
                  <dd className="m-0 [&_a]:text-ac" dangerouslySetInnerHTML={{ __html: mdInline(r[1] || '', ctx) }} />
                </div>
              ))}
            </dl>
            {coll.scult.length > 0 && (
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {coll.scult.map((s) => (
                  <div key={s.cod + s.nome} className="p-3 rounded-lg border border-ln bg-s2 flex flex-col gap-1">
                    <span className="font-semibold"><span className="num text-mu mr-1.5">{s.cod}</span>{s.nome}</span>
                    <span className="text-[12px] text-mu">{strip(s.qta)}</span>
                    <span className="flex flex-wrap gap-1">{[s.side, s.mat, s.base].filter(Boolean).map((x) => <Tag key={x}>{strip(x)}</Tag>)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {ric && heads.length > 0 && (
        <Card title="Ricettario di pittura" right={<Badge>{heads.length} schemi</Badge>}>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {heads.map((h) => {
              const [t1, t2] = h.split(/\s+—\s+/)
              const first = (mdSection(ric.body, h).split('\n').find((l) => l.trim() && !/^[|#>-]/.test(l.trim())) || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '')
              return (
                <button key={h} type="button" onClick={() => st.open(ric.path, h)} className="press flex flex-col gap-1 p-3 rounded-lg border border-ln bg-s2 text-left cursor-pointer hov min-w-0">
                  <span className="font-semibold leading-snug">{t1}</span>
                  {t2 && <span className="text-[12px] text-mu">{t2}</span>}
                  {first && <span className="text-[12px] text-mu line-clamp-2 mt-0.5">{first}</span>}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {(caps.length > 0 || vad) && (
        <Card title="Regolamento" right={<span className="text-[12px] text-mu">Rules Manual 2024 · ITA</span>} flush>
          {vad && (
            <button type="button" onClick={() => st.open(vad.path)} className="flex items-center gap-3 min-h-[52px] px-1 border-b border-ln text-left cursor-pointer hov rounded-md">
              <span className="num w-7 text-center text-ac font-semibold">★</span>
              <span className="flex-1 min-w-0"><span className="block font-semibold">Vademecum per le prime partite</span><span className="block text-[12px] text-mu">Tabelle e regole base in una facciata · da tenere sul tavolo</span></span>
            </button>
          )}
          {caps.map((n: Note) => {
            const m = n.name.match(/^(\d+)-(.+?)(?:-pag(\d+)-(\d+))?-ITA$/)
            if (!m) return null
            const k = +m[1], idx = k === 0
            const title = idx ? 'Indice e glossario' : RM_CAP[k] || m[2].replace(/-/g, ' ')
            const d = idx ? 'Convenzioni della traduzione e glossario inglese → italiano' : desc[k] || ''
            return (
              <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-3 min-h-[48px] px-1 border-b border-ln last:border-b-0 text-left cursor-pointer hov rounded-md">
                <span className="num w-7 text-center text-mu">{idx ? '≡' : k}</span>
                <span className="flex-1 min-w-0"><span className="block truncate">{title}</span>{d && !phone && <span className="block truncate text-[12px] text-mu">{d}</span>}</span>
                {m[3] && <span className="num text-[12px] text-mu whitespace-nowrap">pp. {m[3]}–{m[4]}</span>}
              </button>
            )
          })}
        </Card>
      )}

      <Card title="Biblioteca del kit" right={!desktop && <span className="text-[12px] text-mu">si apre dal PC</span>}>
        <div className="flex flex-wrap gap-2">
          {LIBRARY.map(([l, rel, k]) => (
            <Button key={l} size="sm" icon={k === 'pdf' ? 'book' : 'folder'} disabled={!desktop} onClick={() => kitOpen(rel, desktop)}>{l}</Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {['riferimenti.md', 'stoccaggio.md', 'LEGGIMI.md'].map((f) => kit(f)).filter(Boolean).map((n) => (
            <button key={n!.path} type="button" className="text-ac cursor-pointer" onClick={() => st.open(n!.path)}>{n!.title}</button>
          ))}
        </div>
        {!notes.length && <Empty>—</Empty>}
      </Card>
    </div>
  )
}
