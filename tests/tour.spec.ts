import { expect, test } from '@playwright/test'

// OB-30: the owner app hands the tour to the public sandbox without seeding a private shop.
test.skip(({ isMobile }) => !isMobile, '390×844 phone story')

test('OB-30: owner tour opens the public demo, then the order story, spotlights and start your own', async ({
  page,
}) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()
  await expect(page.getByText('See it working first')).toBeVisible()
  const privateWorkspacePosts: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/v1/demo/workspace' &&
      url.searchParams.get('public') !== 'true'
    )
      privateWorkspacePosts.push(url.href)
  })
  const demoNavigation = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      request.isNavigationRequest() &&
      url.pathname === '/demo' &&
      url.searchParams.get('tour') === '1'
    )
  })
  await page.getByRole('button', { name: 'Take the tour' }).tap()
  await demoNavigation
  const tour = page.locator('#tour-title').locator('..')
  await expect(tour).toContainText('Your shop at a glance', { timeout: 30_000 })
  // Captain review (#361): the welcome sheet closing as the tour opened left the app aria-hidden,
  // so screen readers lost the tour. It must stay a named dialog.
  await expect(page.getByRole('dialog', { name: 'Your shop at a glance' })).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'docs/stories/T-1-shop.png' })
  // OB-51: seven real steps, each lighting a real element (tests/tour-real-steps.spec.ts checks
  // the geometry; tests/tour-chain.spec.ts checks the seeded numbers on the first two).
  const titles = [
    /runs out/,
    'The AI drafts the order',
    'Tomorrow’s prep plan',
    'Your menu, by category',
    'Close the day in a minute',
    'Just talk or type',
  ]
  for (const [index, title] of titles.entries()) {
    await page.getByRole('button', { name: 'Next', exact: true }).tap()
    await expect(page.getByRole('dialog', { name: title })).toBeVisible()
    await expect(page.locator('[data-tour="feature"]')).toHaveCount(0)
    if (index === 3 || index === 4) {
      await page.waitForTimeout(700)
      await page.screenshot({ path: `docs/stories/T-${index + 2}-spotlight.png` })
    }
  }
  await tour.getByRole('button', { name: 'Next', exact: true }).tap()
  await expect(page.locator('#tour-title')).toContainText('You’re ready')
  await tour.getByRole('button', { name: 'Keep exploring' }).tap()
  await expect(page.locator('#tour-title')).toHaveCount(0)
  expect(privateWorkspacePosts).toEqual([])
})
