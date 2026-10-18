import { createShop } from './stories/support.js'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// B37 proof: the guided Get on Google flow with a real gallery upload, at phone size.
const STOREFRONT = Buffer.from(
  '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',
  'base64',
)

test.skip(({ isMobile }) => !isMobile, '390×844 phone proof')

async function shop(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).tap()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).tap()
  await createShop(page, 'name: Katong Kopi; category: Kopi shop; location: Katong, Singapore')
  await page.getByRole('button', { name: 'Grow', exact: true }).tap()
  await page.getByRole('button', { name: /^Get on Google/ }).tap()
}

test('B37: details, real photo upload, profile preview and the honest Google step', async ({
  page,
}) => {
  await shop(page)
  const flow = page.getByRole('region', { name: 'Google' })
  await expect(flow.getByRole('heading', { name: 'Check your details' })).toBeVisible()
  await page.waitForTimeout(700) // let the entrance motion settle for the screenshot
  await page.screenshot({ path: 'docs/bugs/B37-details.png' })
  await flow.getByRole('button', { name: 'Next' }).tap()
  await expect(flow.getByRole('heading', { name: 'Add photos' })).toBeVisible()
  await flow
    .locator('input[type=file]:not([capture])')
    .setInputFiles({ name: 'storefront.jpg', mimeType: 'image/jpeg', buffer: STOREFRONT })
  await expect(flow.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
  await expect(flow.getByText('1 of 12 photos')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/bugs/B37-photos.png' })
  await flow.getByRole('button', { name: 'Next' }).tap()
  await expect(flow.getByRole('heading', { name: 'Katong Kopi' })).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/bugs/B37-preview.png' })
  await flow.getByRole('button', { name: 'Next' }).tap()
  await expect(flow.getByText('Waiting for Google API access')).toBeVisible()
  await expect(flow.getByText('Photos added')).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'docs/bugs/B37-google.png', fullPage: true })
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(result.violations).toEqual([])
  // The photo can be removed again.
  await page.getByRole('button', { name: 'Step 2 of 4: Photos' }).tap()
  await flow.getByRole('button', { name: 'Remove photo 1' }).tap()
  await expect(flow.getByText('0 of 12 photos')).toBeVisible()
})
