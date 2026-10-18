import { expect, test } from '@playwright/test'
import { sentenceSummary } from '../src/features/discover/summary.js'

test('collapsed search summaries end at a full sentence', () => {
  expect(sentenceSummary('A complete sentence. A second one is also complete.', 25)).toBe(
    'A complete sentence.',
  )
  expect(sentenceSummary('ஒரு முழு வாக்கியம். அடுத்த வாக்கியம்.', 25)).toBe('ஒரு முழு வாக்கியம்.')
})

test('a long first sentence is shown in full instead of being cut mid-sentence', () => {
  const sentence = 'If you are looking for a very good cup of chai, visit Nawabi Chai House.'
  expect(sentenceSummary(sentence, 20)).toBe(sentence)
})
