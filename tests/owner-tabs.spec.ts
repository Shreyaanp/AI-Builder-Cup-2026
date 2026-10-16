import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop, share } from './stories/support.js'

// Owner tabs (16 Oct): Coach, Shop (customer page first), Grow (every owner tool as a card) and
// You (settings, verify, privacy). Evidence: docs/stories/tabs-*.png, phone and desktop, both themes.

async function axe(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
}

async function capture(page: Page, name: string, isMobile: boolean, scheme: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.screenshot({
    path: `docs/stories/tabs-${name}-${scheme}${isMobile ? '' : '-desktop'}.png`,
    animations: 'disabled',
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `${name}: no horizontal overflow`,
  ).toBe(true)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`Shop, Grow and You tabs in ${scheme}`, async ({ page, isMobile }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await localOnly(page)
    await enter(page)
    await seedShop(page)
    await share(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // The app keeps its own Look setting (You → Look), separate from the system scheme.
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await page
      .getByRole('button', { name: scheme === 'dark' ? 'Dark' : 'Light', exact: true })
      .click()

    // Shop leads with the customer page and one primary "Share page"; the tools moved to Grow.
    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    const yourPage = page.getByRole('region', { name: 'This is your page' })
    await expect(yourPage.getByRole('button', { name: 'Share page' })).toBeInViewport()
    await expect(page.getByRole('button', { name: /^Menu/ })).toBeVisible()
    await expect(page.locator('[data-tour="closeday"]')).toHaveCount(0)
    await expect(page.locator('[data-tour="prep"]')).toHaveCount(0)
    await axe(page)
    await capture(page, 'shop', isMobile, scheme)

    // Grow: each tool a card with its live status; Get on Google opens the guided flow.
    await page.getByRole('button', { name: 'Grow', exact: true }).click()
    for (const card of [
      /^Prep plan/,
      /^Close the day/,
      /^Orders/,
      /^Plan tomorrow/,
      /^Rescue deals/,
      /^Get on Google/,
      /^Stamps & perks/,
      // Release 2: payment links and rides, purchase orders.
      /^Payments & rides/,
      /^Purchase orders/,
    ])
      await expect(page.getByRole('button', { name: card })).toBeVisible()
    // Connecting a POS lives on Shop, not Grow.
    await expect(page.getByRole('button', { name: /POS/ })).toHaveCount(0)
    await axe(page)
    await capture(page, 'grow', isMobile, scheme)
    await page.getByRole('button', { name: /^Get on Google/ }).click()
    await expect(page.getByRole('heading', { name: 'Get on Google', level: 1 })).toBeVisible()
    await expect(page.locator('[data-tour="nav-grow"]')).toHaveAttribute('aria-current', 'page')
    // Back (the phone's, or the link) returns to Grow, not out of the app.
    await page.goBack()
    await expect(page.getByRole('button', { name: /^Rescue deals/ })).toBeVisible()
    await page.getByRole('button', { name: /^Get on Google/ }).click()
    await page.getByRole('button', { name: 'Back to Grow' }).click()
    await expect(page.getByRole('button', { name: /^Rescue deals/ })).toBeVisible()

    // You: profile, Verify it's you, settings, shops, privacy (a sub-page), help.
    await page.getByRole('button', { name: 'You', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Verify it’s you' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Read replies aloud' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Take the tour' })).toBeVisible()
    await axe(page)
    await capture(page, 'you', isMobile, scheme)
    await page.getByRole('button', { name: /^Privacy & your data/ }).click()
    await expect(page.getByRole('heading', { name: 'Privacy & data' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete all my data' })).toBeVisible()
    await axe(page)
    await capture(page, 'privacy', isMobile, scheme)
    await page.goBack()
    await expect(page.getByRole('region', { name: 'Verify it’s you' })).toBeVisible()

    // The Coach tab is unchanged and keeps its place.
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await expect(page.locator('#coach')).toBeVisible()
  })
}

test('services shops see Services, not Menu', async ({ page }) => {
  await localOnly(page)
  await enter(page)
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name: 'Lakshmi Tailors',
          category: 'Tailor',
          location: 'Jayanagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          phone: '',
        },
        products: [{ name: 'Blouse stitching', price: 450, unit: 'piece', stock: null }],
      },
    })
  ).json()
  await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Services/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Menu/ })).toHaveCount(0)
})
