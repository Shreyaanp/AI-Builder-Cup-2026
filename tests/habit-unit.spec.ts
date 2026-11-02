import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { comparisonKind } from '../src/features/closeday/compare.js'
import { countClosed, countShown, type Workspace } from '../src/features/v1/today/habitCount.js'

const REWARD_KEYS = [
  'doneTotal',
  'moreThan',
  'lessThan',
  'sameAs',
  'lastWeekday',
  'forecastSold',
] as const

/** The locale blocks of a translations file: `  ja: {` up to the next block. */
function blocks(file: string): Record<string, string> {
  const text = readFileSync(new URL(`../src/features/closeday/${file}`, import.meta.url), 'utf8')
  const out: Record<string, string> = {}
  const heads = [...text.matchAll(/^ {2}'?([A-Za-z-]+)'?: \{\r?$/gm)]
  heads.forEach((head, i) => {
    out[head[1]] = text.slice(head.index, heads[i + 1]?.index ?? text.length)
  })
  return out
}

test('every locale with a translated close screen has all the reward lines, no English fallback', () => {
  const translated = { ...blocks('translations.ts'), ...blocks('apacTranslations.ts') }
  expect(Object.keys(translated).length).toBeGreaterThanOrEqual(13)
  for (const [locale, block] of Object.entries(translated)) {
    expect(LOCALES as readonly string[]).toContain(locale)
    for (const key of REWARD_KEYS)
      expect(
        block.match(new RegExp(`^ {4}${key}: ?\\r?\\n? *'(.+)',`, 'm'))?.[1],
        `${locale}.${key}`,
      ).toBeTruthy()
    // Placeholders stay intact in every language.
    const line = (key: string) =>
      block.match(new RegExp(`^ {4}${key}: ?\\r?\\n? *'(.+)',`, 'm'))![1]
    expect(line('doneTotal')).toContain('{sales}')
    for (const key of ['moreThan', 'lessThan'])
      expect(line(key), `${locale}.${key}`).toMatch(/(?=.*\{amount\})(?=.*\{when\})/)
    expect(line('sameAs')).toContain('{when}')
    expect(line('lastWeekday')).toContain('{weekday}')
    expect(line('forecastSold')).toMatch(/(?=.*\{forecast\})(?=.*\{item\})(?=.*\{sold\})/)
  }
})

test('a difference under half a unit reads "Same as", not "₹0 more"', () => {
  expect(comparisonKind(0)).toBe('same')
  expect(comparisonKind(0.49)).toBe('same')
  expect(comparisonKind(-0.49)).toBe('same')
  expect(comparisonKind(0.5)).toBe('more')
  expect(comparisonKind(-240)).toBe('less')
})

test('opened is counted once per local day, and again after the day turns over', () => {
  const sent: string[] = []
  const ws: Workspace = {
    active: { id: 'shop1', fields: {} },
    demo: false,
    me: { consent_current: true },
    api: (_path, init) => {
      for (const e of JSON.parse(init.body).events as { event: string }[]) sent.push(e.event)
      return Promise.resolve()
    },
  }
  const RealDate = Date
  let now = new RealDate('2026-11-02T20:00:00').getTime()
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      super(...((args.length ? args : [now]) as [number]))
    }
    static now() {
      return now
    }
  } as DateConstructor
  try {
    countShown(ws, ['closeDay'])
    countShown(ws, ['closeDay'])
    countClosed(ws)
    now += 10 * 3600e3 // the PWA stayed open overnight
    countShown(ws, ['closeDay'])
    countClosed(ws)
  } finally {
    globalThis.Date = RealDate
  }
  expect(sent.filter((e) => e === 'opened')).toHaveLength(2)
})
