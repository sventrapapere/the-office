import { useEffect, useState } from 'react'
import type { Vault } from '../vault/types'
import { noteDir } from './md'

/** Allegati (locandine, immagini nelle note): percorso nel vault → URL, con cache. */
const urls = new Map<string, Promise<string | null>>()

export async function resolveAsset(vault: Vault, target: string, from = ''): Promise<string | null> {
  target = target.replace(/^\.?\//, '')
  try { target = decodeURI(target) } catch { /* lascio com'è */ }
  const dir = noteDir(from)
  const tries = [target, dir && dir + '/' + target].filter(Boolean) as string[]
  for (const p of tries) if (await vault.exists(p)) return p
  return vault.find ? vault.find(target.split('/').pop()!) : null
}

export function assetUrl(vault: Vault, target: string, from = ''): Promise<string | null> {
  if (/^https?:\/\//i.test(target)) return Promise.resolve(target)
  const k = vault.name + '\u0000' + from + '\u0000' + target
  let p = urls.get(k)
  if (!p) {
    p = resolveAsset(vault, target, from).then((path) => (path ? vault.url(path) : null)).catch(() => null)
    urls.set(k, p)
  }
  return p
}

export function useAssetUrl(vault: Vault | null, target: string | null | undefined, from = ''): string | null {
  const [u, setU] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setU(null)
    if (vault && target) assetUrl(vault, target, from).then((x) => live && setU(x))
    return () => { live = false }
  }, [vault, target, from])
  return u
}

/** Risolve le <img data-asset> prodotte da mdRender dentro un contenitore. */
export function hydrateImages(root: HTMLElement, vault: Vault) {
  root.querySelectorAll<HTMLImageElement>('img[data-asset]').forEach((img) => {
    if (img.src) return
    assetUrl(vault, img.dataset.asset!, img.dataset.from || '').then((u) => {
      if (u) img.src = u
      else {
        const s = document.createElement('span')
        s.className = 'tag'
        s.textContent = '🖼 ' + img.dataset.asset!.split('/').pop()
        img.replaceWith(s)
      }
    })
  })
}
