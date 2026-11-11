export interface VaultFile {
  path: string
  mtime: number
  text: string
}

export type SyncState = 'ok' | 'syncing' | 'offline' | 'error'

/** Accesso alle note: stesso contratto per il vault locale, l'app desktop e Supabase. */
export interface Vault {
  name: string
  kind: 'memory' | 'desktop' | 'supabase'
  list(): Promise<VaultFile[]>
  read(path: string): Promise<string | null>
  write(path: string, text: string): Promise<void>
  remove?(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** URL utilizzabile in <img> per un allegato (locandine, immagini). */
  url(path: string): Promise<string | null>
  /** Trova un allegato per nome ovunque nel vault. */
  find?(name: string): Promise<string | null>
  /** Avvisa quando qualcosa cambia fuori dall'app (Obsidian, telefono, Claude). */
  watch?(onChange: () => void): () => void
  /** Stato della sincronizzazione, se la sorgente è remota. */
  status?(): SyncState
  /** Chiamata dal desktop: apre un link esterno nel browser di sistema. */
  openExternal?(url: string): void
}
