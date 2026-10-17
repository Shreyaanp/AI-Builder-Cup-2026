// Shared helpers for the product rules. Each rule script exports `run(ctx)` and returns findings.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const BASELINE_PATH = resolve(ROOT, 'scripts/rules/baseline.json')

export function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

export function tracked(...globs) {
  return git('ls-files', '-z', '--', ...globs)
    .split('\0')
    .filter((f) => f && existsSync(resolve(ROOT, f)))
}

export function read(file) {
  return readFileSync(resolve(ROOT, file), 'utf8')
}

export function loadBaseline() {
  return existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {}
}

/** Files that are tests, fixtures or generated output, never product code. */
export const isTestOrFixture = (f) =>
  /(^|\/)(tests?|fixtures?|__tests__|qa)\//.test(f) ||
  /\.(spec|test)\.[tj]sx?$/.test(f) ||
  /(^|\/)test_[^/]*\.py$/.test(f) ||
  /\.generated\./.test(f) ||
  f.endsWith('generated.d.ts')

/**
 * Compare per-file violation counts with the baseline. A file fails only when it has more
 * violations than the baseline allows, so existing debt is tolerated and new debt is not.
 * `found` maps file -> array of "line: text" strings.
 */
export function overBaseline(rule, found, baseline) {
  const allowed = baseline[rule] ?? {}
  const out = []
  for (const [file, hits] of Object.entries(found)) {
    const ok = allowed[file] ?? 0
    if (hits.length > ok) out.push({ file, allowed: ok, hits })
  }
  return out
}

export function counts(found) {
  return Object.fromEntries(
    Object.entries(found)
      .filter(([, h]) => h.length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, h]) => [f, h.length]),
  )
}

/** Resolve the commit to diff against: BASE_REF, else the merge-base with origin/main. */
export function baseCommit() {
  const env = process.env.RULES_BASE
  if (env && !/^0+$/.test(env)) return env
  try {
    const head = git('rev-parse', 'HEAD').trim()
    const base = git('merge-base', 'HEAD', 'origin/main').trim()
    return base === head ? null : base
  } catch {
    return null
  }
}

export function lineOf(text, index) {
  let n = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++
  return n
}
