import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { Icon } from './Icon'
import { IconButton, MoreMenu } from './kit'
import { esc } from '../lib/md'

/**
 * Chat con Claude dal PC. Stesso protocollo della v1: i messaggi vanno in
 * _dashboard/chat-in.jsonl, l'app desktop li passa a Claude Code nella cartella
 * del vault e scrive le risposte in _dashboard/chat-out.jsonl.
 */
const CHAT_IN = '_dashboard/chat-in.jsonl'
const CHAT_OUT = '_dashboard/chat-out.jsonl'
const CONV_KEY = 'theoffice:chatConv'

interface In { type: 'msg'; id: string; conv: string; ts: string; text: string }
interface Out { type: 'reply' | 'error' | 'status'; re: string; ts: string; text?: string }

const jsonl = <T,>(t: string | null): T[] =>
  (t || '').split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as T] } catch { return [] } })
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const hhmm = (ts: string) => { const d = new Date(ts); return isNaN(+d) ? '' : d.toTimeString().slice(0, 5) }
const mdLite = (t: string) =>
  esc(t).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/^- /gm, '• ')

export function ClaudePanel() {
  const open = useStore((s) => s.claudeOpen)
  const set = useStore((s) => s.set)
  const vault = useStore((s) => s.vault)
  const refresh = useStore((s) => s.refresh)
  const [conv, setConv] = useState(() => localStorage.getItem(CONV_KEY) || rid())
  const [ins, setIns] = useState<In[]>([])
  const [outs, setOuts] = useState<Out[]>([])
  const [text, setText] = useState('')
  const [worker, setWorker] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { localStorage.setItem(CONV_KEY, conv) }, [conv])
  useEffect(() => {
    if (vault?.kind !== 'desktop') return
    fetch('/_api/chat-status').then((r) => r.json()).then((j) => setWorker(j.worker || null)).catch(() => {})
  }, [vault])

  const mine = ins.filter((m) => m.type === 'msg' && m.conv === conv)
  const answered = new Set(outs.filter((o) => o.type !== 'status').map((o) => o.re))
  const pending = mine.some((m) => !answered.has(m.id))

  useEffect(() => {
    if (!vault) return
    let stop = false
    let t: ReturnType<typeof setTimeout>
    let seen = -1
    const tick = async () => {
      try {
        const [a, b] = await Promise.all([vault.read(CHAT_IN), vault.read(CHAT_OUT)])
        const o = jsonl<Out>(b)
        const n = o.filter((x) => x.type !== 'status').length
        if (seen >= 0 && n > seen) refresh()
        seen = n
        setIns(jsonl<In>(a))
        setOuts(o)
      } catch { /* riprovo */ }
      if (!stop) t = setTimeout(tick, pending ? 2000 : open ? 10000 : 60000)
    }
    tick()
    return () => { stop = true; clearTimeout(t) }
  }, [vault, open, pending, refresh])

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 60)
  }, [open])
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ins.length, outs.length, open])

  const send = async () => {
    const t = text.trim()
    if (!t || !vault) return
    const m: In = { type: 'msg', id: rid(), conv, ts: new Date().toISOString(), text: t }
    setText('')
    setIns((x) => [...x, m])
    try {
      const cur = (await vault.read(CHAT_IN)) || ''
      await vault.write(CHAT_IN, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + JSON.stringify(m) + '\n')
    } catch {
      setText(t)
    }
  }

  const offline =
    vault?.kind !== 'desktop' ? 'La chat risponde solo dall’app sul PC.' : worker === 'no-claude' ? 'Claude Code non è installato su questo PC (comando «claude» non trovato).' : 'La chat dell’app non risponde: chiudi e riapri The Office.'

  const notes = useStore((s) => s.notes)
  /** Note toccate mentre Claude lavorava a una richiesta (dalla data di modifica). */
  const touched = (from: string, to: string) => {
    const a = Date.parse(from) - 2000, b = Date.parse(to) + 4000
    return notes.filter((n) => n.mtime >= a && n.mtime <= b && !n.path.startsWith('_dashboard/')).slice(0, 4)
  }
  return (
    <aside
      data-open={open}
      aria-label="Chat con Claude"
      aria-hidden={!open}
      className="side-panel fixed right-3 top-3 bottom-3 z-30 w-[350px] max-w-[calc(100vw-120px)] flex flex-col rounded-2xl bg-s1 border border-ln shadow-[var(--shadow)]"
    >
      <div className="flex items-start gap-3 pt-4 pb-3 pl-4 pr-2">
        <Icon name="claude" size={17} className="mt-1 text-mu" />
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-[17px] font-semibold">Claude</h2>
          <p className="m-0 text-[12px] text-mu leading-snug">Usa il tuo abbonamento tramite Claude Code</p>
        </div>
        <MoreMenu items={[{ label: 'Nuova chat', icon: 'plus', onClick: () => setConv(rid()) }]} />
        <IconButton icon="close" label="Chiudi la chat" size={32} onClick={() => set('claudeOpen', false)} tabIndex={open ? 0 : -1} />
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2.5">
        {!mine.length && (
          <div className="m-auto max-w-[260px] text-center text-mu text-[13px] leading-relaxed">
            Chiedi o fai fare qualcosa sulle tue note: «aggiungi latte alla spesa», «crea una nota su…», «quali film da vedere sono anime?».
          </div>
        )}
        {mine.map((m) => {
          const r = outs.filter((o) => o.re === m.id && o.type !== 'status').pop()
          const working = outs.some((o) => o.re === m.id && o.type === 'status')
          const age = Date.now() - new Date(m.ts).getTime()
          const ch = r && r.type === 'reply' ? touched(m.ts, r.ts) : []
          return (
            <div key={m.id} className="flex flex-col gap-2">
              <div className="self-end max-w-[88%] rounded-2xl bg-s3 px-3.5 py-2.5 whitespace-pre-wrap leading-snug" title={hhmm(m.ts)}>
                {m.text}
              </div>
              {ch.map((n) => (
                <button key={n.path} type="button" onClick={() => useStore.getState().open(n.path)} className="self-start inline-flex items-center gap-2 h-7 px-2.5 rounded-md bg-s2 text-[12px] text-mu cursor-pointer hov max-w-full">
                  <Icon name="check" size={13} className="text-ok flex-none" />
                  <span className="truncate">Modificata: {n.path}</span>
                </button>
              ))}
              {r ? (
                <div className={clsx('self-start max-w-[92%] rounded-2xl bg-s2 px-3.5 py-2.5 whitespace-pre-wrap leading-snug [&_code]:font-mono [&_code]:text-[12px] [&_b]:font-semibold', r.type === 'error' && 'border border-danger')} title={hhmm(r.ts)}>
                  <span dangerouslySetInnerHTML={{ __html: mdLite(r.text || '') }} />
                </div>
              ) : (
                <div className="self-start text-[13px] text-mu flex items-center gap-2" role="status">
                  <span className="w-1.5 h-1.5 rounded-full bg-ac animate-pulse" />
                  {working ? 'Claude sta lavorando…' : age > 20000 ? offline : 'Inviato, in attesa…'}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="m-3 mt-0 flex items-end gap-1 rounded-xl border border-ln bg-s2 focus-within:border-ol pl-3.5 pr-1.5 py-1.5">
        <label htmlFor="chat-in" className="sr-only">Messaggio per Claude</label>
        <textarea
          id="chat-in"
          ref={taRef}
          rows={1}
          value={text}
          tabIndex={open ? 0 : -1}
          onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            if (e.key === 'Escape') set('claudeOpen', false)
          }}
          placeholder="Chiedi qualcosa sulle tue note…"
          className="flex-1 min-w-0 resize-none max-h-36 bg-transparent py-2 text-tx outline-none placeholder:text-mu"
        />
        <IconButton icon="send" label="Invia" size={36} type="submit" disabled={!text.trim()} tabIndex={open ? 0 : -1} className={text.trim() ? 'text-ac' : ''} />
      </form>
    </aside>
  )
}
