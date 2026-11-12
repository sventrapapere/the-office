import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useStore } from '../store'
import { sectionOf } from '../sections'
import { mdRender, parseFM, toggleTaskLine, backlinks, fmStr, norm, noteDir, findNote, type Note } from '../lib/md'
import { hydrateImages } from '../lib/assets'
import { Button, IconButton, MoreMenu, type MenuEntry } from '../ui/kit'
import { Icon } from '../ui/Icon'
import Editor from './Editor'
import { addIngredientsToShopping, ingredients } from './Ricette'

/** Proprietà del frontmatter mostrate come pillole in testa alla nota. */
const HIDE = new Set(['title', 'aliases', 'cssclasses', 'poster', 'created', 'lang'])
const fmtDate = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v.slice(0, 10) + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : v)

function Props({ fm }: { fm: Note['fm'] }) {
  const entries = Object.entries(fm).filter(([k, v]) => !HIDE.has(k) && v !== '' && v != null && !(Array.isArray(v) && !v.length))
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {entries.flatMap(([k, v]) => {
        if (k === 'tags') return (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).filter(Boolean).map((t) => <span key={'t' + t} className="h-7 px-2.5 rounded-md bg-s2 text-[13px] inline-flex items-center">#{String(t).replace(/^#/, '')}</span>)
        const val = (typeof v === 'boolean' ? (v ? 'sì' : 'no') : Array.isArray(v) ? v.join(', ') : fmStr(v)).replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
        const isUrl = /^https?:\/\//.test(val)
        return [
          <span key={k} className="h-7 px-2.5 rounded-md bg-s2 text-[13px] inline-flex items-center gap-1.5 max-w-full min-w-0">
            <span className="text-mu">{k.replace(/_/g, ' ')}</span>
            {isUrl ? <a href={val} target="_blank" rel="noopener" className="text-ac truncate">{val.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32)}</a> : <span className="truncate">{fmtDate(val)}</span>}
          </span>,
        ]
      })}
    </div>
  )
}

/** Collegamenti in uscita: [[…]] nel testo, quelli mancanti tratteggiati. */
function outgoing(body: string, notes: Note[], from: string) {
  const seen = new Map<string, { label: string; note: Note | null }>()
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g)) {
    const t = m[1].trim()
    if (seen.has(t)) continue
    seen.set(t, { label: m[2]?.trim() || t.split('/').pop()!, note: findNote(notes, t, from) })
  }
  return [...seen.entries()]
}

