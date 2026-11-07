import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Read as text: the owner copy modules import the React state layer, which the tests
// project does not compile. The brief fills these lines with no values, so none may keep a {hole}.
const source = readFileSync('src/features/owner/locales.ts', 'utf8')

test('every locale demo weather line has no placeholder', () => {
  const lines = source.split('\n').filter((line) => line.includes('weatherDemoCredit:'))
  expect(lines.length).toBe(14)
  for (const line of lines) expect(line).not.toContain('{')
})
