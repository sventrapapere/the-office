import clsx from 'clsx'
import { useStore, type SectionId } from '../store'
import { SECTIONS } from '../sections'
import { PageHead, Card, Seg, Kbd } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { SyncStatus } from '../ui/Shell'
import { OnlineCard } from '../ui/Connect'

const CARDS: [string, string, string][] = [
  ['cattura', 'Cattura veloce', 'La barra per scrivere al volo'],
  ['abitudini', 'Ogni giorno', 'Le abitudini da spuntare'],
  ['costanza', 'Costanza', 'Calendario e giorni di fila'],
  ['dafare', 'Da fare', 'Le cose in sospeso'],
  ['spesa', 'Lista della spesa', ''],
  ['recenti', 'Modificate di recente', 'Le ultime note toccate'],
]

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={clsx('relative w-10 h-6 rounded-full flex-none cursor-pointer transition-colors duration-150', on ? 'bg-tx' : 'bg-s3 border border-ol')}>
      <span className={clsx('absolute left-0 top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full transition-transform duration-150 ease-out', on ? 'bg-bg translate-x-[19px]' : 'bg-mu translate-x-[3px]')} />
    </button>
  )
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-h-[52px] px-1 border-b border-ln last:border-b-0">
      <div className="flex-1 min-w-0"><div>{title}</div>{sub && <div className="text-[12px] text-mu">{sub}</div>}</div>
      {children}
    </div>
  )
}

export default function Settings({ phone }: { phone?: boolean }) {
  const settings = useStore((s) => s.settings)
  const save = useStore((s) => s.saveSettings)
  const vault = useStore((s) => s.vault)
  const notes = useStore((s) => s.notes)
  const pinnable = SECTIONS.filter((s) => s.id !== 'home')
  const togglePin = (id: SectionId) => {
    const p = settings.pinned.includes(id) ? settings.pinned.filter((x) => x !== id) : [...settings.pinned, id].slice(-3)
    save({ pinned: p })
  }
  return (
    <div className="flex flex-col gap-4 max-w-[760px]">
      {!phone && <PageHead dot="#A5A5AE" title="Impostazioni" sub="Valgono su questo dispositivo" />}
      <Card title="Aspetto" flush>
        <Row title="Tema" sub="Scuro è il predefinito">
          <Seg label="Tema" value={settings.theme} onChange={(theme) => save({ theme })} options={[{ id: 'dark', label: 'Scuro' }, { id: 'light', label: 'Chiaro' }, { id: 'system', label: 'Sistema' }]} />
        </Row>
      </Card>
      <Card title="Home" flush>
        {CARDS.map(([id, t, s]) => (
          <Row key={id} title={t} sub={s || undefined}>
            <Switch label={'Mostra ' + t} on={settings.homeCards[id] !== false} onChange={(v) => save({ homeCards: { ...settings.homeCards, [id]: v } })} />
          </Row>
        ))}
      </Card>
      <Card title="Schede in basso sul telefono" right={<span className="text-[12px] text-mu">{settings.pinned.length}/3</span>}>
        <p className="m-0 text-[13px] text-mu">Oggi c’è sempre; scegli le altre tre. Il resto sta in “Altro”.</p>
        <div className="flex flex-wrap gap-2">
          {pinnable.map((s) => {
            const on = settings.pinned.includes(s.id)
            return (
              <button key={s.id} type="button" aria-pressed={on} onClick={() => togglePin(s.id)} className={clsx('press h-9 px-3 rounded-lg border inline-flex items-center gap-2 text-[13px] cursor-pointer', on ? 'bg-s3 border-ol text-tx font-semibold' : 'border-ln text-mu hov')}>
                <Icon name={s.icon} size={15} />{s.label}
              </button>
            )
          })}
        </div>
      </Card>
      <OnlineCard />
      <Card title="Vault" flush>
        <Row title={vault?.name || '—'} sub={vault?.kind === 'desktop' ? 'Cartella sul PC, letta dall’app' : vault?.kind === 'supabase' ? 'Online, condiviso tra PC e telefono' : 'Dati di prova'}><SyncStatus /></Row>
        <Row title="Note" sub="File .md indicizzati"><span className="num text-mu">{notes.length}</span></Row>
      </Card>
      {!phone && (
        <Card title="Scorciatoie" flush>
          {[['Cerca o esegui un comando', 'Ctrl K'], ['Cattura veloce', 'Ctrl N'], ['Chat con Claude', 'Ctrl J'], ['Vai a una sezione', 'Alt 1…7'], ['Salva la nota', 'Ctrl S'], ['Chiudi / indietro', 'Esc']].map(([t, k]) => (
            <Row key={t} title={t}><Kbd>{k}</Kbd></Row>
          ))}
        </Card>
      )}
      <p className="m-0 text-[12px] text-mu px-1">The Office 2.0</p>
    </div>
  )
}
