import type { IconName } from './ui/Icon'
import type { SectionId, Settings } from './store'

export interface SectionDef { id: SectionId; label: string; short: string; icon: IconName; dot: string; dir?: string; model?: string }

/** Una voce di menu per sezione (Alt 1…n). Le nuove sezioni si aggiungono qui. */
export const SECTIONS: SectionDef[] = [
  { id: 'home', label: 'Home', short: 'Oggi', icon: 'home', dot: '#A5A5AE' },
  { id: 'note', label: 'Note', short: 'Note', icon: 'note', dot: '#B39DF0', model: 'Tutte le note del vault' },
  { id: 'film', label: 'Film e serie', short: 'Film', icon: 'film', dot: '#F08FB0', dir: '60 Film, serie e anime/Titoli', model: 'Galleria' },
  { id: 'libri', label: 'Libri', short: 'Libri', icon: 'libri', dot: '#7FB8F0', dir: '80 Libri/Titoli', model: 'Galleria' },
  { id: 'ricette', label: 'Ricette', short: 'Ricette', icon: 'ricette', dot: '#8FD07E', dir: '70 Ricette', model: 'Schede' },
  { id: 'miniature', label: 'Miniature', short: 'Miniature', icon: 'mini', dot: '#D2BE6E', dir: '55 Miniature', model: 'Pannello' },
  { id: 'giappone', label: 'Giappone', short: 'Giappone', icon: 'giappone', dot: '#F2957E', dir: '10 Giappone', model: 'Mappa (MOC)' },
]
export const SETTINGS_SECTION: SectionDef = { id: 'impostazioni', label: 'Impostazioni', short: 'Impostazioni', icon: 'settings', dot: '#A5A5AE' }
export const section = (id: SectionId) => SECTIONS.find((s) => s.id === id) || SETTINGS_SECTION

/** Sezioni nell'ordine scelto in Impostazioni (Home sempre prima), con o senza le nascoste. */
export function orderedSections(st: Pick<Settings, 'order' | 'hidden'>, withHidden = false): SectionDef[] {
  const rest = SECTIONS.slice(1)
  const idx = (id: SectionId) => { const i = st.order.indexOf(id); return i < 0 ? 100 + SECTIONS.findIndex((s) => s.id === id) : i }
  const sorted = [...rest].sort((a, b) => idx(a.id) - idx(b.id))
  return [SECTIONS[0], ...sorted.filter((s) => withHidden || !st.hidden.includes(s.id))]
}

/** Sezione a cui appartiene una nota (per breadcrumb e ricerca): le note restano anche in "Note". */
export function sectionOf(path: string): SectionDef {
  return SECTIONS.find((s) => s.dir && path.startsWith(s.dir.split('/')[0] + '/')) || SECTIONS[1]
}
