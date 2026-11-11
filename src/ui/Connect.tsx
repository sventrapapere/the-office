import { useState } from 'react'
import { toast } from 'sonner'
import { useStore } from '../store'
import { Button, Card } from './kit'
import { connect, decodeCode, encodeCode, disconnect, syncNow, uploadAssets } from '../vault/connect'
import { loadSupaConfig } from '../vault/supabase'

const input = 'w-full h-10 px-3 rounded-lg border border-ln bg-s2 text-tx outline-none focus:border-ol placeholder:text-mu'

/** Modulo di collegamento: sul PC si inseriscono URL e chiave, sul telefono basta il codice generato dal PC. */
export function ConnectForm({ compact }: { compact?: boolean }) {
  const cfg0 = loadSupaConfig()
  void compact
  const [code, setCode] = useState('')
  const [url, setUrl] = useState(cfg0?.url || '')
  const [key, setKey] = useState(cfg0?.anonKey || '')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [adv, setAdv] = useState(false)

  const go = async (create: boolean) => {
    const cfg = manual ? (url && key ? { url: url.trim().replace(/\/$/, ''), anonKey: key.trim() } : null) : adv && code.trim() ? decodeCode(code) : loadSupaConfig()
    if (!cfg) { setMsg(manual ? 'Servono URL del progetto e chiave pubblica.' : 'Il codice non è valido: copialo di nuovo dalle Impostazioni sul PC.'); return }
    if (!email || pw.length < 6) { setMsg('Inserisci email e una password di almeno 6 caratteri.'); return }
    setBusy(true); setMsg(null)
    const e = await connect(cfg, email.trim(), pw, create).catch((x) => String(x?.message || x))
    setBusy(false)
    if (e) setMsg(e)
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); go(false) }}>
      {adv && (manual ? (
        <>
          <label className="flex flex-col gap-1 text-[13px] text-mu">URL del progetto Supabase<input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-[13px] text-mu">Chiave pubblica (anon)<input className={input} value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi…" autoComplete="off" /></label>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-[13px] text-mu">Codice di collegamento (dalle Impostazioni sul PC)<textarea className={input + ' h-20 py-2 resize-none font-mono text-[12px]'} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Incolla qui il codice" /></label>
      ))}
      <label className="flex flex-col gap-1 text-[13px] text-mu">Email<input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="flex flex-col gap-1 text-[13px] text-mu">Password<input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
      {msg && <p className="m-0 text-[13px] text-ac" role="alert">{msg}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Collego…' : 'Accedi'}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => go(true)}>Crea l’account</Button>
        <span className="flex-1" />
        {adv ? (
          <button type="button" className="text-[12px] text-mu underline underline-offset-2 cursor-pointer" onClick={() => setManual((m) => !m)}>{manual ? 'Ho un codice' : 'Inserisci URL e chiave'}</button>
        ) : (
          <button type="button" className="text-[12px] text-mu underline underline-offset-2 cursor-pointer" onClick={() => setAdv(true)}>Altro progetto…</button>
        )}
      </div>
    </form>
  )
}

/** Card nelle Impostazioni. */
export function OnlineCard() {
  const vault = useStore((s) => s.vault)
  const sync = useStore((s) => s.sync)
  const cfg = loadSupaConfig()
  const online = vault?.kind === 'supabase' || (vault?.kind === 'desktop' && !!sync)
  const [up, setUp] = useState<string | null>(null)
  if (!online)
    return (
      <Card title="Collegamento online">
        <p className="m-0 text-[13px] text-mu leading-relaxed">
          Accedi per avere le stesse note sul telefono (progetto Supabase gratuito “the-office”, già pronto). La prima volta premi “Crea l’account”. Sul PC le note restano anche nella cartella del vault: Obsidian continua a funzionare.
        </p>
        <ConnectForm />
      </Card>
    )
  const code = cfg ? encodeCode(cfg) : ''
  const r = sync?.last
  return (
    <Card title="Collegamento online">
      <p className="m-0 text-[13px] text-mu">Collegato a <span className="text-tx">{cfg?.url.replace(/^https:\/\//, '')}</span>{vault?.kind === 'desktop' ? ' · questo PC tiene allineata la cartella del vault.' : ''}</p>
      {r && (
        <p className="m-0 text-[13px] text-mu num">
          {r.error ? <span className="text-ac">Errore: {r.error}</span> : <>Ultimo giro {new Date(r.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ricevute {r.pulled} · inviate {r.pushed}{r.assets ? ` · immagini ${r.assets}` : ''}{r.conflicts.length ? ` · conflitti ${r.conflicts.length}` : ''}</>}
        </p>
      )}
      {vault?.kind === 'desktop' && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button icon="sync" onClick={syncNow}>Sincronizza ora</Button>
            <Button icon="download" disabled={!!up} onClick={async () => {
              setUp('…')
              const n = await uploadAssets((d, t) => setUp(`${d}/${t}`))
              setUp(null)
              toast('Immagini controllate', { description: n + ' immagini usate dalle note sono online.' })
            }}>{up ? 'Carico le immagini ' + up : 'Carica le immagini (locandine…)'}</Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px]">Codice per il telefono</span>
            <div className="flex gap-2">
              <input readOnly value={code} className={input + ' font-mono text-[12px]'} onFocus={(e) => e.target.select()} aria-label="Codice di collegamento" />
              <Button onClick={() => navigator.clipboard.writeText(code).then(() => toast('Codice copiato'))}>Copia</Button>
            </div>
            <span className="text-[12px] text-mu">Serve solo se cambi progetto: di base il telefono è già impostato, basta accedere con la stessa email. Il codice contiene indirizzo e chiave pubblica, non la password.</span>
          </div>
        </>
      )}
      <div><Button variant="ghost" onClick={() => disconnect()}>Scollega questo dispositivo</Button></div>
    </Card>
  )
}

/** Schermata iniziale sul telefono, finché non è collegato. */
export function ConnectScreen() {
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-[440px] mx-auto gap-6">
      <div>
        <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em]">The Office</h1>
        <p className="m-0 mt-1 text-mu">Collega il telefono alle tue note.</p>
      </div>
      <ConnectForm compact />
      <p className="m-0 text-[12px] text-mu">Usa la stessa email e password che hai creato sul PC (Impostazioni → Collegamento online).</p>
    </div>
  )
}
