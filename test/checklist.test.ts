import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { parseChecklist, serializeChecklist, parseLog, serializeLog, sec, streak, calStreaks, anyStreak } from '../src/lib/checklist'
import { parseFM, mdRender, toNote, setFM, toggleTaskLine } from '../src/lib/md'
const V = '/mnt/user-data/uploads/Obsidian/GONDISHAPUR/'
// Questi test girano solo dove c'è una copia del vault vero (non in CI)
describe.skipIf(!existsSync(V))('file reali', () => {
  it('checklist: round-trip identico', () => {
    const t = readFileSync(V + '04 Checklist/Checklist.md', 'utf8').replace(/\r\n/g, '\n')
    const doc = parseChecklist(t)
    expect(serializeChecklist(doc)).toBe(t.replace(/\s+$/, '') + '\n')
    expect(sec(doc, 'daily').items.length).toBe(4)
    expect(sec(doc, 'daily').items[0].note.length).toBe(2)
    expect(sec(doc, 'todo').items.find(i => i.title === 'chiama caldaista')?.doneAt).toBe('2026-11-03')
  })
  it('registro: round-trip e serie', () => {
    const t = readFileSync(V + '04 Checklist/Registro abitudini.md', 'utf8').replace(/\r\n/g, '\n')
    const log = parseLog(t)
    expect(serializeLog(log)).toBe(t.replace(/\s+$/, '') + '\n')
    const doc = parseChecklist(readFileSync(V + '04 Checklist/Checklist.md', 'utf8'))
    const it2 = sec(doc, 'daily').items[1]
    expect(streak(log, it2, new Date('2026-11-05T12:00:00'))).toBe(3)
    expect(anyStreak(log, new Date('2026-11-05T12:00:00'))).toBe(3)
    expect(calStreaks(log, sec(doc, 'daily').items, 'all', new Date('2026-11-05T12:00:00')).best).toBeGreaterThanOrEqual(0)
  })
  it('frontmatter film e render', () => {
    const t = readFileSync(V + '60 Film, serie e anime/Titoli/A Bronx Tale.md', 'utf8')
    const { fm } = parseFM(t)
    expect(fm.visto).toBe(false); expect(fm.anno).toBe('1993'); expect(fm.genere).toEqual(['coming-of-age', 'crime', 'drama'])
    const n = toNote('x/A Bronx Tale.md', t, 0)
    expect(mdRender(n.body, { notes: [n], from: n.path })).toContain('<h1')
    expect(parseFM(setFM(t, 'visto', true)).fm.visto).toBe(true)
    expect(parseFM(setFM(t, 'genere', 'x')).fm.genere).toBe('x')
    expect(toggleTaskLine('- [ ] a\n- [x] b', 0)).toBe('- [x] a\n- [x] b')
  })
})
