import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { enter, image, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { measure } from './ux/measure.js'
import { mkdirSync, writeFileSync } from 'node:fs'

test.use({ reducedMotion: 'reduce' })

test('OB-156 conversation and photo recovery keep three type sizes and grid spacing', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await page.addInitScript(() => {
    // OB-195: the app starts light; this owner picked System, so the phone's setting below
    // switches the page between light and dark.
    localStorage.setItem(
      'chalkboard.owner.preferences',
      JSON.stringify({ appearance: 'system', appearanceChosen: true }),
    )
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }
  })
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
  // OB-156: grid-aligned controls must still leave room on a short phone with mic recovery.
  await page.setViewportSize({ width: 360, height: 640 })
  await expect(page.getByTestId('voice-alert')).toBeVisible()
  await expect
    .poll(
      async () =>
        (await page.getByRole('region', { name: 'Conversation', exact: true }).boundingBox())
          ?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(48)
  await page.getByRole('button', { name: 'Type instead', exact: true }).click()
  await page.setViewportSize({ width: 360, height: 800 })
  await page
    .getByLabel('Message', { exact: true })
    .fill('name: Gupta Sweets; category: Sweets; location: Lajpat Nagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-so-far')).toContainText('Gupta Sweets')
  await page.route('**/api/v1/photos?*', (route) =>
    route.fulfill({
      json: {
        status: 'nothing_to_propose',
        photo_kind: 'menu',
        proposal: null,
        extraction: { uncertain: [], products: [] },
      },
    }),
  )
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const card = page.getByTestId('camera-card')
  await card.locator('input[type=file]').setInputFiles(await image(page))
  await expect(card.getByTestId('photo-read-error')).toBeVisible()
  mkdirSync('test-results/ob-156', { recursive: true })
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [412, 915],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height })
    for (const appearance of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: appearance })
      await expect(page.locator('html')).toHaveCSS('color-scheme', appearance)
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await card.scrollIntoViewIfNeeded()
      await expect(card.getByTestId('photo-read-error')).toBeVisible()
      const m = await page.evaluate(measure, width < 600)
      const key = `${test.info().project.name}-${width}-${appearance}`
      writeFileSync(`test-results/ob-156/${key}.json`, JSON.stringify(m, null, 2))
      await page.screenshot({ path: `test-results/ob-156/${key}.png` })
      expect.soft(m.fontSizes.length, key + JSON.stringify(m)).toBeLessThanOrEqual(3)
      expect.soft(m.spacingOff, key + JSON.stringify(m)).toBe(0)
      expect.soft(m.overflow, key).toEqual([])
      expect.soft(m.targets, key).toEqual([])
      expect.soft(m.overlap, key).toEqual([])
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect.soft(axe.violations, key).toEqual([])
    }
  }
  await expect(card.getByRole('button', { name: 'Open camera' })).toBeEnabled()
  await expect(card.getByRole('button', { name: 'Upload instead' })).toBeEnabled()
  await card.getByRole('button', { name: 'Skip for now' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByLabel('Message', { exact: true })).toBeEnabled()
})
