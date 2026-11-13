import { useState } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { zipSync, strToU8 } from 'fflate'
import { useStore, type SectionId } from '../store'
import { orderedSections } from '../sections'
import { PageHead, Card, Seg, Kbd, Pop, Button , inputCls } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { SyncStatus } from '../ui/Shell'
import { OnlineCard } from '../ui/Connect'

const CARDS: [string, string][] = [['cattura', 'Cattura veloce'], ['abitudini', 'Ogni giorno'], ['dafare', 'Da fare'], ['costanza', 'Costanza'], ['spesa', 'Lista della spesa'], ['recenti', 'Modificate di recente']]
const SHORTCUTS: [string, string][] = [['Cerca o esegui un comando', 'Ctrl K'], ['Cattura veloce', 'Ctrl N'], ['Chat con Claude', 'Ctrl J'], ['Vai a una sezione', 'Alt 1…7'], ['Modifica la nota', 'Ctrl E'], ['Salva la nota', 'Ctrl S'], ['Chiudi / indietro', 'Esc']]

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={clsx('relative w-[38px] h-[22px] rounded-full flex-none cursor-pointer transition-colors duration-150', on ? 'bg-tx' : 'bg-s3 border border-ol')}>
      <span className={clsx('absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-transform duration-150 ease-out', on ? 'bg-bg translate-x-[19px]' : 'bg-mu translate-x-[3px]')} />
    </button>
  )
}

function Row({ title, sub, children, icon, lead }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; icon?: Parameters<typeof Icon>[0]['name']; lead?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[72px] py-3 px-1 border-b border-ln last:border-b-0">
      {lead}
      {icon && <Icon name={icon} size={17} className="text-mu flex-none" />}
      <div className="flex-1 min-w-0"><div className="text-[15px]">{title}</div>{sub && <div className="text-[13px] text-mu">{sub}</div>}</div>
      {children}
    </div>
  )
}

