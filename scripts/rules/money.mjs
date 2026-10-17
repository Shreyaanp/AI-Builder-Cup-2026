// Rule 2: money is formatted in one place, src/features/v1/format.ts.
import { tracked, read, lineOf, isTestOrFixture, overBaseline, counts } from './lib.mjs'

export const id = 'money'
const ALLOWED = 'src/features/v1/format.ts'

/** Source text of every `Intl.NumberFormat(...)` call, found by matching parentheses. */
function* numberFormatCalls(text) {
  const re = /Intl\.NumberFormat\s*\(/g
  let m
  while ((m = re.exec(text))) {
    let depth = 1
    let i = re.lastIndex
    while (i < text.length && depth) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    yield { index: m.index, source: text.slice(m.index, i) }
  }
}

const CONCAT = [
  /[`'"](?:₹|S\$|US\$|INR |SGD )\s*[`'"]\s*\+/, // '₹' + price
  /\+\s*[`'"](?:₹|S\$|US\$)\s*[`'"]/, // price + '₹'
  /`(?:₹|S\$|US\$|INR |SGD )\$\{/, // `₹${price}`
  /\$\{[^}]*\}\s*(?:₹|INR)\b/, // `${price}₹`
  /[`'"]\$[`'"]\s*\+/, // '$' + price
  /`\$\$\{/, // `$${price}`
]

export function scan() {
  const found = {}
  const files = tracked('src/**/*.ts', 'src/**/*.tsx', 'src/*.ts', 'src/*.tsx').filter(
    (f) => f !== ALLOWED && !isTestOrFixture(f),
  )
  for (const f of files) {
    const text = read(f)
    const hits = []
    for (const c of numberFormatCalls(text)) {
      if (/currency/.test(c.source)) hits.push(`${lineOf(text, c.index)}: Intl.NumberFormat with currency`)
    }
    text.split('\n').forEach((line, i) => {
      if (CONCAT.some((re) => re.test(line))) hits.push(`${i + 1}: ${line.trim().slice(0, 100)}`)
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
          `rule money: price formatting outside ${ALLOWED}. Shops sell in their own currency, so a hard-coded ` +
            `symbol or Intl currency format shows the wrong money. How to fix: call the money helper in ${ALLOWED}.`,
          ...over.flatMap((o) => [`  ${o.file} (baseline ${o.allowed}, now ${o.hits.length})`, ...o.hits.map((h) => `    ${h}`)]),
        ]
      : [],
  }
}
