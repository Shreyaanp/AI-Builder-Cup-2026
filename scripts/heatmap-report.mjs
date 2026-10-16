// Summarise the customer heatmap audit (tests/heatmap) as before/after tables.
// Usage: node scripts/heatmap-report.mjs  → prints Markdown for docs/qa/customer-heatmap.md.
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'docs/qa/heatmap/data'
const rows = readdirSync(dir).map((file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')))
const key = (r) => `${r.screen}|${r.project}|${r.theme}`
const by = new Map()
for (const r of rows) by.set(`${r.label}|${key(r)}`, r)
const screens = [...new Set(rows.map((r) => r.screen))]
const cell = (b, a, field) => {
  const before = b?.[field]
  const after = a?.[field]
  if (before === undefined) return after === undefined ? '–' : `new · ${after}`
  if (after === undefined) return `${before} → –`
  return before === after ? String(after) : `${before} → ${after}`
}
const fields = [
  ['marks', 'Marks'],
  ['words', 'Words'],
  ['accentFamilies', 'Accents'],
  ['filledActions', 'Filled actions'],
  ['typeSizes', 'Type sizes'],
  ['offGrid', 'Off-grid spacing'],
  ['smallTargets', 'Targets < 48'],
  ['contrastIssues', 'Contrast'],
]
for (const project of ['phone', 'desktop'])
  for (const theme of ['light', 'dark']) {
    console.log(`\n### ${project} · ${theme}\n`)
    console.log(`| Screen | ${fields.map(([, l]) => l).join(' | ')} |`)
    console.log(`| --- | ${fields.map(() => '---').join(' | ')} |`)
    for (const screen of screens) {
      const b = by.get(`before|${screen}|${project}|${theme}`)
      const a = by.get(`after|${screen}|${project}|${theme}`)
      console.log(`| ${screen} | ${fields.map(([f]) => cell(b, a, f)).join(' | ')} |`)
    }
  }
const after = rows.filter(
  (r) => r.label === 'after' && r.project === 'phone' && r.theme === 'light',
)
console.log('\n### Remaining small targets (phone, light, after)\n')
for (const r of after)
  if (r.smallNames.length) console.log(`- **${r.screen}**: ${r.smallNames.join('; ')}`)
console.log('\n### Off-grid spacing values (phone, light, after)\n')
for (const r of after)
  if (r.offValues.length) console.log(`- **${r.screen}**: ${r.offValues.join(', ')}`)
