import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { Icon } from './Icon'
import { Button, IconButton, Kbd } from './kit'
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

  return (
    <aside
      data-open={open}
      aria-label="Chat con Claude"
      aria-hidden={!open}
      className="side-panel fixed right-4 top-[72px] bottom-4 z-30 w-[400px] max-w-[calc(100vw-120px)] flex flex-col rounded-2xl bg-s1 border border-ol shadow-[var(--shadow)]"
    >
      <div className="flex items-center gap-2 h-[52px] pl-4 pr-2 border-b border-ln">
        <Icon name="claude" size={17} />
        <h2 className="m-0 text-[14px] font-semibold flex-1">Claude</h2>
        <Button size="sm" variant="ghost" onClick={() => setConv(rid())} tabIndex={open ? 0 : -1}>Nuova chat</Button>
        <IconButton icon="close" label="Chiudi la chat" size={32} onClick={() => set('claudeOpen', false)} tabIndex={open ? 0 : -1} />
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
        {!mine.length && (
          <div className="m-auto max-w-[280px] text-center text-mu text-[13px] leading-relaxed">
            Chiedi o fai fare qualcosa sul vault: «aggiungi latte alla spesa», «crea una nota su…», «cosa ho annotato sul Giappone?».
          </div>
        )}
        {mine.map((m) => {
          const r = outs.filter((o) => o.re === m.id && o.type !== 'status').pop()
          const working = outs.some((o) => o.re === m.id && o.type === 'status')
          const age = Date.now() - new Date(m.ts).getTime()
          return (
            <div key={m.id} className="flex flex-col gap-2.5">
              <div className="self-end max-w-[85%] rounded-xl rounded-br-sm bg-s3 px-3 py-2 whitespace-pre-wrap">
                {m.text}
                <span className="block text-right text-[11px] text-mu num">{hhmm(m.ts)}</span>
              </div>
              {r ? (
                <div className={clsx('self-start max-w-[92%] rounded-xl rounded-bl-sm border border-ln px-3 py-2 whitespace-pre-wrap [&_code]:font-mono [&_code]:text-[12px]', r.type === 'error' && 'border-danger')}>
                  <span dangerouslySetInnerHTML={{ __html: mdLite(r.text || '') }} />
                  <span className="block text-[11px] text-mu num">{hhmm(r.ts)}</span>
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
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-end gap-2 p-2.5 border-t border-ln">
        <label htmlFor="chat-in" className="sr-only">Messaggio per Claude</label>
        <textarea
          id="chat-in"
          ref={taRef}
          rows={2}
          value={text}
          tabIndex={open ? 0 : -1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            if (e.key === 'Escape') set('claudeOpen', false)
          }}
          placeholder="Scrivi a Claude…"
          className="flex-1 min-w-0 resize-none max-h-36 rounded-[10px] border border-ln bg-s2 px-3 py-2 text-tx outline-none focus:border-ol placeholder:text-mu"
        />
        <Button variant="primary" type="submit" icon="send" disabled={!text.trim()} tabIndex={open ? 0 : -1}>Invia</Button>
      </form>
      <div className="px-4 pb-2.5 text-[11px] text-mu"><Kbd>Invio</Kbd> invia · <Kbd>Maiusc Invio</Kbd> va a capo</div>
    </aside>
  )
}
