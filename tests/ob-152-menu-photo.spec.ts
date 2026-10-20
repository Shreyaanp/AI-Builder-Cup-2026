import { expect, test } from '@playwright/test'
import { enter, image, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { AxeBuilder } from '@axe-core/playwright'
import { measure } from './ux/measure.js'

test.use({ reducedMotion: 'reduce' })

for (const [width, height] of [
  [360, 800],
  [390, 844],
  [412, 915],
  [1280, 800],
]) {
  for (const appearance of ['light', 'dark']) {
    test(`OB-152: photo follow-up clears the chat bar at ${width} (${appearance})`, async ({
      page,
    }, info) => {
      await localOnly(page)
      await page.setViewportSize({ width, height })
      await page.addInitScript((appearance) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException('Permission denied', 'NotAllowedError')
        }
      }, appearance)
      await page.route('**/api/v1/photos?*', (route) =>
        route.fulfill({
          json: {
            status: 'nothing_to_propose',
            photo_kind: 'menu',
            proposal: null,
            extraction: {
              uncertain: [],
              business: { name: '', category: '', location: '', hours: '', phone: '' },
              // OB-152 covers a readable photo; an empty menu stays open for OB-153 recovery.
              products: [{ name: 'Chai', price: 15, unit: 'cup', category: 'Drinks' }],
            },
          },
        }),
      )
      let turns = 0
      const question = 'Thanks for the photo. What is your business called?'
      await page.route('**/api/v1/coach/stream', (route) => {
        const text = turns++ === 0 ? 'Can you tell me about your shop?' : question
        return route.fulfill({
          contentType: 'text/event-stream',
          body: [{ kind: 'reply', text }, { kind: 'turn_complete' }]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(''),
        })
      })
      let releasePreview!: () => void
      const previewReady = new Promise<void>((resolve) => {
        releasePreview = resolve
      })
      await page.addInitScript(() => {
        const create = URL.createObjectURL.bind(URL)
        URL.createObjectURL = (blob) =>
          blob instanceof File ? '/ob-152-preview.png' : create(blob)
      })
      const preview = await image(page)
      await page.route('**/ob-152-preview.png', async (route) => {
        await previewReady
        await route.fulfill({ contentType: 'image/png', body: preview.buffer })
      })
      await enter(page)
      await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
      await page.getByRole('button', { name: 'Let’s begin' }).click()
      const log = page.getByRole('log')
      await expect(log).toContainText(FIRST_QUESTION)
      await page.getByRole('button', { name: 'Shop photo', exact: true }).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
      await (await chooser).setFiles(preview)
      await expect(page.getByTestId('camera-card')).toHaveCount(0)
      await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
      await expect(log.locator('ol > li').last()).toContainText(question)
      await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
      releasePreview()
      await expect
        .poll(() =>
          log
            .getByRole('img', { name: 'Menu photo' })
            .evaluate((img) => (img as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Type instead', exact: true }).click()
      await expect(page.getByTestId('voice-alert')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('photo-follow-up-full.png') })
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      const measured = await page.evaluate(measure, width < 600)
      expect(measured.overflow).toEqual([])
      expect(measured.targets).toEqual([])
      expect(measured.overlap).toEqual([])
      await info.attach('first-viewport-heatmap', {
        body: JSON.stringify(measured, null, 2),
        contentType: 'application/json',
      })
      if (width < 600) {
        // Emulate the layout viewport contracting for a phone keyboard after the upload.
        await page.getByRole('textbox', { name: 'Message', exact: true }).focus()
        await page.setViewportSize({ width, height: height - 300 })
      }
      await expect
        .poll(() =>
          page.evaluate(() => {
            const region = document.querySelector('[role="log"]')!.parentElement!
            const question = document.querySelector('[role="log"] ol')!.lastElementChild!
            const bar = document.querySelector('textarea[name="message"]')!.closest('form')!
            const r = region.getBoundingClientRect()
            const q = question.getBoundingClientRect()
            const b = bar.getBoundingClientRect()
            return {
              questionInChat: q.top >= r.top && q.bottom <= r.bottom + 1,
              questionClearsBar: q.bottom <= b.top || q.right <= b.left || q.left >= b.right,
              barOnScreen: b.bottom <= innerHeight,
              noPageScroll: document.documentElement.scrollHeight <= innerHeight + 1,
            }
          }),
        )
        .toEqual({
          questionInChat: true,
          questionClearsBar: true,
          barOnScreen: true,
          noPageScroll: true,
        })
      await page.screenshot({ path: info.outputPath('photo-follow-up.png') })
    })
  }
}
