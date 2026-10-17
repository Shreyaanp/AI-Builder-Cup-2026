import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { enter, image, localOnly, seedShop } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { LOCALES } from '../src/i18n/locales.js'
import { formatPrice } from '../src/features/v1/format.js'
import { formatMoneyText } from '../src/features/inquiries/formatMoneyText.js'

test.use({ reducedMotion: 'reduce' })
test.setTimeout(120_000)

test('generated reply prices use the shared formatter in all 15 locales', () => {
  for (const locale of LOCALES) {
    for (const [currency, amount, minor] of [
      ['INR', '18.00', 1800],
      ['SGD', '1,234.50', 123450],
      ['EUR', '1,234.50', 123450],
      ['JPY', '980', 980],
      ['KWD', '1.250', 1250],
    ] as const) {
      expect(formatMoneyText(`Price: ${currency} ${amount} / cup.`, locale)).toBe(
        `Price: ${formatPrice(minor, currency, locale)} / cup.`,
      )
    }
    expect(formatMoneyText('PIN 1234; INR 1,23; INR 18.00.50', locale)).toBe(
      'PIN 1234; INR 1,23; INR 18.00.50',
    )
    expect(formatMoneyText('INR -18.00', locale)).toBe(formatPrice(-1800, 'INR', locale))
  }
})

async function withinViewport(page: Page, control: Locator) {
  const bounds = await control.boundingBox()
  expect(bounds).not.toBeNull()
  const viewport = page.viewportSize()!
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1)
  await control.click({ trial: true })
}

