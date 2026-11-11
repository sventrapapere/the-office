// Crea dev/vault.json dalle note copiate dal PC (solo per sviluppo, non va nel pacchetto).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
const ROOT = process.argv[2] || '/mnt/user-data/uploads/Obsidian/GONDISHAPUR'
const out = {}
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p)
  if (s.isDirectory()) { if (!['_dashboard', '.obsidian'].includes(f)) walk(p) } else if (f.endsWith('.md')) out[relative(ROOT, p)] = { t: readFileSync(p, 'utf8'), m: Math.round(s.mtimeMs) } } }
walk(ROOT)
writeFileSync('dev/vault.json', JSON.stringify(out))
console.log(Object.keys(out).length, 'note')
