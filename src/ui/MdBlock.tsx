import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store'
import { mdRender, noteDir } from '../lib/md'
import { hydrateImages } from '../lib/assets'

/** Markdown in sola lettura dentro una sezione: i collegamenti aprono le note, le caselle non si toccano. */
export function MdBlock({ text, from, className }: { text: string; from: string; className?: string }) {
  const notes = useStore((s) => s.notes)
  const vault = useStore((s) => s.vault)
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => mdRender(text, { notes, from }, -1e6), [text, notes, from])
  useEffect(() => { if (ref.current && vault) hydrateImages(ref.current, vault) }, [html, vault])
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!a) return
    const st = useStore.getState()
    if (a.dataset.note) { e.preventDefault(); st.open(a.dataset.note, a.dataset.head || undefined) }
    else if (a.dataset.new) {
      e.preventDefault()
      const name = a.dataset.new.split('/').pop()!
      const dir = noteDir(from)
      const path = (a.dataset.new.includes('/') ? a.dataset.new : (dir ? dir + '/' : '') + name) + '.md'
      st.write(path, `# ${name}\n\n`, { undoLabel: 'Nota creata' }).then(() => { st.open(path); st.setEditing(true) })
    }
    else if (a.href && /^(https?|obsidian):/i.test(a.href) && vault?.openExternal) { e.preventDefault(); vault.openExternal(a.href) }
  }
  return <div ref={ref} className={'md ' + (className || '')} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