for (const appearance of ['light', 'dark'] as const) {
  test.describe(appearance, () => {
    test.beforeEach(async ({ page, isMobile }) => {
      await localOnly(page)
      if (isMobile) await page.setViewportSize({ width: 360, height: 640 })
      await page.addInitScript((appearance) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
        localStorage.setItem('chalkboard.customer.journey', 'done')
      }, appearance)
    })

    test(`onboarding action row stays reachable (${appearance})`, async ({ page }, info) => {
      await enter(page)
      await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
      await page.getByRole('button', { name: 'Let’s begin' }).click()
      await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
      const card = page.getByTestId('shop-so-far')
      // The chip-edge mask lives in VoiceStage.tsx and is reserved for the voice workers.
      await withinViewport(page, page.getByRole('button', { name: 'Shop photo', exact: true }))
      await withinViewport(page, page.getByRole('button', { name: 'My location', exact: true }))
      await withinViewport(page, page.getByLabel('Message', { exact: true }))
      await page.screenshot({ path: info.outputPath('onboarding.png') })
      await page.getByLabel('Message', { exact: true }).fill('name: QA Chai; category: Tea stall')
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(card).toContainText('QA Chai')
      await withinViewport(page, page.getByRole('button', { name: 'Review my shop' }))
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      await page.screenshot({ path: info.outputPath('onboarding-filled.png') })
    })

    test(`Browse filters scroll to the last chip (${appearance})`, async ({ page }, info) => {
      await page.goto('/discover')
      const first = page.getByRole('button', { name: 'All places', exact: true })
      await expect(first).toBeVisible()
      const row = first.locator('..')
      await row.scrollIntoViewIfNeeded()
      await row.evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      const last = row.getByRole('button').last()
      await withinViewport(page, last)
      await last.click()
      await expect(last).toHaveAttribute('aria-pressed', 'true')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath('browse.png') })
    })

    test(`Landing keeps one business link and a clear discovery action (${appearance})`, async ({
      page,
    }, info) => {
      await page.goto('/?app=landing')
      const topBar = page.getByRole('banner').getByRole('link', { name: 'For businesses' })
      if ((page.viewportSize()?.width ?? 0) < 900) await expect(topBar).toBeHidden()
      else {
        await expect(topBar).toBeVisible()
        await expect(topBar).not.toHaveClass(/MuiButton-contained/)
      }
      const business = page.locator('.lp-final').getByRole('link', { name: 'For businesses' })
      await expect(business).toHaveCount(1)
      const hero = page.locator('.lp-hero')
      await expect(hero.getByRole('link', { name: 'For businesses' })).toHaveCount(0)
      const discover = hero.getByRole('link', { name: 'Find places near me' })
      await expect(discover).toHaveClass(/MuiButton-contained/)
      await withinViewport(page, discover)
      await discover.focus()
      await expect(discover).toBeFocused()
      await page.screenshot({ path: info.outputPath('landing.png') })
      await discover.press('Enter')
      await expect(page).toHaveURL(/\/explore\//)
    })

    test(`Follow stays secondary after following a shop (${appearance})`, async ({
      page,
    }, info) => {
      await enter(page)
      await seedShop(page)
      const shops = await (await page.request.get('/api/v1/businesses')).json()
      const id = shops[0].id as string
      expect(
        (
          await page.request.post(`/api/v1/businesses/${id}/share`, { data: { public: true } })
        ).ok(),
      ).toBe(true)
      await page.goto(`/explore/s/${id}`)
      const follow = page.getByRole('button', { name: /^Follow / })
      await follow.click()
      const following = page.getByRole('button', { name: /^Unfollow / })
      await expect(following).toHaveAttribute('aria-pressed', 'true')
      await expect(following).toHaveClass(/MuiButton-outlined/)
      await following.scrollIntoViewIfNeeded()
      await following.focus()
      await expect(following).toBeFocused()
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
      ).toEqual([])
      await page.screenshot({ path: info.outputPath('following.png') })
      await following.press('Enter')
      await expect(follow).toHaveAttribute('aria-pressed', 'false')
      await expect(follow).toHaveClass(/MuiButton-outlined/)
    })

    for (const locale of ['en', 'ta', 'ja'] as const) {
      test(`Saved instant answers use the shared currency display (${appearance}, ${locale})`, async ({
        page,
      }, info) => {
        await page.addInitScript((language) => {
          Object.defineProperty(navigator, 'languages', { value: [language] })
        }, locale)
        const id = '00000000-0000-4000-8000-000000000001'
        await page.route('**/api/v1/customer/me', (route) =>
          route.fulfill({
            json: {
              signed_in: true,
              name: 'Asha',
              profile: {
                name: 'Asha',
                follows: [],
                searches: [],
                preferences: {},
              },
            },
          }),
        )
        await page.route('**/api/v1/customer/threads', (route) => route.fulfill({ json: [] }))
        await page.route(`**/api/v1/customer/shops/demo-qa-money/threads/${id}**`, (route) => {
          if (route.request().url().endsWith('/stream')) return route.abort()
          if (route.request().url().endsWith('/seen')) return route.fulfill({ json: {} })
          return route.fulfill({
            json: {
              shop: { id: 'demo-qa-money', name: 'QA Chai', category: 'Tea stall', demo: true },
              unread: 0,
              thread: {
                id,
                done: false,
                blocked: false,
                messages: [
                  {
                    id: 'question',
                    author: 'customer',
                    kind: 'message',
                    text: 'Chai costs INR 18.00?',
                    created: 1792100000,
                  },
                  {
                    id: 'answer',
                    author: 'owner',
                    kind: 'ai',
                    text: 'Chai. Available. INR 18.00 / cup',
                    created: 1792100001,
                  },
                  {
                    id: 'demo',
                    author: 'owner',
                    kind: 'demo',
                    text: 'Chai (INR 18.00 per cup).',
                    created: 1792100002,
                  },
                ],
              },
            },
          })
        })
        await page.goto(`/explore/chats/demo-qa-money/${id}`)
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await expect(page.getByText('Chai. Available. ₹18.00 / cup', { exact: true })).toBeVisible()
        await expect(page.getByText('Chai (₹18.00 per cup).', { exact: true })).toBeVisible()
        await expect(page.getByText('Chai costs INR 18.00?', { exact: true })).toBeVisible()
        if (locale === 'en')
          expect(
            (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
          ).toEqual([])
        await page.screenshot({ path: info.outputPath(`instant-answer-${locale}.png`) })
      })
    }

    test(`Owner messages format generated prices and preserve human text (${appearance})`, async ({
      page,
    }, info) => {
      const thread = {
        id: 't1',
        name: 'Priya',
        contact: '',
        message: 'Chai costs INR 18.00?',
        created: 1792100000,
        unread: true,
        done: false,
        blocked: false,
        messages: [
          {
            id: 'm1',
            author: 'customer',
            kind: '',
            text: 'Chai costs INR 18.00?',
            created: 1792100000,
          },
          {
            id: 'm2',
            author: 'owner',
            kind: 'ai',
            text: 'Chai. Available. INR 18.00 / cup',
            created: 1792100001,
          },
        ],
      }
      await page.route('**/api/v1/businesses/*/inquiries/stream', (route) => route.abort())
      await page.route('**/api/v1/businesses/*/inquiries', (route) =>
        route.fulfill({ json: [thread] }),
      )
      await page.route('**/api/v1/businesses/*/inquiries/t1/*', (route) =>
        route.fulfill({ json: thread }),
      )
      await enter(page)
      await seedShop(page)
      await page.getByRole('button', { name: 'Shop', exact: true }).click()
      await page.getByRole('button', { name: /^Messages/ }).click()
      await page.getByRole('button', { name: 'Open conversation' }).click()
      const log = page.getByRole('log', { name: 'Conversation' })
      await expect(log).toContainText('Chai. Available. ₹18.00 / cup')
      await expect(log).toContainText('Chai costs INR 18.00?')
      await page.screenshot({ path: info.outputPath('owner-instant-answer.png') })
    })

    test(`A failed Close the day photo can be cancelled back to Coach (${appearance})`, async ({
      page,
    }, info) => {
      await enter(page)
      await seedShop(page)
      await page.route('**/api/v1/businesses/*/day/read?*', (route) =>
        route.fulfill({ status: 503, json: {} }),
      )
      await page.getByRole('button', { name: 'Grow', exact: true }).click()
      await page.getByRole('button', { name: /^Close the day/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Close the day' })
      await dialog.getByRole('button', { name: /Till or POS report/ }).click()
      await dialog.locator('input[type=file]').setInputFiles(await image(page))
      await expect(dialog.getByTestId('close-day-trouble')).toBeVisible()
      const close = dialog.getByRole('button', { name: 'Close', exact: true })
      await withinViewport(page, close)
      await page.screenshot({ path: info.outputPath('close-day-failed-photo.png') })
      await close.click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Coach', exact: true }).click()
      await expect(page.getByLabel('Message', { exact: true })).toBeEditable()
    })

    test(`Close the day uses the saved INR shop currency (${appearance})`, async ({
      page,
    }, info) => {
      await enter(page)
      await seedShop(page)
      await page.route('**/api/v1/businesses/*/day/read?*', (route) =>
        route.fulfill({
          json: {
            lines: [{ item: 'Kopi', read_as: 'Kopi', quantity: 1, amount: 10, matched: true }],
            fixture: true,
            date: '2026-10-16',
          },
        }),
      )
      await page.getByRole('button', { name: 'Grow', exact: true }).click()
      await page.getByRole('button', { name: /^Close the day/ }).click()
      const dialog = page.getByRole('dialog', { name: 'Close the day' })
      await dialog.getByRole('button', { name: /Till or POS report/ }).click()
      await dialog.locator('input[type=file]').setInputFiles(await image(page))
      await dialog.getByRole('button', { name: 'Review (1 lines)', exact: true }).click()
      await expect(dialog).toContainText(/(?:INR\s*|₹)10\.00/)
      await expect(dialog).not.toContainText('$')
      await page.screenshot({ path: info.outputPath('close-day-inr.png') })
      await dialog.getByRole('button', { name: 'Save day', exact: true }).click()
      await expect(dialog).toContainText('Day closed')
      await expect(dialog).toContainText(/(?:INR\s*|₹)10\.00/)
      await dialog.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Coach', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Coach', exact: true })).toBeVisible()
      await expect(page.getByLabel('Message', { exact: true })).toBeEditable()
    })
  })
}
