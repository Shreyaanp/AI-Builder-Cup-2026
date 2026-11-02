import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { aiInfoCopy } from '../src/features/v1/aiInfoCopy.js'

// OB-245: the plain English of simplify batch 1 reaches every language. No owner-copy string, in any
// locale, may carry a developer word. Plan: SIMPLIFY-owner.md §5.

const JARGON =
  /\b(?:POS|ERP|API|XML|SAP|ADK|IDoc|TimesFM|BigQuery|fixture|parser|offline|(?:connect )?your system)\b|पार्सर|ऑफ़?लाइन|অফলাইন|ఆఫ్‌?లైన్|ಆಫ್‌?ಲೈನ್|ஆஃப்லைன்|离线|オフライン|오프라인|ออฟไลน์|luar talian|ngoại tuyến|シミュレーション|模拟|模擬|시뮬레이션|luring|simulatw*|シミュレーター|시뮬레이터|সিমুলেটর|จำลอง|mô phỏng|seasonality|季節性|계절성|মৌসুম/i

const FILES = [
  'closeday/translations.ts',
  'closeday/apacTranslations.ts',
  'supply/copy.ts',
  'owner/locales.ts',
  'v1/aiInfoCopy.ts',
  'google/strings.ts',
  'sourcing/copy.ts',
  'connect/strings.ts',
  'connect/uiStrings.ts',
  'connect/photoCopy.ts',
  'supply/ioCopy.ts',
  'owner/copy.ts',
  'analytics/copy.ts',
  'planning/strings.ts',
  'v1/strings.ts',
  'v1/tabsCopy.ts',
  'v1/chartCopy.ts',
  'coach/photoCopy.ts',
  'coach/photoRouteCopy.ts',
  'discover/askStrings.ts',
  'discover/mapCopy.ts',
  'discover/searchCopy.ts',
  'discover/strings.ts',
  'first-run/copy.ts',
  'owner-tools/copy.ts',
  'owner-tools/regionCopy.ts',
  'rewards/cardCopy.ts',
  'rewards/strings.ts',
  'shop/strings.ts',
  'trust/copy.ts',
  'trust/demoBadgeCopy.ts',
  'v1/askPhrases.ts',
  'v1/inChatCopy.ts',
  'v1/newShopCopy.ts',
  'v1/onboardingCopy.ts',
  'v1/playbook/playbookCopy.ts',
  'v1/today/todayCopy.ts',
  'v1/twoPathsCopy.ts',
  'v1/growCopy.ts',
  'v1/voiceModeCopy.ts',

  'supply/showcaseCopy.ts',
  'inquiries/Messages.tsx',
  ...readdirSync(new URL('../src/features/v1/locales/', import.meta.url))
    .filter((name) => name.endsWith('.ts') && name !== 'index.ts' && name !== 'legal.ts')
    .map((name) => `v1/locales/${name}`),
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
    const text = match[1] ?? match[2] ?? match[3] ?? ''
    if (!text.startsWith('.')) found.push(text)
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
