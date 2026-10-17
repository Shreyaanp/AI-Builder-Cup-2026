// Rule 3: no hard-coded Singapore region defaults.
import { tracked, read, isTestOrFixture, overBaseline, counts } from './lib.mjs'

export const id = 'region'
const RE = /\bSGD\b|Asia\/Singapore/

export function scan() {
  const found = {}
  const files = tracked('src/**/*.ts', 'src/**/*.tsx', 'backend/app/**/*.py', 'backend/*.py').filter(
    (f) => !isTestOrFixture(f),
  )
  for (const f of files) {
    const hits = []
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (RE.test(line)) hits.push(`${i + 1}: ${line.trim().slice(0, 100)}`)
      })
    if (hits.length) found[f] = hits
  }
  return found
}

export function run({ baseline }) {
  const found = scan()
  const over = overBaseline(id, found, baseline)
  return {
    counts: { [id]: counts(found) },
    failures: over.length
      ? [
          `rule region: hard-coded "SGD" / "Asia/Singapore". The app serves any region, so a Singapore default ` +
            `silently mislabels money and times elsewhere. How to fix: take currency and timezone from the shop ` +
            `or area profile; Singapore values belong only in tests and fixtures.`,
          ...over.flatMap((o) => [`  ${o.file} (baseline ${o.allowed}, now ${o.hits.length})`, ...o.hits.map((h) => `    ${h}`)]),
        ]
      : [],
  }
}
