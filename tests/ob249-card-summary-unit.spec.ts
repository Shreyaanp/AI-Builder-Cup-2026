import { expect, test } from '@playwright/test'
import { cardSummary, summaryText, type SummaryInput } from '../src/features/v1/cardSummary.js'

// OB-249 (#636): an earlier chat card folds to one line, icon · what · status. One rule for every
// card type; a card that still needs the owner says so (and keeps its action on the line).
const line = (input: SummaryInput, locale = 'en') => summaryText(cardSummary(input, locale))
const needs = (input: SummaryInput) => cardSummary(input, 'en').needsYou

const order = (status: string, extra: object = {}) =>
  ({
    kind: 'order',
    order: {
      status,
      pending: null,
      lines: [{ name: 'Tea dust', quantity: 10, unit: 'kg' }],
      ...extra,
    },
  }) as unknown as SummaryInput

const po = (status: string, extra: object = {}) =>
  ({
    kind: 'po',
    order: {
      status,
      blocked: false,
      lines: [{ item: 'Milk', quantity: 25, unit: 'l' }],
      ...extra,
    },
  }) as unknown as SummaryInput

test('OB-249: an order line says what and whether it needs the owner', () => {
  expect(line(order('draft'))).toBe('Order · Tea dust 10 kg · Needs your OK')
  expect(needs(order('draft'))).toBe(true)
  expect(line(order('sent'))).toBe('Order · Tea dust 10 kg · Sent')
  expect(needs(order('sent'))).toBe(false)
  expect(line(order('confirmed'))).toBe('Order · Tea dust 10 kg · Confirmed')
  // A prepared message or cancellation still waits for the owner's Send.
  const pending = order('sent', { pending: { kind: 'cancel', text: 'Cancel', created: 0 } })
  expect(line(pending)).toBe('Order · Tea dust 10 kg · Needs your OK')
  expect(needs(pending)).toBe(true)
  expect(line(order('replaced'))).toBe('Order · Tea dust 10 kg · Discarded')
  expect(line(order('replaced', { replaced_by: 'o2' }))).toBe(
    'Order · Tea dust 10 kg · Replaced by a new order',
  )
  const two = order('draft', {
    lines: [
      { name: 'Flour', quantity: 20, unit: 'kg' },
      { name: 'Sugar', quantity: 5, unit: 'kg' },
    ],
  })
  expect(line(two)).toBe('Order · Flour 20 kg +1 more · Needs your OK')
})

test('OB-249: a purchase order line, draft, blocked, sent and changed', () => {
  expect(line(po('draft'))).toBe('Order · Milk 25 l · Needs your OK')
  expect(needs(po('draft'))).toBe(true)
  expect(line(po('draft', { blocked: true }))).toBe('Order · Milk 25 l · Needs a fix')
  expect(line(po('sent'))).toBe('Order · Milk 25 l · Sent')
  expect(needs(po('sent'))).toBe(false)
  expect(line(po('changed'))).toBe('Order · Milk 25 l · Changes to check')
  expect(needs(po('changed'))).toBe(true)
  expect(line(po('closed'))).toBe('Order · Milk 25 l · Done')
  // The supply chat card's order (inbound/outbound) needs the owner when its chip says so.
  expect(needs(po('sent', { chip: 'needs_you' }))).toBe(true)
})

test('OB-249: suppliers, charts, payment, rules and reply lines', () => {
  const suppliers = {
    kind: 'suppliers',
    result: { item: 'milk', suppliers: [{}, {}, {}] },
  } as unknown as SummaryInput
  expect(line(suppliers)).toBe('Suppliers for milk · 3 found')
  expect(needs(suppliers)).toBe(false)

  const forecast = {
    kind: 'chart',
    chart: { type: 'forecast', items: [{ item: 'Milk' }, { item: 'Onions' }] },
  } as unknown as SummaryInput
  expect(line(forecast)).toBe('Forecast · Milk, Onions · Next 7 days')
  const week = (change: number | null) =>
    ({
      kind: 'chart',
      chart: { type: 'insights', currency: 'INR', revenue: 2490, change_percent: change },
    }) as unknown as SummaryInput
  expect(line(week(12))).toMatch(/^This week · ₹2,490 · Up 12%$/)
  expect(line(week(-5))).toMatch(/^This week · ₹2,490 · Down 5%$/)
  expect(line(week(null))).toMatch(/^This week · ₹2,490$/)

  const payment = {
    kind: 'payment',
    payment: { amount: '250', note: '', payee: 'Chai', upi_id: 'a@b', url: '' },
  } as unknown as SummaryInput
  expect(line(payment)).toBe('Payment link · ₹250 · Ready to share')

  const rules = (pending: object | null) =>
    ({ kind: 'rules', row: { supplier: { name: 'Sri Lakshmi' }, pending } }) as SummaryInput
  expect(line(rules({ rules: {} }))).toBe('Supplier rules · Sri Lakshmi · Needs your OK')
  expect(needs(rules({ rules: {} }))).toBe(true)
  expect(line(rules(null))).toBe('Supplier rules · Sri Lakshmi · Saved')

  const reply = (sent: boolean) =>
    ({ kind: 'reply', action: { label: 'Reply to Priya' }, sent }) as unknown as SummaryInput
  expect(line(reply(false))).toBe('Reply · Reply to Priya · Ready to send')
  expect(needs(reply(false))).toBe(true)
  expect(line(reply(true))).toBe('Reply · Reply to Priya · Sent')
})

test('OB-249: Hindi lines; other languages fall back to English, never a {placeholder}', () => {
  expect(line(order('draft'), 'hi')).toBe('ऑर्डर · Tea dust 10 kg · मंज़ूरी चाहिए')
  expect(
    line({ kind: 'suppliers', result: { item: 'दूध', suppliers: [{}, {}] } } as never, 'hi'),
  ).toBe('दूध के सप्लायर · 2 मिले')
  for (const locale of ['ta', 'zh-Hans', 'en-SG', 'ms'])
    for (const input of [order('draft'), po('sent')]) {
      const text = line(input, locale)
      expect(text).toMatch(/^Order · /)
      expect(text).not.toMatch(/[{}]|undefined|NaN/)
    }
})
