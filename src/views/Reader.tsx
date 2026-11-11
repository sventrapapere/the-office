import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useStore } from '../store'
import { sectionOf } from '../sections'
import { mdRender, parseFM, toggleTaskLine, backlinks, fmStr, norm, noteDir, type Note } from '../lib/md'
import { hydrateImages } from '../lib/assets'
import { Button, Dot, IconButton, relTime, Badge } from '../ui/kit'
import { Icon } from '../ui/Icon'

/** Proprietà del frontmatter mostrate in testa alla nota (le altre restano nel testo). */
const HIDE = new Set(['title', 'aliases', 'cssclasses', 'poster', 'created', 'updated'])

function Props({ fm }: { fm: Note['fm'] }) {
  const entries = Object.entries(fm).filter(([k, v]) => !HIDE.has(k) && v !== '' && !(Array.isArray(v) && !v.length))
  if (!entries.length) return null
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_1fr] gap-x-4 gap-y-1.5 m-0 mb-5 p-3.5 rounded-xl border border-ln bg-s1 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mu">{k.replace(/_/g, ' ')}</dt>
          <dd className="m-0 min-w-0 break-words">
            {typeof v === 'boolean' ? (v ? 'sì' : 'no') : Array.isArray(v) ? (
              <span className="flex flex-wrap gap-1">{v.map((x) => <span key={x} className="px-1.5 rounded-md bg-s2 border border-ln text-[12px]">{x}</span>)}</span>
            ) : /^https?:\/\//.test(String(v)) ? (
              <a href={String(v)} target="_blank" rel="noopener" className="text-ac break-all">{String(v).replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</a>
            ) : fmStr(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Reader({ phone }: { phone?: boolean }) {
  const reader = useStore((s) => s.reader)!
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)!
  const st = useStore.getState()
  const stack = useStore((s) => s.stack)
  const [raw, setRaw] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [missing, setMissing] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const note = notes.find((n) => n.path === reader.path)
  const sec = sectionOf(reader.path)

  useEffect(() => {
    let live = true
    setMissing(false)
    vault.read(reader.path).then((t) => {
      if (!live) return
      if (t == null) setMissing(true)
      setRaw(t ?? '')
      setDraft(t ?? '')
    })
    return () => { live = false }
  }, [reader.path, vault, note?.mtime])

  const { fm, html, h1 } = useMemo(() => {
    if (raw == null) return { fm: {}, html: '', h1: null as string | null }
    const { fm, body } = parseFM(raw)
    const off = norm(raw).split('\n').length - body.split('\n').length
    // Se la nota apre con un titolo "# …", diventa il titolo della pagina (niente doppione)
    const lines = body.split('\n')
    const i = lines.findIndex((l) => l.trim() !== '')
    const m = i >= 0 ? lines[i].match(/^#\s+(.+?)\s*#*\s*$/) : null
    if (m) lines[i] = ''
    return { fm, h1: m ? m[1].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/[*_`]/g, '') : null, html: mdRender(lines.join('\n'), { notes, from: reader.path }, off) }
  }, [raw, notes, reader.path])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    hydrateImages(el, vault)
    if (reader.head) {
      const h = el.querySelector(`[data-h="${CSS.escape(reader.head.toLowerCase())}"]`)
      h?.scrollIntoView({ block: 'start' })
    } else window.scrollTo(0, 0)
  }, [html, vault, reader.head])

  const onClick = async (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    const box = t.closest('input[data-line]') as HTMLInputElement | null
    if (box && raw != null) {
      e.preventDefault()
      const next = toggleTaskLine(raw, +box.dataset.line!)
      setRaw(next)
      await st.write(reader.path, next)
      return
    }
    const a = t.closest('a') as HTMLAnchorElement | null
    if (!a) return
    if (a.dataset.note) { e.preventDefault(); st.open(a.dataset.note, a.dataset.head || undefined); return }
    if (a.dataset.new) {
      e.preventDefault()
      const name = a.dataset.new.split('/').pop()!
      const dir = noteDir(reader.path)
      const path = (a.dataset.new.includes('/') ? a.dataset.new : (dir ? dir + '/' : '') + name) + '.md'
      await st.write(path, `# ${name}\n\n`, { undoLabel: 'Nota creata' })
      st.open(path)
      st.setEditing(true)
      return
    }
    if (a.href && /^(https?|obsidian|mailto):/i.test(a.href) && vault.openExternal) { e.preventDefault(); vault.openExternal(a.href) }
  }

  const save = async () => {
    await st.write(reader.path, draft, { undoLabel: 'Nota salvata' })
    setRaw(draft)
    st.setEditing(false)
  }
  useEffect(() => {
    if (!reader.editing) return
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(raw ?? ''); st.setEditing(false) }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  const links = useMemo(() => backlinks(notes, reader.path), [notes, reader.path])
  const title = h1 || note?.title || reader.path.split('/').pop()!.replace(/\.md$/, '')
  const folders = noteDir(reader.path).split('/').filter(Boolean)
  const obsUrl = 'obsidian://open?vault=' + encodeURIComponent(vault.name) + '&file=' + encodeURIComponent(reader.path.replace(/\.md$/, ''))

  return (
    <article className={clsx('mx-auto', phone ? 'pt-1' : 'max-w-[760px] pt-2')}>
      {!phone && (
        <nav aria-label="Percorso" className="flex items-center gap-2 text-[13px] text-mu mb-4 min-w-0">
          <IconButton icon="back" label={stack.length ? 'Nota precedente' : 'Chiudi la nota'} size={30} onClick={st.back} />
          <button type="button" onClick={() => st.go(sec.id)} className="inline-flex items-center gap-1.5 hover:text-tx cursor-pointer">
            <Dot color={sec.dot} size={6} />{sec.label}
          </button>
          {folders.slice(sec.dir ? sec.dir.split('/').length : 0).map((f) => (
            <span key={f} className="contents"><Icon name="chev" size={12} /><span className="truncate">{f}</span></span>
          ))}
          <span className="flex-1" />
          {note && <span className="text-[12px]">modificata {relTime(note.mtime)}</span>}
        </nav>
      )}

      <div className="flex items-start gap-3 mb-4">
        <h1 className={clsx('m-0 flex-1 min-w-0 font-semibold tracking-[-0.015em] break-words', phone ? 'text-[24px]' : 'text-[30px] leading-tight')}>{title}</h1>
        {!reader.editing ? (
          <div className="flex gap-1.5 flex-none">
            {vault.kind === 'desktop' && <IconButton icon="external" label="Apri in Obsidian" onClick={() => vault.openExternal?.(obsUrl)} />}
            <Button icon="edit" onClick={() => { setDraft(raw ?? ''); st.setEditing(true) }}>{phone ? '' : 'Modifica'}</Button>
          </div>
        ) : (
          <div className="flex gap-1.5 flex-none">
            <Button variant="ghost" onClick={() => { setDraft(raw ?? ''); st.setEditing(false) }}>Annulla</Button>
            <Button variant="primary" icon="check" onClick={save} disabled={draft === raw}>Salva</Button>
          </div>
        )}
      </div>

      {missing && !reader.editing && <p className="text-mu">Questa nota non esiste più. Forse è stata spostata o rinominata.</p>}

      {reader.editing ? (
        <>
          <label htmlFor="editor" className="sr-only">Testo della nota (Markdown)</label>
          <textarea
            id="editor"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck
            className="w-full min-h-[60vh] resize-y rounded-xl border border-ol bg-s1 p-4 font-mono text-[13.5px] leading-relaxed text-tx outline-none"
          />
          {!phone && <p className="text-[12px] text-mu mt-2">Markdown come in Obsidian. Ctrl S salva, Esc annulla.</p>}
        </>
      ) : (
        <>
          <Props fm={fm} />
          <div ref={bodyRef} className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}

      {!reader.editing && links.length > 0 && (
        <section className="mt-10 pt-4 border-t border-ln">
          <h2 className="m-0 mb-2 text-[13px] font-semibold flex items-center gap-2">Collegata da <Badge>{links.length}</Badge></h2>
          <div className="flex flex-col">
            {links.map((n) => (
              <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-2.5 min-h-[40px] px-2 -mx-2 rounded-lg text-left hov cursor-pointer">
                <Dot color={sectionOf(n.path).dot} size={6} />
                <span className="flex-1 min-w-0 truncate">{n.title}</span>
                <span className="text-[12px] text-mu truncate max-w-[40%]">{noteDir(n.path)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
