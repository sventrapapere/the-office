import type { Vault, VaultFile } from './types'

/** Vault in memoria: per lo sviluppo e i test (dati da dev/vault.json). */
export function memoryVault(seed: Record<string, { t: string; m: number }>, name = 'GONDISHAPUR'): Vault {
  const files = new Map(Object.entries(seed).map(([p, v]) => [p, { text: v.t.replace(/\r\n?/g, '\n'), mtime: v.m }]))
  const listeners = new Set<() => void>()
  return {
    name,
    kind: 'memory',
    async list(): Promise<VaultFile[]> {
      return [...files].map(([path, f]) => ({ path, mtime: f.mtime, text: f.text }))
    },
    async read(p) {
      return files.get(p)?.text ?? null
    },
    async write(p, t) {
      files.set(p, { text: t, mtime: Date.now() })
    },
    async remove(p) {
      files.delete(p)
    },
    async exists(p) {
      return files.has(p)
    },
    async url() {
      return null
    },
    watch(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