/** Tutte le note in uno zip con le cartelle, pronto da aprire come vault in Obsidian. */
async function exportVault() {
  const st = useStore.getState()
  const files = await st.vault!.list()
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) if (!f.path.startsWith('_dashboard/')) tree[(st.vault!.name || 'vault') + '/' + f.path] = strToU8(f.text)
  const blob = new Blob([zipSync(tree, { level: 6 }) as BlobPart], { type: 'application/zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${st.vault!.name || 'vault'}-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  toast('Vault esportato', { description: `${files.length} note in uno zip. Le immagini restano nella cartella del vault sul PC.` })
}

/** Sezioni del menu: ordine (trascina o frecce), visibilità e schede fissate sul telefono. */
function SectionsCard({ phone }: { phone?: boolean }) {
  const settings = useStore((s) => s.settings)
  const save = useStore((s) => s.saveSettings)
  const [drag, setDrag] = useState<SectionId | null>(null)
  const list = orderedSections(settings, true)
  const ids = list.slice(1).map((s) => s.id)
  const move = (id: SectionId, to: number) => {
    const next = ids.filter((x) => x !== id)
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id)
    save({ order: next })
  }
  const togglePin = (id: SectionId) => {
    const p = settings.pinned.includes(id) ? settings.pinned.filter((x) => x !== id) : [...settings.pinned, id].slice(-3)
    save({ pinned: p })
  }
  return (
    <Card title={phone ? 'Barra in basso: Home + 3 a scelta' : 'Sezioni del menu'} right={!phone && <span className="text-[13px] text-mu pr-1">Trascina per riordinare</span>} flush>
      {list.map((s, i) => {
        const pinned = settings.pinned.includes(s.id)
        const hidden = settings.hidden.includes(s.id)
        const sub = [s.dir ? 'Cartella ' + s.dir.split('/')[0] : s.model, s.dir && s.model ? 'modello ' + s.model : '', pinned ? 'fissata sul telefono' : s.id === 'home' ? 'Pagina iniziale · fissata sul telefono' : ''].filter(Boolean).join(' · ')
        return (
          <div
            key={s.id}
            draggable={!phone && s.id !== 'home'}
            onDragStart={() => setDrag(s.id)}
            onDragOver={(e) => { if (drag && s.id !== 'home') e.preventDefault() }}
            onDrop={() => { if (drag) move(drag, ids.indexOf(s.id)); setDrag(null) }}
            onDragEnd={() => setDrag(null)}
            className={clsx('flex items-center gap-3 min-h-[72px] py-2.5 px-1 border-b border-ln last:border-b-0', drag === s.id && 'opacity-50')}
          >
            {!phone && <span className={clsx('w-5 flex justify-center text-mu', s.id !== 'home' && 'cursor-grab')}><Icon name="grip" size={16} stroke={2.6} /></span>}
            <Icon name={s.icon} size={17} className="text-mu flex-none" />
            <div className="flex-1 min-w-0">
              <div className="text-[15px]">{s.label} {!phone && <span className="text-[12px] text-mu">Alt {i + 1}</span>}</div>
              <div className="text-[13px] text-mu">{phone ? (s.id === 'home' ? 'Sempre' : pinned ? 'Fissata' : hidden ? 'Nascosta' : 'Nel menu “Altro”') : sub}</div>
            </div>
            {s.id === 'home' ? <span className="text-[13px] text-mu pr-1">Sempre</span> : phone ? (
              <Switch label={'Fissa sul telefono: ' + s.label} on={pinned} onChange={() => togglePin(s.id)} />
            ) : (
              <>
                <span className="hidden xl:flex">
                  <button type="button" aria-label={'Su: ' + s.label} disabled={i <= 1} onClick={() => move(s.id, i - 2)} className="w-7 h-7 rounded text-mu hov disabled:opacity-30 cursor-pointer flex items-center justify-center"><Icon name="chevd" size={14} className="rotate-180" /></button>
                  <button type="button" aria-label={'Giù: ' + s.label} disabled={i >= list.length - 1} onClick={() => move(s.id, i)} className="w-7 h-7 rounded text-mu hov disabled:opacity-30 cursor-pointer flex items-center justify-center"><Icon name="chevd" size={14} /></button>
                </span>
                <button type="button" aria-pressed={pinned} title="Fissata sulla barra del telefono" onClick={() => togglePin(s.id)} className={clsx('h-7 px-2 rounded-md text-[12px] cursor-pointer', pinned ? 'bg-s3 text-tx' : 'text-mu hov')}><Icon name="phone" size={14} /></button>
                <Switch label={'Mostra nel menu: ' + s.label} on={!hidden} onChange={(v) => save({ hidden: v ? settings.hidden.filter((x) => x !== s.id) : [...settings.hidden, s.id] })} />
              </>
            )}
          </div>
        )
      })}
      {!phone && (
        <div className="flex items-center gap-3 m-2 mb-3 px-4 py-3 rounded-lg bg-s2 text-[13px] text-mu">
          <span className="w-1.5 h-1.5 rounded-full bg-ac flex-none" />
          <span className="flex-1">Una sezione è una cartella del vault con un modello (Galleria, Elenco, Schede, Pannello, Mappa). Le note restano visibili anche in Note.</span>
          <Button onClick={() => { useStore.getState().set('claudeOpen', true) }}>Aggiungi sezione</Button>
        </div>
      )}
    </Card>
  )
}

