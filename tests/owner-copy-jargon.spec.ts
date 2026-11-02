import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { aiInfoCopy } from '../src/features/v1/aiInfoCopy.js'

// OB-245: the plain English of simplify batch 1 reaches every language. No owner-copy string, in any
// locale, may carry a developer word. Plan: SIMPLIFY-owner.md §5.

const JARGON =
  /\b(?:POS|ERP|API|XML|SAP|ADK|IDoc|TimesFM|BigQuery|fixture|parser|offline)\b|पार्सर|ऑफ़?लाइन|অফলাইন|ఆఫ్‌?లైన్|ಆಫ್‌?ಲೈನ್|ஆஃப்லைன்|离线|オフライン|오프라인|ออฟไลน์|luar talian|ngoại tuyến/i

const FILES = [
  'closeday/translations.ts',
  'closeday/apacTranslations.ts',
  'supply/copy.ts',
  'owner/locales.ts',
  'v1/aiInfoCopy.ts',
  'google/strings.ts',
  'sourcing/copy.ts',
  'connect/strings.ts',
  'supply/ioCopy.ts',
  'owner/copy.ts',
  'analytics/copy.ts',
  'planning/strings.ts',
  'v1/strings.ts',
  'v1/tabsCopy.ts',
]

/** The quoted strings of a source file, comments left out (keys and identifiers are not copy). */
function literals(file: string): string[] {
  const source = readFileSync(new URL(`../src/features/${file}`, import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const found: string[] = []
  for (const match of source.matchAll(
    /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g,
  )) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return found
}

test('no owner-copy string in any language says POS, SAP, TimesFM, IDoc, ADK, parser or offline', () => {
  const found: string[] = []
  let checked = 0
  for (const file of FILES) {
    for (const text of literals(file)) {
      checked += 1
      if (JARGON.test(text.replace(/\.(?:csv|xlsx|json|xml)\b/g, '')))
        found.push(`${file}: ${text}`)
    }
  }
  expect(checked).toBeGreaterThan(2000)
  expect(found).toEqual([])
})

test('the AI explainers of every language carry no developer word either', () => {
  for (const locale of LOCALES) {
    for (const [feature, text] of Object.entries(aiInfoCopy(locale))) {
      expect(text, `${locale} ${feature}`).not.toMatch(JARGON)
    }
  }
})
