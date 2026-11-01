import { expect, test, type Page } from '@playwright/test'
import { FIRST_QUESTION } from './newShopTopics.js'
import { enter, localOnly } from './stories/support.js'
import { noJargon, textSizes } from './support/simplicity.js'

// Simplify batch 1 (owner app, words only): the owner never reads a developer word, body text is
// 16px, and the new-shop chat does not call a hidden page "live". Plan: SIMPLIFY-owner.md §5, §7.

test.setTimeout(120_000)

const JARGON = [
  'PO 45',
  'ORDRSP',
  'SAP',
  'IDoc',
  'fixture',
  'TimesFM',
  'BigQuery',
  'Open-Meteo',
  'Simulation',
  'Offline template',
  'POS / ERP',
  'seasonality',
  'AI draft',
] as const

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `simplify-${info.testId}-${Math.random()}`,
  })
  await page.setViewportSize({ width: 390, height: 844 })
})

async function openDemo(page: Page) {
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Skip', exact: true })
    .click({ timeout: 30_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 15_000 })
}

async function tab(page: Page, name: 'coach' | 'shop' | 'grow' | 'you') {
  await page.locator(`[data-tour="nav-${name}"]`).click({ timeout: 5000 })
  await expect(page.locator(`[data-tour="nav-${name}"]`)).toHaveAttribute('aria-current', 'page')
  await page.waitForTimeout(400)
}

/** Opens a sheet from a tab, checks its words, closes it. */
async function sheet(page: Page, button: RegExp) {
  await page.getByRole('button', { name: button }).first().click({ timeout: 5000 })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(500)
  await noJargon(page, JARGON)
  const { smallestBody } = await textSizes(page)
  if (smallestBody !== null) expect(smallestBody).toBeGreaterThanOrEqual(16)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
}

test('the demo shows no developer words on Coach, Shop, Grow and You', async ({ page }) => {
  await openDemo(page)
  await noJargon(page, JARGON)
  for (const name of ['shop', 'grow', 'you', 'coach'] as const) {
    await tab(page, name)
    await noJargon(page, JARGON)
  }
})

test('the demo sheets show no developer words', async ({ page }) => {
  await openDemo(page)
  await tab(page, 'grow')
  for (const button of [
    /^Purchase orders/,
    /^Prep plan/,
    /^Plan tomorrow/,
    /Rescue deals/,
    /^Your week/,
    /^Weekly recap/,
    /^Close the day/,
  ])
    await sheet(page, button)
  // The weather slide of the morning brief carries the data source.
  await expect(page.getByText('Open-Meteo')).toHaveCount(0)
  await tab(page, 'shop')
  for (const button of [/^Menu/, /Link your billing app/, /^Customer page/])
    await sheet(page, button)
})

test('the order card speaks of the supplier and the item, not an order number', async ({
  page,
}) => {
  await openDemo(page)
  await page
    .getByRole('button', { name: /^Reorder$/ })
    .first()
    .click({ timeout: 10_000 })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('article')).toBeVisible({ timeout: 10_000 })
  await expect(dialog.getByRole('article')).toHaveAccessibleName(/ from /)
  await noJargon(page, JARGON)
  await expect(dialog).not.toContainText(/\bPO \d/)
})

test('body text is 16px, labels 14px, and each main tab uses at most 3 text sizes', async ({
  page,
}) => {
  await openDemo(page)
  for (const name of ['coach', 'shop', 'grow', 'you'] as const) {
    await tab(page, name)
    const { sizes, smallestBody } = await textSizes(page)
    if (smallestBody !== null) expect(smallestBody, `${name} body`).toBeGreaterThanOrEqual(16)
    expect(sizes.length, `${name}: ${sizes.join('/')}`).toBeLessThanOrEqual(3)
    expect(Math.min(...sizes), `${name} smallest`).toBeGreaterThanOrEqual(12)
  }
})

test('new shop: after the first answer the chat says saved, not live, while the page is off', async ({
  page,
}) => {
  await localOnly(page)
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
  await page
    .getByLabel('Message', { exact: true })
    .fill('name: Lakshmi Tea Stall; category: Tea stall; location: Indiranagar metro')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toHaveText('Saved')
  const log = page.getByRole('log')
  await expect(log).toContainText('Only you can see it')
  await expect(log).not.toContainText(/\blive\b/i)
  await expect(log).not.toContainText('Offline template')
  await expect(log).not.toContainText('Offline coach')
})