export default function Settings({ phone }: { phone?: boolean }) {
  const settings = useStore((s) => s.settings)
  const save = useStore((s) => s.saveSettings)
  const vault = useStore((s) => s.vault)
  const notes = useStore((s) => s.notes)
  const sync = useStore((s) => s.sync)
  const [syncOff, setSyncOff] = useState(() => localStorage.getItem('theoffice:sync-off') === '1')

  const look = (
    <Card title="Aspetto" plain={phone} flush>
      <Row title="Tema" sub={!phone && 'Lo scuro è quello predefinito'}>
        <Seg label="Tema" value={settings.theme} onChange={(theme) => save({ theme })} size="lg" options={[{ id: 'dark', label: 'Scuro', icon: 'moon' }, { id: 'light', label: 'Chiaro', icon: 'sun' }, { id: 'system', label: 'Sistema', icon: 'phone' }]} />
      </Row>
      <Row title="Colori per sezione" sub="Ogni sezione ha il suo colore nel menu e nelle intestazioni"><Switch label="Colori per sezione" on={settings.sectionColors} onChange={(v) => save({ sectionColors: v })} /></Row>
      <Row title="Densità" sub="Compatta mostra più righe per schermata">
        <label className="relative inline-flex items-center">
          <span className="sr-only">Densità</span>
          <select value={settings.density} onChange={(e) => save({ density: e.target.value as 'comoda' | 'compatta' })} className="appearance-none h-9 pl-3 pr-8 rounded-lg border border-ln bg-s1 text-[14px] cursor-pointer hov">
            <option value="comoda">Comoda</option><option value="compatta">Compatta</option>
          </select>
          <Icon name="chevd" size={14} className="absolute right-2.5 pointer-events-none text-mu" />
        </label>
      </Row>
      {!phone && (
        <Row title="Scorciatoie" sub="Alt 1…7 sezioni · Ctrl K cerca · Ctrl N cattura · Ctrl E modifica">
          <Pop title="Scorciatoie" trigger={<button type="button" className="text-[13px] text-mu px-2 h-8 rounded-md hov cursor-pointer">Elenco</button>}>
            <div className="flex flex-col gap-1.5 min-w-[260px]">{SHORTCUTS.map(([t, k]) => <div key={t} className="flex items-center gap-3 text-[13px]"><span className="flex-1">{t}</span><Kbd>{k}</Kbd></div>)}</div>
          </Pop>
        </Row>
      )}
    </Card>
  )

  const home = (
    <Card title="Home" plain={phone} right={!phone && <span className="text-[13px] text-mu pr-1">Anche da “Personalizza”</span>} flush>
      {CARDS.map(([id, t]) => <Row key={id} title={t} sub="Mostra in Home"><Switch label={'Mostra ' + t} on={settings.homeCards[id] !== false} onChange={(v) => save({ homeCards: { ...settings.homeCards, [id]: v } })} /></Row>)}
    </Card>
  )

  const online = vault?.kind === 'supabase' || (vault?.kind === 'desktop' && !!sync)
  const data = (
    <Card title={phone ? 'Dati' : 'Dati e sincronizzazione'} plain={phone} flush>
      <Row title="Supabase" sub={online ? <SyncStatus /> : 'Non collegato: accedi qui sotto'}><span className="num text-[11px] px-2 py-1 rounded-md bg-s2 text-mu">{online ? 'Attivo' : 'Spento'}</span></Row>
      <Row title="Senza connessione" sub="Le modifiche restano sul dispositivo e partono appena torna la rete"><span className="text-[13px] text-mu">Automatico</span></Row>
      {vault?.kind === 'desktop' && (
        <Row title="Copia automatica nel vault" sub="Tiene allineata la cartella del vault su questo PC con la copia online">
          <Switch label="Copia automatica nel vault" on={!syncOff} onChange={(v) => { localStorage.setItem('theoffice:sync-off', v ? '0' : '1'); setSyncOff(!v); toast(v ? 'Sincronizzazione attiva' : 'Sincronizzazione in pausa', { description: 'Vale dal prossimo avvio dell’app.' }) }} />
        </Row>
      )}
      <Row title="Esporta come vault Obsidian" sub={`Scarica tutte le ${notes.length} note in uno zip con le cartelle`}><Button icon="download" onClick={exportVault}>Esporta</Button></Row>
    </Card>
  )

  const claude = (
    <Card title="Claude" plain={phone} flush>
      <Row title="Chat dentro The Office" sub="Sul PC, tramite Claude Code e il tuo abbonamento"><span className="text-[13px] text-mu">{vault?.kind === 'desktop' ? 'Ctrl J' : 'Solo sul PC'}</span></Row>
      <Row title="Dal telefono" sub="Usa l’app Claude: legge e scrive gli stessi dati"><span className="text-[13px] text-mu">Connettore Supabase</span></Row>
      <Row title="Progetto delle miniature" sub="Link del progetto claude.ai «TLOTR - miniature»: dal telefono le richieste della sezione Miniature si aprono lì">
        <input defaultValue={settings.mesbgUrl || ''} onBlur={(e) => save({ mesbgUrl: e.target.value.trim() || undefined })} placeholder="https://claude.ai/project/…" aria-label="Link del progetto delle miniature" className={inputCls + ' w-[260px] !h-9 !text-[13px]'} />
      </Row>
    </Card>
  )

  if (phone)
    return (
      <div className="flex flex-col gap-3">
        {look}
        <SectionsCard phone />
        {data}
        <OnlineCard />
        {home}
        {claude}
        <p className="m-0 text-[12px] text-mu px-1">The Office 2.1</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <PageHead dot="#A5A5AE" title="Impostazioni" sub="Valgono su questo dispositivo" />
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
        <div className="flex flex-col gap-4 min-w-0">{look}<SectionsCard /></div>
        <div className="flex flex-col gap-4 min-w-0">{home}{data}<OnlineCard />{claude}</div>
      </div>
      <p className="m-0 text-[12px] text-mu px-1">The Office 2.1</p>
    </div>
  )
}
