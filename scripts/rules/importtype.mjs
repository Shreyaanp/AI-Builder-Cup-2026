// Rule: no inline `import('x').Type` annotations (OB-164, #504). graphify's parser cannot
// read them; use a top-level `import type` instead.
import { tracked, read } from './lib.mjs'

export const id = 'import-type'
// Any `import('x').Name` (annotation, `type A = ...`, union, generic) and `typeof import('x')`.
// Promise methods on a real dynamic import (`import('x').then(...)`) are allowed.
export const RE =
  /\bimport\(\s*['"][^'"]+['"]\s*\)\s*\.\s*(?!then\b|catch\b|finally\b)[A-Za-z_$]|\btypeof\s+import\(/

export function run() {
  const failures = []
  for (const f of tracked('src/**/*.ts', 'src/**/*.tsx')) {
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (RE.test(line)) failures.push(`${f}:${i + 1}: use a top-level import type`)
      })
  }
  return { failures }
}
