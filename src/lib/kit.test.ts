import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { lots, setLot, punto, schemes, nextSteps, quadro, wishes, addWish, removeWish, questions, toggleQuestion, games, addGame } from './kit'

const f = (n: string) => readFileSync(new URL('./__fixtures__/' + n, import.meta.url), 'utf8')
const lav = f('lavorazione.md'), inv = f('inventario.md'), par = f('partite.md')

describe('kit MESBG', () => {
  it('legge lavorazione', () => {
    expect(punto(lav)).toMatch(/^Niente blocca/)
    const l = lots(lav)
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ lotto: 'GOB — Moria Goblin', pezzi: 12, schema: '', fasi: [12, 0, 0, 0, 0], passo: null })
    expect(schemes(lav)).toEqual([])
    const s = nextSteps(lav)
    expect(s[0].done).toBe(true)
    expect(s[1].done).toBe(false)
    expect(s.length).toBe(4)
  })
  it('aggiorna un lotto senza toccare il resto', () => {
    const l = lots(lav)[0]
    const out = setLot(lav, l.lotto, { ...l, fasi: [11, 1, 0, 0, 0], schema: 'Goblin di Moria — pelle verde', passo: 2, agg: '2026-11-14' })
    expect(lots(out)[0]).toMatchObject({ fasi: [11, 1, 0, 0, 0], schema: 'Goblin di Moria — pelle verde', passo: 2, agg: '2026-11-14' })
    expect(out.length - lav.length).toBeLessThan(60)
    expect(out.replace(/\| GOB[^\n]*/, '')).toBe(lav.replace(/\| GOB[^\n]*/, ''))
  })
  it('inventario: quadro, desideri, domande', () => {
    expect(quadro(inv).find((r) => r[0] === 'Pezzi')).toBeTruthy()
    const w = wishes(inv)
    expect(w[0].name).toBe('Eroe di Moria')
    const added = addWish(inv, 'Guerrieri nani — Vinted')
    expect(wishes(added).map((x) => x.name)).toEqual(['Eroe di Moria', 'Guerrieri nani'])
    expect(added.indexOf('## 6. Da chiarire')).toBeGreaterThan(added.indexOf('Guerrieri nani'))
    expect(wishes(removeWish(added, wishes(added)[1].line)).length).toBe(1)
    const q = questions(inv)
    const open = q.find((x) => !x.done)!
    const t = toggleQuestion(inv, open.line, '2026-11-13')
    expect(questions(t).find((x) => x.text.startsWith(open.text.slice(0, 20)))!.done).toBe(true)
  })
  it('partite', () => {
    expect(games(par)).toEqual([])
    const a = addGame(par, { date: '2026-11-10', scen: 'Domina il campo', vs: 'Luca (Mordor)', res: 'persa', note: '' })
    const b = addGame(a, { date: '2026-11-12', scen: 'Recupera', vs: 'Luca', res: 'vinta', note: 'arcieri ok' })
    expect(games(b).map((g) => g.date)).toEqual(['2026-11-12', '2026-11-10'])
    expect(b.startsWith('# Partite giocate')).toBe(true)
  })
})
import { addScheme } from './kit'
describe('schemi', () => {
  it('sostituisce il segnaposto e poi aggiorna', () => {
    const a = addScheme(lav, { cosa: 'GOB — Moria Goblin', schema: 'Goblin di Moria — pelle verde', fonte: 'ricettario-pittura.md', manca: 'da verificare' })
    expect(schemes(a)).toEqual([{ cosa: 'GOB — Moria Goblin', schema: 'Goblin di Moria — pelle verde', fonte: 'ricettario-pittura.md', manca: 'da verificare' }])
    const b = addScheme(a, { cosa: 'GOB — Moria Goblin', schema: 'Altro', fonte: 'x', manca: '' })
    expect(schemes(b).length).toBe(1)
    const c = addScheme(b, { cosa: 'Eroe', schema: 'S', fonte: 'f', manca: '' })
    expect(schemes(c).map((x) => x.cosa)).toEqual(['GOB — Moria Goblin', 'Eroe'])
  })
})
