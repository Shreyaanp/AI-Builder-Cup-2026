// Rule 6: new files stay under 800 lines; big existing files do not grow by more than 150 per PR.
import { git, baseCommit, tracked, read } from './lib.mjs'

export const id = 'size'
const MAX_NEW = 800
const MAX_GROWTH = 150
const SKIP =
  /(^|\/)(package-lock\.json|uv\.lock|openapi\.json|generated\.d\.ts|material-roles\.generated\.json)$|^graphify-out\/|^docs\/|\.(png|jpe?g|webp|svg|woff2?|lock)$/

const lines = (s) => (s.length ? s.split('\n').length : 0)

export function run() {
  const warnings = []
  const big = tracked('src/**', 'backend/app/**', 'scripts/**', 'tests/**')
    .filter((f) => !SKIP.test(f))
    .map((f) => [f, lines(read(f))])
    .filter(([, n]) => n > MAX_NEW)
    .sort((a, b) => b[1] - a[1])
  warnings.push(
    `size: ${big.length} existing files are over ${MAX_NEW} lines and may not grow by more than ${MAX_GROWTH} per PR`,
  )
  for (const [f, n] of big.slice(0, 10)) warnings.push(`  ${n} ${f}`)

  const base = baseCommit()
  if (!base) return { failures: [], warnings, note: 'no base commit, growth check skipped' }
  const failures = []
  const changed = git('diff', '--name-status', '--no-renames', `${base}..HEAD`)
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t'))
  for (const [status, f] of changed) {
    if (status === 'D' || SKIP.test(f)) continue
    const now = lines(read(f))
    if (status === 'A') {
      if (now > MAX_NEW) failures.push(`  ${f}: new file has ${now} lines (limit ${MAX_NEW})`)
      continue
    }
    let before = 0
    try {
      before = lines(git('show', `${base}:${f}`))
    } catch {
      continue
    }
    if (now > MAX_NEW && now - before > MAX_GROWTH)
      failures.push(`  ${f}: ${before} -> ${now} lines (+${now - before}, limit +${MAX_GROWTH})`)
  }
  return {
    warnings,
    failures: failures.length
      ? [
          `rule size: file too large. Big files hide bugs and make reviews shallow. How to fix: put new code in ` +
            `its own module (new files: max ${MAX_NEW} lines; files already over ${MAX_NEW}: max +${MAX_GROWTH} lines per PR).`,
          ...failures,
        ]
      : [],
  }
}
