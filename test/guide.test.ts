import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseGuides, findGuide, dryingSeconds, stepImages } from '../src/lib/guide'

const T = readFileSync(new URL('../src/lib/__fixtures__/ricettario.md', import.meta.url), 'utf8')

describe('guide del ricettario', () => {
  const gs = parseGuides(T)
  it('trova solo le guide vere, anche annidate', () => {
    expect(gs.map((g) => g.title)).toEqual(['Moria Goblin', 'Cave Troll'])
  })
  it('testa, mix, prima di cominciare', () => {
    const g = gs[0]
    expect(g.sub).toBe('Paint Pad (schema scelto)')
    expect(g.aspetto).toMatch(/verde scura/)
    expect(g.mixes).toHaveLength(2)
    expect(g.mixes[0]).toMatchObject({ name: 'Verde base', where: 'pelle' })
    expect(g.prima).toHaveLength(2)
  })
  it('passaggi con le sei voci, rimandi e facoltativi', () => {
    const g = gs[0]
    expect(g.steps.map((s) => s.n)).toEqual([1, 2, 16, 18, 19])
    expect(g.steps[0]).toMatchObject({ title: 'Nero di zona', zone: 'armature, elmi', phase: 'Fase 1 — Basi' })
    expect(g.steps[0].fields).toMatchObject({ colore: 'Abaddon Black puro', diluizione: 'base (2:1)', asciugatura: '15 minuti' })
    expect(g.steps[3].goto).toBe('Basette "caverna di Moria"')
    expect(g.steps[4].zone).toBe('quando la comprerai')
    expect(g.phases[1].note).toMatch(/Poco colore/)
  })
  it('due passaggi sulla stessa riga e mix a quattro colonne', () => {
    const c = gs[1]
    expect(c.level).toBe(3)
    expect(c.steps.map((s) => s.n)).toEqual([1, 6, 7])
    expect(c.steps[1].goto).toBe('Basette "brughiera"')
    expect(c.mixes[0]).toMatchObject({ name: 'Pelle base', source: 'German Grey', where: 'pelle' })
  })
  it('immagini di riferimento', () => {
    const r = gs[0].refs
    expect(r.finished).toHaveLength(1)
    expect(r.finished[0]).toMatchObject({ view: 'davanti', source: { label: 'Games Workshop, guida classica (archivio)' } })
    expect(r.finished[0].note).toMatch(/scultura diversa/)
    expect(r.missing).toEqual(['lato', 'dietro'])
    expect(r.steps).toHaveLength(8)
    expect(stepImages(gs[0], 15).length).toBe(2)
    expect(stepImages(gs[0], 4)[0].caption).toMatch(/Pelle verde/)
    expect(r.intro).toMatch(/guardata prima di inserirla/)
  })
  it('schema dalla tabella dei lotti', () => {
    expect(findGuide(gs, 'Moria Goblin — Paint Pad')?.title).toBe('Moria Goblin')
    expect(findGuide(gs, 'Cave Troll')?.title).toBe('Cave Troll')
    expect(findGuide(gs, '')).toBeUndefined()
  })
  it('tempi di asciugatura', () => {
    expect(dryingSeconds('15 minuti')).toBe(900)
    expect(dryingSeconds('1 ora, meglio una notte')).toBe(3600)
    expect(dryingSeconds('almeno 1 ora')).toBe(3600)
    expect(dryingSeconds('24 ore prima di maneggiarla')).toBe(86400)
    expect(dryingSeconds('—')).toBeNull()
  })
})
