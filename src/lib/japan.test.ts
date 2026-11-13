import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { items, toggleItem, addItem, moveItem, phrases, nextWindow, budgetTotal } from './japan'

const f = (n: string) => readFileSync(new URL('./__fixtures__/' + n, import.meta.url), 'utf8')

describe('giappone', () => {
  it('itinerario', () => {
    const t = f('itinerario.md')
    const v = items(t, /^Da valutare/i)
    expect(v[0].name).toBe('Fushimi Inari')
    expect(items(t, /^Da vedere/i)).toEqual([])
    const a = addItem(t, 'Da vedere', '**Arashiyama** — Kyoto · bambù al mattino presto')
    const dv = items(a, /^Da vedere/i)
    expect(dv[0]).toMatchObject({ name: 'Arashiyama', city: 'Kyoto', note: 'bambù al mattino presto' })
    expect(a).toContain('## Da skippare')
    const m = moveItem(a, v[0].line, 'Da vedere')
    expect(items(m, /^Da valutare/i)).toEqual([])
    expect(items(m, /^Da vedere/i).map((x) => x.name)).toEqual(['Arashiyama', 'Fushimi Inari'])
    const tg = toggleItem(m, items(m, /^Da vedere/i)[0].line)
    expect(items(tg, /^Da vedere/i)[0].done).toBe(true)
  })
  it('checklist e acquisti', () => {
    const v = f('viaggio.md')
    const c = items(v, /^Pronti a partire/i)
    expect(c.length).toBe(11)
    expect(items(toggleItem(v, c[0].line), /^Pronti/i)[0].done).toBe(true)
    const b = items(f('acquisti.md'), /^Da comprare/i)
    expect(b.map((x) => x.name)).toEqual(['Re-live t-shirt', 'Imabari towel'])
  })
  it('frasario', () => {
    const p = phrases(f('frasi.md'))
    expect(p.find((x) => x.it === 'Grazie')!.ja).toMatch(/Arigatou/)
    expect(p.find((x) => x.it.startsWith('Quanto costa'))!.ja).toMatch(/Ikura/)
    expect(p.length).toBeGreaterThan(10)
  })
  it('finestre e budget', () => {
    expect(nextWindow(new Date(2026, 10, 13))).toMatchObject({ label: 'febbraio–marzo', open: false })
    expect(nextWindow(new Date(2026, 10, 13)).days).toBe(80)
    expect(nextWindow(new Date(2026, 9, 5)).open).toBe(true)
    expect(nextWindow(new Date(2026, 10, 20)).label).toBe('febbraio–marzo')
    expect(budgetTotal({ notti: 10, volo: 1000, alloggio: 90, trasporti: 15, cibo: 35, extra: 150 })).toBe(1000 + 900 + 11 * 50 + 150)
  })
})
