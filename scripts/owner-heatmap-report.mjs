// Summarise the owner UX heatmap audit (tests/heatmap/owner-heatmap.spec.ts)
// as Markdown tables and aggregated findings for docs/qa/owner-heatmap.md.
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'docs/qa/heatmap/data'
const files = readdirSync(dir).filter((f) => f.startsWith('owner-') && f.endsWith('.json'))

const rows = files.map((file) => JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')))

const fields = [
  ['marks', 'Marks'],
  ['words', 'Words'],
  ['busiest', 'Busiest cell'],
  ['busyCells', 'Busy cells'],
  ['accentFamilies', 'Accents'],
  ['filledActions', 'Filled actions'],
  ['typeSizes', 'Type sizes'],
  ['offGrid', 'Off-grid spacing'],
  ['smallTargets', 'Targets < 48'],
  ['contrastIssues', 'Contrast'],
  ['horizontalOverflow', 'Overflow'],
]

const screens = [...new Set(rows.map((r) => r.screen))].sort()
const viewports = ['360', '390', '412']
const themes = ['light', 'dark']
const langs = ['en', 'hi']

console.log('# Owner Heatmap Audit Summary Data\n')

for (const vp of viewports) {
  for (const theme of themes) {
    for (const lang of langs) {
      const matchRows = rows.filter(
        (r) => r.viewport === vp && r.theme === theme && r.lang === lang,
      )
      if (matchRows.length === 0) continue

      console.log(`\n### Phone ${vp}px · ${theme} · ${lang === 'hi' ? 'Hindi' : 'English'}\n`)
      console.log(`| Screen | ${fields.map(([, l]) => l).join(' | ')} |`)
      console.log(`| --- | ${fields.map(() => '---').join(' | ')} |`)

      for (const screen of screens) {
        const r = matchRows.find((item) => item.screen === screen)
        if (!r) {
          console.log(`| ${screen} | ${fields.map(() => '–').join(' | ')} |`)
          continue
        }
        const vals = fields.map(([f]) => {
          const v = r[f]
          if (f === 'horizontalOverflow') return v ? '⚠️ YES' : '0'
          return v !== undefined ? String(v) : '–'
        })
        console.log(`| ${screen} | ${vals.join(' | ')} |`)
      }
    }
  }
}

console.log('\n## Aggregated Touch Target Findings (< 48px)\n')
const smallMap = new Map()
for (const r of rows) {
  if (r.smallNames && r.smallNames.length) {
    for (const name of r.smallNames) {
      const key = `${r.screen}: ${name}`
      smallMap.set(key, (smallMap.get(key) ?? 0) + 1)
    }
  }
}
for (const [item, count] of smallMap.entries()) {
  console.log(`- **${item}** (found in ${count} runs)`)
}

console.log('\n## Aggregated Off-Grid Spacing Findings\n')
const offMap = new Map()
for (const r of rows) {
  if (r.offValues && r.offValues.length) {
    for (const val of r.offValues) {
      const key = `${r.screen}: ${val}`
      offMap.set(key, (offMap.get(key) ?? 0) + 1)
    }
  }
}
for (const [item, count] of offMap.entries()) {
  console.log(`- **${item}** (seen in ${count} runs)`)
}

console.log('\n## Hindi Text Wrapping & Clipped Content Findings\n')
const clipMap = new Map()
for (const r of rows) {
  if (r.clippedNames && r.clippedNames.length) {
    for (const name of r.clippedNames) {
      const key = `${r.screen} (${r.lang}, ${r.viewport}px): ${name}`
      clipMap.set(key, true)
    }
  }
}
for (const item of clipMap.keys()) {
  console.log(`- **${item}**`)
}
