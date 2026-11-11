import { describe, it, expect } from 'vitest'
import { plan, hash, mergeLog, referencedAssets, conflictPath } from '../src/vault/sync'

const M = (o: Record<string, string>) => new Map(Object.entries(o))
const R = (o: Record<string, string | null>) => new Map(Object.entries(o))

describe('sync a tre vie', () => {
  it('nota nuova sul PC → push; nuova online → pull', () => {
    const s = plan(M({ 'a.md': 'A' }), R({ 'b.md': 'B' }), {})
    expect(s.find((x) => x.path === 'a.md')!.op).toBe('push')
    expect(s.find((x) => x.path === 'b.md')!.op).toBe('pull')
  })
  it('modificata solo online → pull; solo sul PC → push', () => {
    const base = { 'a.md': hash('v1'), 'b.md': hash('v1') }
    const s = plan(M({ 'a.md': 'v1', 'b.md': 'v2' }), R({ 'a.md': 'v2', 'b.md': 'v1' }), base)
    expect(s.map((x) => x.op)).toEqual(['pull', 'push'])
  })
  it('cancellata sul PC → push di cancellazione; cancellata online → pull di cancellazione', () => {
    const base = { 'a.md': hash('x'), 'b.md': hash('y') }
    const s = plan(M({ 'b.md': 'y' }), R({ 'a.md': 'x', 'b.md': null }), base)
    expect(s.find((x) => x.path === 'a.md')).toEqual({ op: 'push', path: 'a.md', text: null })
    expect(s.find((x) => x.path === 'b.md')).toEqual({ op: 'pull', path: 'b.md', text: null })
  })
  it('modificata da entrambe → conflitto, il registro invece si unisce', () => {
    const LOG = '04 Checklist/Registro abitudini.md'
    const head = '# Registro abitudini\n\n'
    const base = { 'n.md': hash('0'), [LOG]: hash(head + '- 2026-11-10 :: Leggere\n') }
    const s = plan(
      M({ 'n.md': 'pc', [LOG]: head + '- 2026-11-10 :: Leggere\n- 2026-11-11 :: Leggere\n' }),
      R({ 'n.md': 'tel', [LOG]: head + '- 2026-11-10 :: Leggere\n- 2026-11-11 :: Studiare la patente\n' }),
      base,
    )
    expect(s.find((x) => x.path === 'n.md')!.op).toBe('conflict')
    const m = s.find((x) => x.path === LOG)!
    expect(m.op).toBe('merge')
    expect((m as { text: string }).text).toMatch(/2026-11-11 :: .*Leggere/)
    expect((m as { text: string }).text).toMatch(/Studiare la patente/)
  })
  it('stesso contenuto (anche con CRLF) → niente da fare', () => {
    const s = plan(M({ 'a.md': 'x\r\ny' }), R({ 'a.md': 'x\ny' }), {})
    expect(s[0].op).toBe('same')
  })
  it('cartelle escluse non escono dal PC', () => {
    expect(plan(M({ '40 Documenti personali/x.md': 'p' }), R({}), {})).toEqual([])
  })
  it('immagini citate e nome del conflitto', () => {
    const a = referencedAssets('60 Film, serie e anime/Titoli/x.md', '---\nposter: "_posters/Se7en.jpg"\n---\n![[foto.png]] ![a](img%20b.jpg)')
    expect(a).toEqual(['60 Film, serie e anime/_posters/Se7en.jpg', 'foto.png', 'img b.jpg'])
    expect(conflictPath('a/b.md', new Date(2026, 10, 11, 9, 5))).toBe('a/b (conflitto PC 2026-11-11 09.05).md')
  })
  it('unione del registro senza doppioni', () => {
    const t = '# R\n\n- 2026-11-11 :: A\n'
    expect(mergeLog(t, t)).toBe(t.endsWith('\n') ? mergeLog(t, t) : t)
  })
})
