import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { LOCALES } from '../src/i18n/locales.js'
import { comparisonKind } from '../src/features/closeday/compare.js'
import { countClosed, countShown, type Workspace } from '../src/features/v1/today/habitCount.js'
import { promiseCopyFor, type PromiseCopy } from '../src/features/v1/today/promiseCopy.js'
import { leadOrder, leadSplit } from '../src/features/v1/today/leadOrder.js'

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

// HABIT slice 2 ----------------------------------------------------------------------------

test('every shipped language has every promise line, with no English left in it', () => {
  const english = promiseCopyFor('en')
  const keys = Object.keys(english) as (keyof PromiseCopy)[]
  const sample = (copy: PromiseCopy, key: keyof PromiseCopy) => {
    const value = copy[key]
    return typeof value === 'function' ? (value as (x: string) => string)('§') : value
  }
  for (const locale of LOCALES) {
    const copy = promiseCopyFor(locale)
    expect(Object.keys(copy).sort(), locale).toEqual([...keys].sort())
    for (const key of keys) {
      const line = sample(copy, key)
      expect(line.trim(), `${locale}.${key}`).not.toBe('')
      if (typeof copy[key] === 'function') expect(line, `${locale}.${key}`).toContain('§')
      if (locale !== 'en') expect(line, `${locale}.${key}`).not.toBe(sample(english, key))
    }
  }
})

const rows = (...kinds: string[]) => kinds.map((kind, i) => ({ id: `${kind}-${i}`, kind }))
const order = (...kinds: string[]) => leadOrder(rows(...kinds)).map((need) => need.kind)

test('the morning: last night’s promise leads; closing the day keeps row 1 in the close window', () => {
  expect(order('reply', 'menu', 'promise')).toEqual(['promise', 'reply', 'menu'])
  expect(order('reply', 'promise', 'closeDay')).toEqual(['closeDay', 'promise', 'reply'])
  // Three at most: the first is the one lead action.
  expect(order('reply', 'menu', 'low', 'low', 'step')).toEqual(['reply', 'menu', 'low'])
  expect(order()).toEqual([])
})

test('one stock surface: the supply row with its run-out day always keeps a place in three', () => {
  expect(order('reply', 'closeDay', 'menu', 'supply', 'low')).toEqual([
    'closeDay',
    'reply',
    'supply',
  ])
  expect(order('supply', 'reply', 'menu')).toEqual(['supply', 'reply', 'menu'])
  expect(order('promise', 'reply', 'closeDay', 'menu', 'supply')).toEqual([
    'closeDay',
    'promise',
    'supply',
  ])
})

test('"N more things": every row past the three is kept for the same card, none dropped', () => {
  const needs = rows('reply', 'closeDay', 'menu', 'supply', 'low', 'low', 'soldOut', 'step')
  const { lead, more } = leadSplit(needs)
  expect(lead.map((need) => need.kind)).toEqual(['closeDay', 'reply', 'supply'])
  expect(more.map((need) => need.kind)).toEqual(['menu', 'low', 'low', 'soldOut', 'step'])
  // Nothing lost, nothing said twice.
  expect([...lead, ...more].map((need) => need.id).sort()).toEqual(needs.map((n) => n.id).sort())
  expect(leadSplit(rows('reply', 'menu')).more).toEqual([])
})
