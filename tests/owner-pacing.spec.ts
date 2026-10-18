import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { enter, localOnly, seedShop, openNewShopReview } from './stories/support.js'

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const baseline = process.env.PACE_BASELINE === '1'

async function proof(page: Page, name: string, root: Locator = page.locator('main').first()) {
  await page.evaluate(() => document.fonts.ready)
  const lines = await root.evaluate((node) => {
    // Count rendered paragraph lines, including data. Hidden disclosures contribute zero.
    return Array.from(node.querySelectorAll('p')).reduce((total, p) => {
      const range = document.createRange()
      range.selectNodeContents(p)
      const tops = new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top)))
      return total + tops.size
    }, 0)
  })
  const path = `output/playwright/owner-pacing/${baseline ? 'before' : 'after'}-${name}`
  mkdirSync('output/playwright/owner-pacing', { recursive: true })
  writeFileSync(`${path}.json`, JSON.stringify({ name, paragraphLines: lines }))
  await page.screenshot({ path: `${path}.png`, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

test.beforeEach(async ({ page }) => { await localOnly(page) })

test('front door and separate legal consent pages', async ({ page }) => {
  await page.goto('/?app=business')
  await proof(page, 'front-door', page.locator('body'))
  await page.getByRole('button', { name: 'Continue local preview', exact: true }).click()
  await proof(page, 'consent')
  await page.getByLabel('I agree to the Terms').check()
  if (!baseline) await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  if (!baseline) {
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('I agree to the Terms')).toBeChecked()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByLabel('I have read the Privacy Notice')).toBeChecked()
  }
  await page.getByRole('button', { name: /Agree and continue|I agree/, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
})

test('onboarding review and congratulations keep the next action clear', async ({ page }) => {
  await enter(page)
  await openNewShopReview(page)
  await proof(page, 'review', page.getByTestId('draft-summary'))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Congratulations/ })).toBeVisible()
  await proof(page, 'congratulations')
  if (!baseline) await expect(page.getByRole('button', { name: 'Continue with my shop' })).toBeInViewport()
})

test('edit details preserves answers through Back and Next', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Shop details/ }).click()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await page.getByRole('textbox', { name: /^Shop name/ }).fill('Calm Chai')
  await proof(page, 'edit-details', page.locator('[data-testid="guided-details"]'))
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('textbox', { name: /^Shop name/ })).toHaveValue('Calm Chai')
})

test('Grow shows four tools, then the rest on demand', async ({ page }) => {
  // The shared config opens every tool; this walk starts from a first visit.
  await page.addInitScript(() => localStorage.removeItem('niva.grow.all'))
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await proof(page, 'grow')
  const tiles = page.getByTestId('grow-tiles').getByRole('button')
  if (!baseline) {
    await expect(tiles).toHaveCount(4)
    await page.getByRole('button', { name: 'Show more', exact: true }).click()
    expect(await tiles.count()).toBeGreaterThan(4)
    await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0)
  }
})

test('You opens settings, privacy and face details on demand', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await proof(page, 'you')
  if (!baseline) await page.locator('summary').filter({ hasText: /^Settings$/ }).click()
  await proof(page, 'settings')
  await page.getByRole('button', { name: /Privacy & your data/ }).click()
  await proof(page, 'privacy')
  if (!baseline) await page.locator('summary').filter({ hasText: /Verify it/ }).click()
  await page.getByRole('button', { name: 'Verify it’s you', exact: true }).click()
  await proof(page, 'face-intro', page.getByRole('dialog'))
})

test('Supply explains an order before showing its document', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Purchase orders/ }).click()
  await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
  await page.getByRole('region', { name: 'Supply chain' }).getByRole('button', { name: 'Reorder', exact: true }).click()
  const card = page.getByRole('article')
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await card.getByRole('button', { name: 'View as SAP (IDoc)', exact: true }).click()
  const sap = page.getByRole('dialog', { name: 'View as SAP (IDoc)' })
  await proof(page, 'supply-document', sap)
  if (!baseline) {
    await expect(sap.locator('pre')).toBeHidden()
    await sap.locator('summary').filter({ hasText: 'Show document' }).click()
  }
  await expect(sap.getByLabel('SAP IDoc')).toContainText('<IDOCTYP>ORDERS05</IDOCTYP>')
})
