import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { lanes, toMermaid } from '../src/architecture/diagram.js'

test('architecture page shows every lane and fits the screen', async ({ page }) => {
  await page.goto('/architecture')
  await expect(page.getByRole('heading', { level: 1, name: 'How Chalkboard works' })).toBeVisible()
  for (const lane of lanes) await expect(page.getByTestId(`lane-${lane.id}`)).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'How the AI adapts to any business' }),
  ).toBeVisible()
  await expect(page.getByText('ADK agent business_coach', { exact: true }).first()).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
})

test('docs/architecture.md carries the same diagram as the page', () => {
  const doc = readFileSync('docs/architecture.md', 'utf8')
  expect(doc).toContain('```mermaid\n' + toMermaid() + '\n```')
})
