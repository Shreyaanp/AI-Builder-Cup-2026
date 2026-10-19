// Summarises (and with --write records) a UX_RECORD=1 run of tests/ux (OB-63).
//   UX_RECORD=1 npm run test:ux ; node scripts/ux-record.mjs [--write]
// Counts (off-grid spacing, font sizes) become tests/ux/baseline.json. Every other finding that is
// not already in tests/ux/allowlist.json is listed; --write adds them as "OB-?" for you to number.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const dir = 'test-results/ux'
const rows = readdirSync(dir).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
const allowPath = 'tests/ux/allowlist.json'
const allow = JSON.parse(readFileSync(allowPath, 'utf8'))

const baseline = {}
for (const r of rows.sort((a, b) => a.key.localeCompare(b.key)))
  baseline[r.key] = { spacingOff: r.spacingOff, fonts: r.fonts }

const ids = new Map()
for (const r of rows)
  for (const f of r.found)
    if (!['spacing', 'fonts'].includes(f.rule)) {
      const e = ids.get(f.id) ?? { n: 0, sample: f.detail, sizes: new Set() }
      e.n += 1
      e.sizes.add(r.key.split('|').slice(1).join(' '))
      ids.set(f.id, e)
    }
for (const [id, e] of [...ids].sort())
  console.log(`${allow[id] ? 'known ' : 'NEW   '} ${id}  ×${e.n}  e.g. ${e.sample}`)

if (process.argv.includes('--write')) {
  for (const id of ids.keys()) allow[id] ??= 'OB-?'
  const sorted = Object.fromEntries(Object.entries(allow).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(allowPath, JSON.stringify(sorted, null, 1) + '\n')
  writeFileSync('tests/ux/baseline.json', JSON.stringify(baseline, null, 1) + '\n')
  console.log('Wrote tests/ux/allowlist.json and tests/ux/baseline.json')
}
