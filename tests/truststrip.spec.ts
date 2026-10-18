import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { localOnly } from './stories/support.js'

test.use({ reducedMotion: 'reduce' })

for (const width of [360, 390, 412]) {
  for (const appearance of ['light', 'dark']) {
    for (const language of ['en', 'hi']) {
      test(`trust strip ${width} ${appearance} ${language}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'phone', 'Phone trust-strip spec')
        await localOnly(page)
        await page.setViewportSize({ width, height: 844 })
        await page.addInitScript(
          ({ appearance, language }) => {
            localStorage.setItem(
              'niva.starter.preferences',
              JSON.stringify({ appearance, language }),
            )
          },
          { appearance, language },
        )
        let enabled = true
        let support = 'https://wa.me/919876543210'
        await page.route('**/api/v1/bootstrap', async (route) => {
          const response = await route.fetch()
          await route.fulfill({
            response,
            json: {
              ...(await response.json()),
              trust_strip: { enabled, support_whatsapp: support },
            },
          })
        })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        const strip = page.getByTestId('trust-strip')
        await expect(strip.getByRole('button')).toHaveCount(4)
        await expect(strip.getByRole('button').first()).toHaveText(
          language === 'hi' ? 'शुरुआत मुफ़्त' : 'Free to start',
        )
        for (let index = 0; index < 4; index++) {
          const chip = strip.getByRole('button').nth(index)
          const bounds = await chip.boundingBox()
          expect(bounds?.height).toBeGreaterThanOrEqual(48)
          await chip.focus()
          await page.keyboard.press('Enter')
          const sheet = page.getByRole('dialog')
          await expect(sheet).toBeVisible()
          if (index === 2)
            await expect(sheet).toContainText(language === 'hi' ? 'एन्क्रिप्टेड' : 'encrypted')
          if (index === 3) await expect(sheet.getByRole('link')).toHaveAttribute('href', support)
          await page.keyboard.press('Escape')
          await expect(sheet).toBeHidden()
          await expect(chip).toBeFocused()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        expect(
          (await new AxeBuilder({ page }).include('[data-testid="trust-strip"]').analyze())
            .violations,
        ).toEqual([])
        await page.screenshot({
          path: `output/playwright/truststrip-${width}-${appearance}-${language}.png`,
          animations: 'disabled',
        })
        await page
          .getByRole('button', {
            name: language === 'hi' ? 'स्थानीय प्रीव्यू जारी रखें' : 'Continue local preview',
          })
          .click()
        await expect(
          page.getByRole('heading', {
            name: language === 'hi' ? 'शुरू करने से पहले' : 'Before we start',
          }),
        ).toBeVisible()
        await expect(strip).toBeVisible()
        await expect(strip.getByRole('button')).toHaveCount(4)
        support = ''
        await page.reload()
        await expect(strip.getByRole('button')).toHaveCount(3)
        enabled = false
        await page.reload()
        await expect(
          page.getByRole('button', {
            name: language === 'hi' ? 'स्थानीय प्रीव्यू जारी रखें' : 'Continue local preview',
          }),
        ).toBeVisible()
        await expect(strip).toHaveCount(0)
      })
    }
  }
}
