import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { diffComm, mergeDiff3 } from 'node-diff3'
import { useStore } from '../store'
import { sectionOf } from '../sections'
import { esc } from '../lib/md'
import { MdBlock } from '../ui/MdBlock'
import { Modal } from '../ui/Sheet'
import { Button, Seg } from '../ui/kit'
import { Icon } from '../ui/Icon'

/** Evidenziazione leggera del markdown (stesso testo, solo colori), dietro al textarea trasparente. */
function highlight(src: string): string {
  const lines = src.split('\n')
  let inFm = lines[0] === '---'
  return lines
    .map((l, i) => {
      const e = esc(l)
      if (inFm) { if (i > 0 && l === '---') inFm = false; return `<span class="hl-fm">${e}</span>` }
      if (/^#{1,6}\s/.test(l)) return `<span class="hl-h">${e}</span>`
      if (/^>/.test(l)) return `<span class="hl-q">${e}</span>`
      return e
        .replace(/(\[\[[^\]]*\]\])/g, '<span class="hl-l">$1</span>')
        .replace(/^(\s*[-*]\s+\[[ xX]\])/, '<span class="hl-t">$1</span>')
        .replace(/(\*\*[^*]+\*\*)/g, '<span class="hl-b">$1</span>')
    })
    .join('\n') + '\n'
}

const LH = 22 // altezza riga in px (font mono 13.5px)

