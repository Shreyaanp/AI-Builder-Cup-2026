import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// "What Chalkboard knows about your shop": the offline playbook for a Mumbai tea stall, read,
// edited and trimmed by the owner. Offline fixture text, never live Gemini quality.

async function seedTeaStall(page: Page) {
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      revision: 0,
      business: {
        name: 'Shree Chai Corner',
        category: 'Tea stall',
        location: 'Andheri East, Mumbai',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        busy_hours: '7-10 am',
        profile: {
          kind: 'food',
          subtype: 'Tea stall',
          food: { segment: 'beverage', halal_relevant: true },
        },
        understanding: { focus: 'less_waste', regulars: 'Auto drivers at dawn' },
      },
      products: [
        { name: 'Cutting chai', price: 1500, unit: 'cup' },
        { name: 'Masala chai', price: 2000, unit: 'cup' },
        { name: 'Bun maska', price: 3000, unit: 'piece' },
      ],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  const approved = await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(approved.ok()).toBe(true)
}

async function openPlaybook(page: Page) {
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.getByTestId('playbook-open').click()
  const sheet = page.getByRole('dialog', { name: 'What Chalkboard knows about your shop' })
  await expect(sheet.getByTestId('playbook-key_metrics')).toBeVisible({ timeout: 20_000 })
  return sheet
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations).toEqual([])
}

async function shot(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `docs/stories/playbook-${name}.png`, animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

for (const scheme of ['light', 'dark'] as const) {
  test(`playbook reads like this shop, honest and editable (${scheme})`, async ({ page }, info) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ colorScheme: scheme })
    await page.addInitScript((appearance) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
    }, scheme)
    await localOnly(page)
    await enter(page)
    await seedTeaStall(page)
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await expect(page.getByRole('button', { name: 'Choose shop: Shree Chai Corner' })).toBeVisible()
    if (scheme === 'light') {
      // Grow order: the tea stall's playbook suggests the prep plan before closing the day.
      if (info.project.name === 'phone')
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('button', { name: 'My shop' })
          .click()
      const tiles = page.getByTestId('shop-tiles')
      await expect
        .poll(() =>
          tiles.evaluate((grid) => {
            const prep = grid.querySelector('[data-tour="prep"]')
            const close = Array.from(grid.children).find((tile) =>
              tile.textContent?.includes('Close the day'),
            )
            return Boolean(
              prep &&
              close &&
              prep.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING,
            )
          }),
        )
        .toBe(true)
    }
    const sheet = await openPlaybook(page)
    await expect(sheet.getByText(/^Built from what you told Chalkboard/)).toBeVisible()
    await expect(sheet.getByText(/without AI/)).toBeVisible()
    // Numbers that fit a tea stall, honestly marked when Today has no number for them yet.
    const metrics = sheet.getByTestId('playbook-key_metrics')
    await expect(metrics.getByText('Items sold')).toBeVisible()
    await expect(metrics.getByText('Busy hours')).toBeVisible()
    await expect(metrics.getByText('Not tracked yet').first()).toBeVisible()
    await expect(sheet.getByText('Waste less stock')).toBeVisible()
    await expect(sheet.getByText('Regulars: Auto drivers at dawn')).toBeVisible()
    await expect(sheet.getByText('Rush hours: 7-10 am')).toBeVisible()
    // Never a halal or vegetarian topic for a tea stall.
    await expect(sheet).not.toContainText(/halal|vegetarian/i)
    const device = info.project.name
    await shot(page, `${device}-${scheme}`)
    await axe(page)
    if (scheme === 'dark') return

    // Edit a goal in the owner's own words.
    await sheet.getByRole('button', { name: 'Edit: Waste less stock' }).click()
    const field = sheet.getByLabel('Change it')
    await field.fill('No sour milk at closing')
    await shot(page, `${device}-editing`)
    await sheet.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(sheet.getByText('No sour milk at closing')).toBeVisible()
    await expect(sheet.getByText('Your words')).toBeVisible()
    // Remove a customer group; it stays gone after a fresh playbook.
    const segment = sheet.getByTestId('playbook-segments').getByRole('listitem').last()
    const removed = (await segment.locator('p').first().textContent()) ?? ''
    await segment.getByRole('button', { name: /^Remove:/ }).click()
    await expect(sheet.getByText('Removed. It will not come back.')).toBeVisible()
    await expect(sheet.getByTestId('playbook-segments')).not.toContainText(removed)
    await sheet.getByRole('button', { name: 'Make a fresh one' }).click()
    await expect(sheet.getByText('Updated. Your changes were kept.')).toBeVisible()
    await expect(sheet.getByText('No sour milk at closing')).toBeVisible()
    await expect(sheet.getByTestId('playbook-segments')).not.toContainText(removed)
    // A word chip removes the word.
    await sheet.getByRole('button', { name: 'Remove the word Bun maska' }).click()
    await expect(sheet.getByRole('button', { name: 'Remove the word Bun maska' })).toHaveCount(0)
    await axe(page)
  })
}
