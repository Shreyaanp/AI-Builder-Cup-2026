// Heatmap regression gate (OB-63). Reads the numbers tests/heatmap/customer-heatmap.spec.ts wrote
// for this run (label HEATMAP_LABEL, default "ci") and compares them with
// tests/heatmap/baseline.json: marks, competing accents, targets under 48 px and contrast issues
// may only go down. Sharded runs check the screens they ran.
//   node scripts/heatmap-gate.mjs            check
//   node scripts/heatmap-gate.mjs --update   write the current numbers as the new baseline
//                                            (merges, so it also works shard by shard)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const label = process.env.HEATMAP_LABEL ?? 'ci'
const dir = 'docs/qa/heatmap/data'
const baselinePath = 'tests/heatmap/baseline.json'
// Marks move a little with fonts and timing; the others are exact counts.
const MARK_SLACK = 0.05
const FIELDS = ['marks', 'accentFamilies', 'smallTargets', 'contrastIssues']

const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(`${label}-`)) : []
if (!files.length) {
  console.error(`No heatmap numbers for label "${label}" in ${dir}: did the heatmap spec run?`)
  process.exit(1)
}
const current = {}
for (const file of files) {
  const d = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
  current[`${d.screen}-${d.project}-${d.theme}`] = Object.fromEntries(FIELDS.map((f) => [f, d[f]]))
}
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {}

if (process.argv.includes('--update')) {
  const merged = Object.fromEntries(
    Object.entries({ ...baseline, ...current }).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(baselinePath, JSON.stringify(merged, null, 1) + '\n')
  console.log(`Baseline updated: ${Object.keys(current).length} screens.`)
  process.exit(0)
}

const problems = []
for (const [key, now] of Object.entries(current)) {
  const base = baseline[key]
  if (!base) {
    problems.push(`${key}: no baseline (new screen? run: node scripts/heatmap-gate.mjs --update)`)
    continue
  }
  for (const field of FIELDS) {
    const limit = field === 'marks' ? Math.ceil(base.marks * (1 + MARK_SLACK)) : base[field]
    if (now[field] > limit)
      problems.push(`${key}: ${field} ${now[field]} is above the baseline ${base[field]}`)
  }
}
if (problems.length) {
  console.error(`Heatmap regressions (${problems.length}):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`Heatmap: ${Object.keys(current).length} screens, none worse than the baseline.`)