export default function Editor({ path, base, onDone, phone }: { path: string; base: string; onDone: (saved?: string) => void; phone?: boolean }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)!
  const st = useStore.getState()
  const [text, setText] = useState(base)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [theirs, setTheirs] = useState<string | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [ac, setAc] = useState<{ q: string; start: number; top: number; left: number; sel: number } | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const pre = useRef<HTMLPreElement>(null)
  const gut = useRef<HTMLDivElement>(null)
  const dirty = text !== base
  const note = notes.find((n) => n.path === path)
  const sec = sectionOf(path)

  // la nota è cambiata altrove (telefono, Obsidian, Claude) mentre la modifico?
  useEffect(() => {
    let live = true
    vault.read(path).then((t) => { if (live && t != null && t !== base && t !== text) setTheirs(t) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.mtime])

  const save = async () => {
    const cur = await vault.read(path)
    if (cur != null && cur !== base && cur !== text && !theirs) { setTheirs(cur); return }
    await st.write(path, text, { undoLabel: 'Nota salvata' })
    onDone(text)
  }
  const merge = () => {
    if (theirs == null) return
    const r = mergeDiff3(text.split('\n'), base.split('\n'), theirs.split('\n'), { label: { a: 'questa versione', o: 'prima', b: 'altra versione' } })
    setText(r.result.join('\n'))
    setTheirs(null)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
      if (e.key === 'Escape' && !ac && !diffOpen) { e.preventDefault(); if (!dirty || confirmLeave()) onDone() }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })
  const confirmLeave = () => window.confirm('Ci sono modifiche non salvate. Uscire senza salvare?')

  // ── barra degli strumenti ──
  const wrap = (before: string, after = before, placeholder = '') => {
    const el = ta.current!
    const a = el.selectionStart, b = el.selectionEnd
    const sel = text.slice(a, b) || placeholder
    const next = text.slice(0, a) + before + sel + after + text.slice(b)
    setText(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length) })
  }
  const linePrefix = (p: string) => {
    const el = ta.current!
    const a = text.lastIndexOf('\n', el.selectionStart - 1) + 1
    const next = text.slice(0, a) + p + text.slice(a)
    setText(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(el.selectionStart + p.length, el.selectionStart + p.length) })
  }
  const tools: [string, string, () => void][] = [
    ['B', 'Grassetto', () => wrap('**', '**', 'testo')],
    ['I', 'Corsivo', () => wrap('*', '*', 'testo')],
    ['H', 'Titolo', () => linePrefix('## ')],
    ['•', 'Elenco', () => linePrefix('- ')],
    ['☐', 'Casella', () => linePrefix('- [ ] ')],
    ['[[ ]]', 'Collegamento a una nota', () => wrap('[[', ']]', '')],
    ['❝', 'Citazione', () => linePrefix('> ')],
    ['▦', 'Tabella', () => wrap('\n| Colonna | Colonna |\n|---|---|\n| ', ' |  |\n', 'testo')],
  ]

  // ── suggerimenti [[ ──
  const sugg = useMemo(() => {
    if (!ac) return []
    const q = ac.q.toLowerCase()
    return notes.filter((n) => !n.path.startsWith('_') && n.title.toLowerCase().includes(q)).sort((a, b) => (a.title.toLowerCase().startsWith(q) ? 0 : 1) - (b.title.toLowerCase().startsWith(q) ? 0 : 1) || b.mtime - a.mtime).slice(0, 6)
  }, [ac, notes])
  const updateAc = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const i = before.lastIndexOf('[[')
    if (i < 0 || before.slice(i).includes(']]') || before.slice(i).includes('\n') || caret - i > 60) { setAc(null); return }
    const lineStart = before.lastIndexOf('\n') + 1
    const line = before.slice(0, lineStart).split('\n').length - 1
    const col = caret - lineStart
    const el = ta.current!
    setAc({ q: before.slice(i + 2), start: i, top: (line + 1) * LH + 14 - el.scrollTop, left: Math.min(col * 8.1 + 16 - el.scrollLeft, el.clientWidth - 300), sel: 0 })
  }
  const pick = (title: string) => {
    if (!ac) return
    const el = ta.current!
    const caret = el.selectionStart
    const after = text.slice(caret).startsWith(']]') ? 2 : 0
    const next = text.slice(0, ac.start) + '[[' + title + ']]' + text.slice(caret + after)
    setText(next)
    setAc(null)
    const pos = ac.start + title.length + 4
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }
  const options = ac ? [...sugg.map((n) => ({ title: n.title, sub: sectionOf(n.path).label })), ...(ac.q.trim() ? [{ title: ac.q.trim(), sub: 'nuova nota', create: true }] : [])] : []

  const lines = text.split('\n').length
  const sync = () => {
    const el = ta.current!
    if (pre.current) { pre.current.scrollTop = el.scrollTop; pre.current.scrollLeft = el.scrollLeft }
    if (gut.current) gut.current.scrollTop = el.scrollTop
    if (ac) setAc(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" aria-label="Chiudi la modifica" onClick={() => (!dirty || confirmLeave()) && onDone()} className="press w-[38px] h-[38px] rounded-lg bg-s2 flex items-center justify-center cursor-pointer hov"><Icon name="back" size={17} /></button>
        <nav aria-label="Percorso" className="flex items-center gap-2 min-w-0 flex-1 text-[14px]">
          <span className="text-ac font-semibold whitespace-nowrap">{sec.label}</span>
          <Icon name="chev" size={13} className="text-mu flex-none" />
          <span className="truncate font-semibold">{note?.title || path.split('/').pop()?.replace(/\.md$/, '')}</span>
        </nav>
        <Seg label="Vista" value={mode} onChange={setMode} size="lg" options={[{ id: 'edit', label: 'Modifica' }, { id: 'preview', label: 'Anteprima' }]} />
        {dirty && <span className="inline-flex items-center gap-1.5 text-[13px] text-ac whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-ac" />Non salvata</span>}
        <Button variant="primary" icon="check" size="lg" onClick={save} disabled={!dirty} className="!h-[38px] !text-[13px]">Salva{phone ? '' : ' · Ctrl S'}</Button>
      </div>

      {theirs != null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-s2 border border-ln">
          <Icon name="alert" size={18} className="flex-none" />
          <p className="m-0 flex-1 min-w-[200px] text-[14px]"><b>Modificata anche altrove{note ? ' ' + new Date(note.mtime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}.</b> <span className="text-mu">Salvando adesso sovrascrivi quella versione.</span></p>
          <Button onClick={() => setDiffOpen(true)} className="!border-tx">Vedi differenze</Button>
          <Button variant="accent" onClick={merge}>Unisci</Button>
          <Button variant="ghost" onClick={() => setTheirs(null)}>Sovrascrivi</Button>
        </div>
      )}

      {mode === 'edit' ? (
        <>
          <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-xl bg-s1 border border-ln" role="toolbar" aria-label="Formattazione">
            {tools.map(([l, t, f]) => (
              <button key={t} type="button" title={t} aria-label={t} onMouseDown={(e) => e.preventDefault()} onClick={f} className="press min-w-[40px] h-9 px-2 rounded-md text-[14px] font-semibold cursor-pointer hov">{l}</button>
            ))}
          </div>
          <div className="relative rounded-xl border border-ln bg-s1 overflow-hidden" style={{ height: phone ? '62vh' : 'max(420px, calc(100vh - 330px))' }}>
            <div ref={gut} aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-12 overflow-hidden pt-3.5 text-right pr-3 font-mono text-[12.5px] text-mu select-none" style={{ lineHeight: LH + 'px' }}>
              {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <pre ref={pre} aria-hidden="true" className="editor-layer absolute inset-0 left-12 m-0 overflow-hidden text-tx" dangerouslySetInnerHTML={{ __html: highlight(text) }} />
            <textarea
              ref={ta}
              value={text}
              wrap="off"
              spellCheck={false}
              autoFocus
              aria-label="Testo della nota (Markdown)"
              onChange={(e) => { setText(e.target.value); updateAc(e.target.value, e.target.selectionStart) }}
              onScroll={sync}
              onKeyDown={(e) => {
                if (!ac || !options.length) return
                if (e.key === 'ArrowDown') { e.preventDefault(); setAc({ ...ac, sel: (ac.sel + 1) % options.length }) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setAc({ ...ac, sel: (ac.sel - 1 + options.length) % options.length }) }
                else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[ac.sel].title) }
                else if (e.key === 'Escape') { e.preventDefault(); setAc(null) }
              }}
              className="editor-layer absolute inset-0 left-12 w-[calc(100%-3rem)] h-full resize-none bg-transparent outline-none text-transparent caret-[var(--tx)] selection:bg-[var(--acs)]"
            />
            {ac && options.length > 0 && (
              <div role="listbox" aria-label="Note da collegare" className="pop absolute z-10 w-[300px] py-1" style={{ ...(ac.top + 260 > (ta.current?.clientHeight ?? 600) ? { bottom: (ta.current?.clientHeight ?? 600) - ac.top + LH + 4 } : { top: ac.top }), left: Math.max(56, ac.left + 48) }}>
                {options.map((o, i) => (
                  <button key={o.title + i} type="button" role="option" aria-selected={i === ac.sel} onMouseDown={(e) => { e.preventDefault(); pick(o.title) }}
                    className={clsx('w-[calc(100%-8px)] mx-1 flex items-center gap-3 h-10 px-3 rounded-md text-left text-[14px] cursor-pointer', i === ac.sel && 'bg-s3')}>
                    <span className="flex-1 truncate">{'create' in o ? `Crea “${o.title}”` : o.title}</span>
                    <span className="text-[12px] text-mu">{o.sub}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!phone && <p className="m-0 text-[12px] text-mu">Esc torna alla lettura · Ctrl S salva · scrivi [[ per collegare un’altra nota · Markdown come in Obsidian</p>}
        </>
      ) : (
        <Preview text={text} path={path} />
      )}

      <Modal open={diffOpen} onOpenChange={setDiffOpen} title="Differenze con l’altra versione" className="!w-[min(900px,calc(100vw-32px))] max-h-[80vh] overflow-y-auto">
        <div className="px-4 pb-4 flex flex-col gap-3">
          <p className="m-0 text-[13px] text-mu"><span className="text-ok">+ verde</span>: solo nell’altra versione (telefono, Obsidian, Claude) · <span className="text-ac">− arancio</span>: solo nella tua.</p>
          <pre className="m-0 p-3 rounded-lg bg-s2 border border-ln font-mono text-[12.5px] leading-[20px] overflow-x-auto whitespace-pre-wrap">
            {theirs != null && diffComm(text.split('\n'), theirs.split('\n')).flatMap((c, i) =>
              c.common ? c.common.map((l, j) => <div key={i + '-' + j} className="text-mu">{'  ' + l}</div>)
                : [...(c.buffer1 || []).map((l, j) => <div key={i + 'a' + j} className="text-ac">{'− ' + l}</div>), ...(c.buffer2 || []).map((l, j) => <div key={i + 'b' + j} className="text-ok">{'+ ' + l}</div>)])}
          </pre>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => { if (theirs != null) { setText(theirs); setTheirs(null) } setDiffOpen(false) }}>Tieni l’altra</Button>
            <Button variant="accent" onClick={() => { merge(); setDiffOpen(false) }}>Unisci</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Preview({ text, path }: { text: string; path: string }) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
  return <div className="rounded-xl border border-ln bg-s1 p-6"><MdBlock text={body} from={path} /></div>
}
