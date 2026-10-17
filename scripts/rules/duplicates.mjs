// Rule 5: one implementation each of sheets, the Maps loader and voice capture.
import { tracked, read, isTestOrFixture, overBaseline, counts } from './lib.mjs'

export const id = 'duplicates'

const CHECKS = [
  {
    key: 'duplicates-sheet',
    allowed: (f) => f === 'src/features/v1/Sheet.tsx',
    re: /import[^;]*\b(SwipeableDrawer|Drawer)\b|<(SwipeableDrawer|Drawer)\b/,
    why: 'a second bottom-sheet/drawer drifts from the shared one (safe areas, back button, swipe, focus)',
    fix: 'open content with the Sheet in src/features/v1/Sheet.tsx',
  },
  {
    key: 'duplicates-maps',
    allowed: (f) => f.endsWith('/mapsSdk.ts'),
    re: /maps\.googleapis\.com\/maps\/api\/js/,
    why: 'two Maps script loaders race and double-load the SDK and the key',
    fix: 'import the loader from mapsSdk.ts, the one place that adds the script tag',
  },
  {
    key: 'duplicates-voice',
    allowed: (f) => f === 'src/features/v1/useVoice.ts',
    re: /\bnew\s+(MediaRecorder|SpeechRecognition|webkitSpeechRecognition)\b|\.(?:webkit)?SpeechRecognition\s*(?:\?\?|\|\|)/,
    why: 'ad-hoc recording/recognition skips the shared language pin, permission and cleanup handling',
    fix: 'use the shared voice hooks in src/features/v1/useVoice.ts',
  },
]

export function run({ baseline }) {
  const files = tracked('src/**/*.ts', 'src/**/*.tsx').filter((f) => !isTestOrFixture(f))
  const text = new Map(files.map((f) => [f, read(f)]))
  const failures = []
  const all = {}
  for (const c of CHECKS) {
    const found = {}
    for (const f of files) {
      if (c.allowed(f)) continue
      const hits = []
      text
        .get(f)
        .split('\n')
        .forEach((line, i) => {
          if (c.re.test(line)) hits.push(`${i + 1}: ${line.trim().slice(0, 100)}`)
        })
      if (hits.length) found[f] = hits
    }
    all[c.key] = counts(found)
    const over = overBaseline(c.key, found, baseline)
    if (over.length)
      failures.push(
        `rule duplicates: ${c.why}. How to fix: ${c.fix}.`,
        ...over.flatMap((o) => [
          `  ${o.file} (baseline ${o.allowed}, now ${o.hits.length})`,
          ...o.hits.map((h) => `    ${h}`),
        ]),
      )
  }
  return { counts: all, failures }
}
