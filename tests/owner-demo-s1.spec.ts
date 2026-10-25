import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// Owner demo walk-through, 24 Oct (O-1..O-4): import, coach, photos and location in /demo.
test.setTimeout(90_000)

test.beforeEach(async ({ context, page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await page.setViewportSize({ width: 390, height: 844 })
  // Separate visitors exercise the real allocation limit without sharing one test IP.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `owner-s1-${info.testId}` })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

/** Opens the owner demo and skips the welcome; returns the demo API calls that were refused. */
async function openDemo(page: Page) {
  const refused: string[] = []
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/v1/demo/sessions/') && response.status() === 403) refused.push(path)
  })
  await page.goto('/demo')
  await expect(page.getByText('Demo shop – nothing here is real', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return refused
}

async function openImport(page: Page) {
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="menu"]').click()
  await page.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
  return page.locator('#import-panel input[type="file"][accept*=".xlsx"]')
}

test('O-1 a demo menu file opens a labelled sample review, never a silent failure', async ({
  page,
}) => {
  const refused = await openDemo(page)
  const picker = await openImport(page)
  await picker.setInputFiles({
    name: 'sample-menu.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 sample menu'),
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Masala dosa', { timeout: 30_000 })
  await expect(review).toContainText('Filter coffee')
  await expect(review).toContainText('Sample read: the demo never reads your file.')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  // Saved into this visitor's sandbox menu.
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('[data-tour="menu"]').click()
  await expect(page.getByRole('dialog').getByText('Masala dosa').first()).toBeVisible()
  expect(refused).toEqual([])
})

test('O-1 a demo menu photo opens the same sample review', async ({ page }) => {
  const refused = await openDemo(page)
  const picker = await openImport(page)
  await picker.setInputFiles({
    name: 'sample-menu.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync('tests/stories/fixtures/bengaluru-board.jpg'),
  })
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Sample read', { timeout: 30_000 })
  await expect(review).toContainText('Medu vada')
  expect(refused).toEqual([])
})

test('O-1 a demo file over the limit says it is too large', async ({ page }) => {
  await openDemo(page)
  const picker = await openImport(page)
  await picker.setInputFiles({
    name: 'big-export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.alloc(5_000_001, 'a'),
  })
  await expect(page.getByTestId('import-failed')).toContainText(
    'That file is too large. Send a photo or PDF under 20 MB',
    { timeout: 30_000 },
  )
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
})

test('O-2 the demo coach prepares real cards and offers tappable examples', async ({ page }) => {
  await openDemo(page)
  const coach = page.getByRole('textbox', { name: 'Message', exact: true })
  const log = page.getByRole('log')
  await coach.fill('Change my closing time to 10pm')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('06:30–22:00', { timeout: 30_000 })
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0)
  await expect(log).toContainText('Closing time 21:00 → 22:00')

  // "Open until" is a closing time, never a 23:00 opening.
  await coach.fill('We are open until 11pm')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(review).toContainText('06:30–23:00', { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(review).toHaveCount(0)
  await expect(log).toContainText('Closing time 22:00 → 23:00')

  await coach.fill('can you add a new item called Cutting chai for 15')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(review).toContainText('Cutting chai', { timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(review).toHaveCount(0)
  await expect(log).toContainText('New item: Cutting chai, ₹15 per item')

  await coach.fill('how many visits this week?')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('page was opened', { timeout: 30_000 })

  await coach.fill('What is my business called?')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const example = page.getByRole('button', { name: 'What are my best sellers?', exact: true })
  await expect(example).toBeVisible({ timeout: 30_000 })
  await example.click()
  await expect(log).toContainText('best sellers: Masala chai', { timeout: 30_000 })
  await expect(log).not.toContainText('I can help with today’s sales')
})

test('O-3 the Shop tab Photos card opens the shop photos', async ({ page }) => {
  await openDemo(page)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.getByRole('button', { name: /^Photos/ }).click()
  const photos = page.getByRole('dialog', { name: 'Photos' })
  await expect(photos).toBeVisible()
  await expect(photos.locator('img').first()).toBeVisible({ timeout: 15_000 })
  await expect(photos.getByRole('button', { name: 'Add photo', exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/tab=google/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('O-4 a demo location is found under the pin and saves', async ({ page }) => {
  const refused = await openDemo(page)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.locator('[data-tour="customer"] button').first().click()
  const wizard = page.getByTestId('guided-details')
  await wizard.getByRole('button', { name: 'Location', exact: true }).click()
  await expect(wizard).toHaveAttribute('data-step', 'location')
  await expect(wizard.getByText('Near Indiranagar', { exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await wizard.getByRole('button', { name: 'This is my shop' }).click()
  await expect(wizard.getByRole('status')).toContainText('Location saved')
  await wizard.getByRole('button', { name: 'Review', exact: true }).first().click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(review).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(refused).toEqual([])
})
