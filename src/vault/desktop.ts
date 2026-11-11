import type { Vault, VaultFile } from './types'

/**
 * Vault della cartella sul PC, servito dall'app desktop (protocollo interno office.localhost).
 * Stesse API della v1 (`/_api/*`), così la nuova interfaccia gira già dentro TheOffice.exe.
 */
const SKIP_TOP = ['+', '_dashboard', '_templates', '30 Archivio lavori', '40 Documenti personali']

export const isDesktop = () =>
  typeof location !== 'undefined' && (location.hostname === 'office.localhost' || location.protocol === 'office:')
// Nota: niente controllo su __TAURI_INTERNALS__, c'è anche nell'app Android (che invece usa Supabase)

export function desktopVault(name = 'GONDISHAPUR', base = ''): Vault {
  const enc = (p: string) => base + '/_api/file?path=' + encodeURIComponent(p)
  // i file del vault sono serviti anche direttamente (GET/HEAD /<percorso>): più leggero per le immagini
  const direct = (p: string) => base + '/' + p.split('/').map(encodeURIComponent).join('/')
  const err = async (r: Response) => new Error((await r.text().catch(() => '')) || 'errore ' + r.status)
  let own = 0
  return {
    name,
    kind: 'desktop',
    async list(): Promise<VaultFile[]> {
      const r = await fetch(base + '/_api/list?skip=' + encodeURIComponent(SKIP_TOP.join('|')))
      if (!r.ok) throw await err(r)
      return ((await r.json()) as { path: string; mtime: number; text: string }[]).map((f) => ({ path: f.path, mtime: f.mtime, text: f.text.replace(/\r\n?/g, '\n') }))
    },
    async read(p) {
      const r = await fetch(enc(p))
      if (r.status === 404) return null
      if (!r.ok) throw await err(r)
      return (await r.text()).replace(/\r\n?/g, '\n')
    },
    async write(p, t) {
      own = Date.now()
      const r = await fetch(enc(p), { method: 'PUT', body: t })
      own = Date.now()
      if (!r.ok) throw await err(r)
    },
    async remove(p) {
      own = Date.now()
      const r = await fetch(enc(p), { method: 'DELETE' })
      if (!r.ok) throw await err(r)
    },
    async exists(p) {
      return (await fetch(direct(p), { method: 'HEAD' }).catch(() => null))?.ok ?? false
    },
    async url(p) {
      return direct(p)
    },
    async find(n) {
      try {
        const r = await fetch(base + '/_api/find?name=' + encodeURIComponent(n))
        if (!r.ok) return null
        return ((await r.json()) as { path?: string }).path || null
      } catch {
        return null
      }
    },
    watch(cb) {
      let n = 0
      let stop = false
      let t: ReturnType<typeof setTimeout>
      const tick = async () => {
        try {
          const j = (await (await fetch(base + '/_api/changes')).json()) as { n: number }
          if (n && j.n !== n && Date.now() - own > 2500) cb()
          n = j.n
        } catch {
          /* app non raggiungibile: riprovo */
        }
        if (!stop) t = setTimeout(tick, document.visibilityState === 'visible' ? 1500 : 6000)
      }
      tick()
      return () => {
        stop = true
        clearTimeout(t)
      }
    },
    openExternal(url) {
      fetch(base + '/_api/open?url=' + encodeURIComponent(url)).catch(() => window.open(url, '_blank'))
    },
  }
}
