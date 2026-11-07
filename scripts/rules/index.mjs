// Runs every product rule. `--update-baseline` rewrites baseline.json from the current tree.
import { writeFileSync } from 'node:fs'
import { loadBaseline, BASELINE_PATH } from './lib.mjs'
import * as commits from './commits.mjs'
import * as money from './money.mjs'
import * as region from './region.mjs'
import * as i18n from './i18n.mjs'
import * as duplicates from './duplicates.mjs'
import * as size from './size.mjs'
import * as layout from './layout.mjs'
import * as voice from './voice.mjs'
import * as bugs from './bugs.mjs'
import * as importtype from './importtype.mjs'

const rules = [commits, money, region, i18n, duplicates, size, layout, voice, bugs, importtype]
const update = process.argv.includes('--update-baseline')
const baseline = update ? {} : loadBaseline()

let failed = 0
const next = {}
for (const rule of rules) {
  const result = rule.run({ baseline })
  Object.assign(next, result.counts ?? {})
  for (const w of result.warnings ?? [])
    console.log(`${process.env.GITHUB_ACTIONS ? '::warning::' : 'warn '}${w}`)
  if (update) continue
  if (result.failures.length) {
    failed++
    console.error(`FAIL ${rule.id}\n${result.failures.join('\n')}\n`)
  } else {
    console.log(`ok   ${rule.id}${result.note ? ` (${result.note})` : ''}`)
  }
}

if (update) {
  const out = {}
  for (const k of Object.keys(next).sort()) if (Object.keys(next[k]).length) out[k] = next[k]
  writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + '\n')
  console.log(`baseline written: ${BASELINE_PATH}`)
} else if (failed) {
  console.error(`${failed} rule(s) failed.`)
  process.exit(1)
} else {
  console.log('all product rules pass')
}
