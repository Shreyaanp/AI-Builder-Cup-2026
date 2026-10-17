// Rule 8: every backend module that calls Gemini pins the selected reply language.
import { tracked, read, isTestOrFixture, overBaseline } from './lib.mjs'

export const id = 'voice'
const CALLS_MODEL = /generate_content|LlmAgent\(|\bgenai\.Client\b|\bAgent\(/
const PINS = /language_rule\(|reply_language\(|ReplyLanguage|find_language\(/

export function run({ baseline }) {
  const found = {}
  for (const f of tracked('backend/app/*.py')) {
    if (isTestOrFixture(f)) continue
    const text = read(f)
    if (CALLS_MODEL.test(text) && !PINS.test(text))
      found[f] = ['0: calls a model without pinning the reply language']
  }
  const over = overBaseline(id, found, baseline)
  return {
    counts: { [id]: Object.fromEntries(Object.keys(found).sort().map((f) => [f, 1])) },
    failures: over.length
      ? [
          'rule voice: a prompt module calls Gemini without stating the selected language. The model then answers in ' +
            'whatever language the input looks like, not the one the person chose. How to fix: add ' +
            'language_rule(reply_language(tag)) from app/reply_language.py to the prompt.',
          ...over.map((o) => `  ${o.file}`),
        ]
      : [],
  }
}
