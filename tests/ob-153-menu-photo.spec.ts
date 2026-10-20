import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { enter, image, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { measure } from './ux/measure.js'
import { writeFileSync } from 'node:fs'

test.use({ reducedMotion: 'reduce' })

for (const outcome of ['empty', 'unavailable', 'refused'] as const) {
  test(`OB-153 ${outcome} photo keeps retry and skip available without losing the draft`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await localOnly(page)
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
    })
    await enter(page)
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
    await page.getByRole('button', { name: 'Let’s begin' }).click()
    await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
    await page.getByRole('button', { name: 'Type instead', exact: true }).click()
    await page
      .getByLabel('Message', { exact: true })
      .fill('name: Gupta Sweets; category: Sweets; location: Lajpat Nagar')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
    await page.route('**/api/v1/photos?*', (route) =>
      route.fulfill(
        outcome === 'empty'
          ? {
              json: {
                status: 'nothing_to_propose',
                photo_kind: 'menu',
                proposal: null,
                extraction: { uncertain: [], products: [] },
              },
            }
          : {
              status: outcome === 'refused' ? 422 : 503,
              json: {
                detail: outcome === 'refused' ? 'NOT_BUSINESS_PHOTO' : 'EXTRACTION_UNAVAILABLE',
              },
            },
      ),
    )
    const turns: string[] = []
    await page.getByRole('button', { name: 'Shop photo' }).click()
    page.on('request', (request) => {
      if (request.url().includes('/coach/stream')) turns.push(request.url())
    })
    const card = page.getByTestId('camera-card')
    await card.locator('input[type=file]').setInputFiles(await image(page))
    await expect(card.getByTestId('photo-read-error')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Open camera' })).toBeEnabled()
    await expect(card.getByRole('button', { name: 'Upload instead' })).toBeEnabled()
    await expect(card.getByRole('button', { name: 'Skip for now' })).toBeEnabled()
    await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
    await expect(page.getByTestId('shop-so-far')).not.toContainText('Photo added')
    expect(turns).toEqual([])
    if (outcome === 'empty') {
      for (const [width, height] of [
        [360, 800],
        [390, 844],
        [412, 915],
        [1280, 800],
      ]) {
        await page.setViewportSize({ width, height })
        for (const colorScheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme })
          await card.scrollIntoViewIfNeeded()
          await expect(card.getByTestId('photo-read-error')).toBeVisible()
          for (const button of await card.getByRole('button').all()) {
            const box = (await button.boundingBox())!
            expect(box.height).toBeGreaterThanOrEqual(48)
            expect(box.width).toBeGreaterThanOrEqual(48)
          }
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true)
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          expect(axe.violations).toEqual([])
          writeFileSync(
            `test-results/ob-153-${test.info().project.name}-${width}-${colorScheme}.json`,
            JSON.stringify(await page.evaluate(measure, width < 600), null, 2),
          )
          await page.screenshot({
            path: `test-results/ob-153-${test.info().project.name}-${width}-${colorScheme}.png`,
          })
        }
      }
    }
    // Retry the same file: the chooser resets and a successful read closes the card.
    await page.unroute('**/api/v1/photos?*')
    if (outcome === 'empty') {
      await card.locator('input[type=file]').setInputFiles(await image(page))
      await expect(card).toHaveCount(0)
      await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
    } else {
      await card.getByRole('button', { name: 'Skip for now' }).click()
      await expect(card).toHaveCount(0)
      await expect(page.getByLabel('Message', { exact: true })).toBeEnabled()
    }
  })
}
