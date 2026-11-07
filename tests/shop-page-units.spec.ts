import { expect, test } from '@playwright/test'
import { repeatsCondition } from '../src/features/passport/games/perks.js'
import { midSentence } from '../src/features/rewards/midSentence.js'

test('a thank-you with a colon still shows a condition it does not state', () => {
  expect(repeatsCondition('Free chai: every Monday', 'When you become a Regular')).toBe(false)
  expect(repeatsCondition('Third visit: half-price cutting chai', 'On your third visit')).toBe(
    false,
  )
})

test('a thank-you that already says its condition hides the repeat', () => {
  expect(repeatsCondition('Your third visit: a free refill', 'On your third visit')).toBe(true)
})

test('only an English leading article is lower-cased mid-sentence', () => {
  expect(midSentence('A free chai')).toBe('a free chai')
  expect(midSentence('An iced kopi')).toBe('an iced kopi')
  expect(midSentence('Your tenth kopi is free')).toBe('Your tenth kopi is free')
  expect(midSentence('UPI cashback')).toBe('UPI cashback')
  expect(midSentence('Anything free')).toBe('Anything free')
})