export default function Reader({ phone }: { phone?: boolean }) {
  const reader = useStore((s) => s.reader)!
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)!
  const st = useStore.getState()
  const [raw, setRaw] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const note = notes.find((n) => n.path === reader.path)
  const sec = sectionOf(reader.path)

  useEffect(() => { setSlot(document.getElementById('reader-actions')) }, [])
  useEffect(() => {
    let live = true
    setMissing(false)
    vault.read(reader.path).then((t) => {
      if (!live) return
      if (t == null) setMissing(true)
      setRaw(t ?? '')
    })
    return () => { live = false }
  }, [reader.path, vault, note?.mtime])

  const { fm, html, h1, body } = useMemo(() => {
    if (raw == null) return { fm: {} as Note['fm'], html: '', h1: null as string | null, body: '' }
    const { fm, body } = parseFM(raw)
    const off = norm(raw).split('\n').length - body.split('\n').length
    const lines = body.split('\n')
    const i = lines.findIndex((l) => l.trim() !== '')
    const m = i >= 0 ? lines[i].match(/^#\s+(.+?)\s*#*\s*$/) : null
    if (m) lines[i] = ''
    return { fm, body, h1: m ? m[1].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/[*_`]/g, '') : null, html: mdRender(lines.join('\n'), { notes, from: reader.path }, off) }
  }, [raw, notes, reader.path])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    hydrateImages(el, vault)
    if (reader.head) el.querySelector(`[data-h="${CSS.escape(reader.head.toLowerCase())}"]`)?.scrollIntoView({ block: 'start' })
    else window.scrollTo(0, 0)
  }, [html, vault, reader.head])

  const createLinked = async (target: string) => {
    const name = target.split('/').pop()!
    const dir = noteDir(reader.path)
    const path = (target.includes('/') ? target : (dir ? dir + '/' : '') + name) + '.md'
    await st.createNote(path, `# ${name}\n\n`, { edit: true, label: 'Nota creata' })
  }

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
    if (a.dataset.new) { e.preventDefault(); createLinked(a.dataset.new); return }
    if (a.href && /^(https?|obsidian|mailto):/i.test(a.href) && vault.openExternal) { e.preventDefault(); vault.openExternal(a.href) }
  }

  const links = useMemo(() => backlinks(notes, reader.path), [notes, reader.path])
  const out = useMemo(() => outgoing(body, notes, reader.path), [body, notes, reader.path])
  const title = h1 || note?.title || reader.path.split('/').pop()!.replace(/\.md$/, '')
  const dir = noteDir(reader.path)
  const obsUrl = 'obsidian://open?vault=' + encodeURIComponent(vault.name) + '&file=' + encodeURIComponent(reader.path.replace(/\.md$/, ''))
  const download = () => {
    const blob = new Blob([raw ?? ''], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = reader.path.split('/').pop()!
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const folders = useMemo(() => {
    const s = new Set<string>()
    notes.forEach((n) => { const p = n.path.split('/'); for (let i = 1; i < Math.min(p.length, 3); i++) s.add(p.slice(0, i).join('/')) })
    return [...s].filter((d) => !/^(_|\.|04 Checklist)/.test(d) && d !== dir).sort((a, b) => a.localeCompare(b, 'it'))
  }, [notes, dir])
  const recipe = note && reader.path.startsWith('70 Ricette/') && reader.path.split('/').length > 2 ? note : null
  const menu: MenuEntry[] = [
    ...(recipe && ingredients(recipe).length ? [{ label: 'Ingredienti nella spesa', icon: 'cart' as const, onClick: () => addIngredientsToShopping(recipe) }] : []),
    ...(recipe && recipe.fm.testato !== true ? [{ label: 'Segna come provata', icon: 'check' as const, onClick: () => st.setField(recipe.path, 'testato', true, 'Ricetta provata') }] : []),
    ...(recipe ? [{ sep: true, label: '', onClick: () => {} }] : []),
    ...(vault.kind === 'desktop' ? [{ label: 'Apri in Obsidian', icon: 'external' as const, onClick: () => vault.openExternal?.(obsUrl) }] : []),
    { label: 'Scarica il file .md', icon: 'download', onClick: download },
    { label: 'Copia il percorso', icon: 'link', onClick: () => navigator.clipboard.writeText(reader.path) },
    { sep: true, label: '', onClick: () => {} },
    ...folders.slice(0, 14).map((d) => ({ label: 'Sposta in ' + d, icon: 'folder' as const, onClick: () => st.moveNote(reader.path, d) })),
    { sep: true, label: '', onClick: () => {} },
    { label: 'Elimina la nota', icon: 'trash', danger: true, onClick: () => st.deleteNote(reader.path) },
  ]

  if (reader.editing && raw != null)
    return <Editor key={reader.path} path={reader.path} base={raw} phone={phone} onDone={(saved) => { if (saved != null) setRaw(saved); st.setEditing(false) }} />

  const article = (
    <div className={clsx('min-w-0', !phone && 'flex-1')}>
      {missing ? <p className="text-mu">Questa nota non esiste più. Forse è stata spostata o rinominata.</p> : <Props fm={fm} />}
      <h1 className={clsx('m-0 mb-3 font-semibold tracking-[-0.015em] break-words', phone ? 'text-[24px]' : 'text-[28px] leading-tight')}>{title}</h1>
      <div ref={bodyRef} className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )

  const side = (
    <aside className={clsx('flex flex-col gap-3', phone ? 'mt-8' : 'w-[300px] flex-none')}>
      {links.length > 0 && (
        <section className="rounded-xl border border-ln">
          <h2 className="m-0 px-4 h-11 flex items-center text-[13px] font-semibold border-b border-ln">Collegata da</h2>
          <div className="flex flex-col px-2 py-1">
            {links.map((n) => (
              <button key={n.path} type="button" onClick={() => st.open(n.path)} className="flex items-center gap-2.5 min-h-[44px] px-2 rounded-md text-left cursor-pointer hov">
                <Icon name="note" size={15} className="text-mu flex-none" />
                <span className="flex-1 min-w-0 truncate">{n.title}{/moc/i.test(n.name) ? ' (MOC)' : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {out.length > 0 && (
        <section className="rounded-xl border border-ln">
          <h2 className="m-0 px-4 h-11 flex items-center text-[13px] font-semibold border-b border-ln">Collegamenti in uscita</h2>
          <div className="flex flex-wrap gap-1.5 p-3">
            {out.map(([t, o]) =>
              o.note ? (
                <button key={t} type="button" onClick={() => st.open(o.note!.path)} className="h-8 px-2.5 rounded-md bg-s2 text-[13px] cursor-pointer hov">{o.label}</button>
              ) : (
                <button key={t} type="button" onClick={() => createLinked(t)} title="Crea la nota" className="h-8 px-2.5 rounded-md border border-dashed border-ol text-[13px] text-mu cursor-pointer hov">{o.label} · da creare</button>
              ),
            )}
          </div>
        </section>
      )}
      <section className="rounded-xl border border-ln">
        <h2 className="m-0 px-4 h-11 flex items-center text-[13px] font-semibold border-b border-ln">Dove si trova</h2>
        <div className="px-4 py-3 flex flex-col gap-0.5">
          <span>Cartella <b className="font-semibold">{dir ? dir.split('/').pop() : 'radice'}</b></span>
          <span className="text-[13px] text-mu break-words">
            {sec.id === 'note' ? 'Visibile in Note' : `Visibile in ${sec.label} e in Note`} · percorso {reader.path}
          </span>
          {note && <span className="text-[12px] text-mu mt-1">Modificata {new Date(note.mtime).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
      </section>
    </aside>
  )

  if (phone)
    return (
      <article className="pt-1 pb-6">
        {slot && createPortal(
          <>
            <IconButton icon="edit" label="Modifica" size={44} onClick={() => st.setEditing(true)} />
            <MoreMenu items={menu} size={44} />
          </>, slot)}
        {article}
        {side}
      </article>
    )

  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" aria-label={useStore.getState().stack.length ? 'Nota precedente' : 'Chiudi la nota'} onClick={st.back} className="press w-[38px] h-[38px] rounded-lg bg-s2 flex items-center justify-center cursor-pointer hov"><Icon name="back" size={17} /></button>
        <nav aria-label="Percorso" className="flex items-center gap-2 min-w-0 flex-1 text-[14px]">
          <button type="button" onClick={() => st.go(sec.id)} className="text-ac font-semibold whitespace-nowrap cursor-pointer hover:underline">{sec.label}</button>
          {sec.id === 'note' && dir && (
            <span className="contents"><Icon name="chev" size={13} className="text-mu flex-none" /><span className="text-mu truncate">{dir.split('/')[0]}</span></span>
          )}
          <Icon name="chev" size={13} className="text-mu flex-none" />
          <span className="truncate font-semibold">{title}</span>
        </nav>
        <Button size="lg" icon="edit" onClick={() => st.setEditing(true)} className="!h-[38px] !text-[14px]" kbd="Ctrl E">Modifica</Button>
        <IconButton icon="download" label="Scarica il file .md" size={38} onClick={download} />
        <MoreMenu items={menu} size={38} />
      </div>
      <div className="rounded-2xl bg-s1 border border-ln p-7 flex gap-8 items-start">
        {article}
        {side}
      </div>
    </article>
  )
}
