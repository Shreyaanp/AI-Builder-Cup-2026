import { expect, test, type Page } from '@playwright/test'
import { measure } from './measure.ts'

/**
 * Release batch B6: Passport, Saved, Chats, the profile sheet, Rescue and first-run (A-21, A-22,
 * A-25, A-29, A-31, A-38, A-43, A-44, #451, #457).
 */
const SHOP = 'demo-story-bengaluru-chai'
const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
] as const

async function localOnly(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

async function prepare(page: Page, appearance: 'light' | 'dark' = 'light') {
  await localOnly(page)
  await page.addInitScript((value) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value }))
    localStorage.setItem('chalkboard.customer.journey', 'done')
  }, appearance)
}

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready)
}

/** Left edge of the first thing drawn inside an element: its icon, else its text. */
const contentLeft = (el: Element) => {
  const icon = el.querySelector('svg')
  if (icon) return icon.getBoundingClientRect().left
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      return range.getBoundingClientRect().left
    }
  }
  return el.getBoundingClientRect().left
}

for (const size of PHONES) {
  test.describe(`B6 ${size.width}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })

    test(`A-21 the profile sheet is one list of 48px rows on one left edge · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      await page.goto('/explore/saved')
      await page.getByRole('button', { name: 'Profile and preferences' }).first().click()
      const sheet = page.getByRole('dialog')
      const title = sheet.getByRole('heading', { name: 'Your profile' })
      await expect(title).toBeVisible()
      await settled(page)
      const rows = [
        sheet.getByRole('button', { name: /^Language:/ }),
        sheet.getByRole('button', { name: 'Switch to dark mode' }),
        sheet.getByRole('button', { name: 'Clear preferences and searches' }),
        sheet.getByRole('button', { name: 'Clear my stamps and follows' }),
        sheet.getByRole('region', { name: 'Help' }).getByRole('button', { name: 'See again' }),
        sheet.getByRole('button', { name: 'Sign out' }),
        sheet.getByRole('button', { name: 'Close', exact: true }),
      ]
      const edge = await title.evaluate(contentLeft)
      for (const row of rows) {
        await expect(row).toBeVisible()
        const box = (await row.boundingBox())!
        const label = (await row.textContent()) ?? ''
        expect(box.height, label).toBeGreaterThanOrEqual(48)
        // One alignment: every row's icon or label starts where the title does.
        expect(await row.evaluate(contentLeft), label).toBeCloseTo(edge, 0)
      }
      // The sheet no longer needs sideways room, and nothing is cut off.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width,
      )
    })

    test(`A-21 clear my stamps and follows empties this phone · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.addInitScript((shop) => {
        localStorage.setItem('chalkboard.customer.follows', JSON.stringify([shop]))
        localStorage.setItem(
          'chalkboard.customer.rewards.v1',
          JSON.stringify({
            shops: { [shop]: { stamps: 2, lastStamp: null } },
            days: [],
            streak: false,
            early: false,
            reminders: [],
          }),
        )
      }, SHOP)
      await page.goto('/explore/saved')
      await expect(page.getByRole('region', { name: 'Following' })).toBeVisible()
      await page.getByRole('button', { name: 'Profile and preferences' }).first().click()
      const sheet = page.getByRole('dialog')
      await sheet.getByRole('button', { name: 'Clear my stamps and follows' }).click()
      // Nothing is removed before it is confirmed.
      await expect(sheet.getByText('This removes your stamps and followed shops.')).toBeVisible()
      expect(
        await page.evaluate(() => localStorage.getItem('chalkboard.customer.follows')),
      ).toContain('demo-story')
      await sheet.getByRole('button', { name: 'Not now' }).click()
      await expect(sheet.getByText('This removes your stamps and followed shops.')).toHaveCount(0)
      await sheet.getByRole('button', { name: 'Clear my stamps and follows' }).click()
      await sheet.getByRole('button', { name: 'Clear', exact: true }).click()
      await expect(
        sheet.getByText('Cleared. Your stamps and followed shops are gone.'),
      ).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('chalkboard.customer.follows'))).toBe(
        '[]',
      )
      expect(
        await page.evaluate(() => localStorage.getItem('chalkboard.customer.rewards.v1')),
      ).toBeNull()
    })

    test(`A-29 Passport says "next level" once, names this week, and agrees on visits · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      await page.goto('/explore/passport')
      await expect(page.getByRole('heading', { level: 1, name: 'Your passport' })).toBeVisible()
      await expect(page.getByText('more points to Regular')).toHaveCount(1)
      await expect(page.getByText('Next reward')).toHaveCount(0)
      // The dashed circle is this week, said under the row, and it is not alarm red.
      const row = page.getByRole('list', { name: 'Last 8 weeks' })
      await expect(row.getByRole('listitem').last()).toHaveAccessibleName('This week')
      await expect(page.getByText('This week', { exact: true })).toBeVisible()
      const circle = row.getByRole('listitem').last()
      await expect(circle).toHaveCSS('border-top-style', 'dashed')
      await expect(circle).not.toHaveCSS('border-top-color', 'rgb(178, 59, 42)')
    })

    test(`A-29 after one stamp on this phone the goal and the weekly quest agree · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      const key = (
        (await (await page.request.get(`/api/v1/public/shops/${SHOP}/demo-qr`)).json()) as {
          key: string
        }
      ).key
      const place = (await (await page.request.get(`/api/v1/public/shops/${SHOP}`)).json()) as {
        lat: number
        lng: number
      }
      const check = await page.request.post('/api/v1/public/passport/check', {
        data: { shop_id: SHOP, key, lat: place.lat, lng: place.lng, accuracy: 15 },
      })
      expect(check.ok()).toBe(true)
      const { receipt } = (await check.json()) as { receipt: string }
      await page.addInitScript((value) => {
        localStorage.setItem('chalkboard.passport.receipts.v1', JSON.stringify([value]))
      }, receipt)
      await page.goto('/explore/passport')
      const goal = page.getByRole('region', { name: 'Neighbourhood goal' })
      await expect(goal).toContainText('Your visits: 1')
      const quests = page.getByRole('region', { name: 'Quests' })
      await expect(quests.getByText('1 of 3').first()).toBeVisible()
    })

    test(`A-22 first views use at most three text sizes · ${size.width}`, async ({ page }) => {
      await prepare(page)
      await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
      for (const path of [
        '/explore/passport',
        '/explore/rescue',
        '/explore/saved',
        '/explore/chats',
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await settled(page)
        const m = await page.evaluate(measure, true)
        expect(m.fontSizes.length, `${path}: ${m.fontSizes.join(', ')}`).toBeLessThanOrEqual(3)
        // The shared bottom bar: the theme's label size (13-14px by phone scale) and a 4px gap, not 9.7-11px and 2px.
        const nav = page.locator('nav.c-nav a').first()
        const label = nav.locator('span, p').last()
        await expect(label).toHaveCSS('font-size', /^1[34]px$/)
        await expect(nav).toHaveCSS('row-gap', '4px')
      }
    })

    test(`A-25 Rescue's "Use my location" icon sits on the 16px gutter · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.goto('/explore/rescue')
      const button = page.getByRole('button', { name: 'Use my location' })
      await expect(button).toBeVisible()
      await settled(page)
      expect(await button.evaluate(contentLeft)).toBeCloseTo(16, 0)
    })

    test(`A-30 an empty Rescue leads with what it is and one action above the nav · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.addInitScript(() => {
        localStorage.setItem(
          'chalkboard.discover.filters',
          JSON.stringify({ place: { lat: 10.5, lng: 10.5, label: 'Quietville' } }),
        )
      })
      // Nothing is closing near here, whatever sample shops this server draws.
      await page.route('**/api/v1/public/rescue?*', (route) => route.fulfill({ json: [] }))
      await page.goto('/explore/rescue')
      await expect(page.getByRole('heading', { level: 1, name: 'Rescue' })).toBeVisible()
      // The area chip, like the Ask header; no "Meals rescued: 0" card; no empty radar.
      await expect(page.getByText('Quietville').first()).toBeVisible()
      await expect(
        page.getByRole('heading', { name: /Leftovers from shops near Quietville/ }),
      ).toBeVisible()
      await expect(page.getByText('Meals rescued')).toHaveCount(0)
      await expect(page.getByRole('figure')).toHaveCount(0)
      const action = page.getByRole('link', { name: 'Find shops' })
      await settled(page)
      const box = (await action.boundingBox())!
      const nav = (await page.locator('nav.c-nav').boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y - 16)
      expect(box.y + box.height / 2).toBeGreaterThan(size.height / 2)
    })

    test(`A-31 a followed shop is a readable card you can open or unfollow · ${size.width}`, async ({
      page,
    }) => {
      await prepare(page)
      await page.addInitScript((shop) => {
        localStorage.setItem('chalkboard.customer.follows', JSON.stringify([shop]))
      }, SHOP)
      await page.goto('/explore/saved')
      const following = page.getByRole('region', { name: 'Following' })
      const card = following.getByRole('listitem')
      await expect(card).toHaveCount(1)
      await settled(page)
      // The whole name, never "Lantern …".
      const name = card.getByRole('link')
      await expect(name).toContainText('Lantern Chai Corner')
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      expect(await name.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe('ellipsis')
      // Open and unfollow are both there to see; the card opens the shop.
      const unfollow = card.getByRole('button', { name: /^Unfollow / })
      await expect(unfollow).toBeVisible()
      expect((await unfollow.boundingBox())!.height).toBeGreaterThanOrEqual(48)
      await name.click()
      await expect(page).toHaveURL(new RegExp(`/explore/s/${SHOP}`))
      await page.goBack()
      await card.getByRole('button', { name: /^Unfollow / }).click()
      await expect(page.getByText('Follow shops to see their news here')).toBeVisible()
    })

    for (const tab of ['saved', 'chats'] as const) {
      test(`A-43 signed-out ${tab}: the one filled button is in thumb reach · ${size.width}`, async ({
        page,
      }) => {
        await prepare(page)
        await page.addInitScript((shop) => {
          // Saved shows the sign-in prompt once there is something on this phone to keep.
          localStorage.setItem('chalkboard.customer.follows', JSON.stringify([shop]))
        }, SHOP)
        await page.goto(`/explore/${tab}`)
        const button = page.getByRole('button', { name: /Continue with Google/ })
        await expect(button).toBeVisible()
        await settled(page)
        const box = (await button.boundingBox())!
        const nav = (await page.locator('nav.c-nav').boundingBox())!
        expect(box.y + box.height / 2).toBeGreaterThan(size.height / 2)
        expect(box.y + box.height).toBeLessThanOrEqual(nav.y - 16)
        expect(box.x).toBeGreaterThanOrEqual(16)
        expect(box.x + box.width).toBeLessThanOrEqual(size.width - 16)
      })
    }
  })
}

for (const appearance of ['light', 'dark'] as const) {
  for (const size of PHONES) {
    test(`A-38 the first-run screen is full-bleed, with no grey corners · ${size.width} ${appearance}`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        // A device that has never seen the introduction: the suite's shared state marks it seen.
        storageState: { cookies: [], origins: [] },
        viewport: size,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
        colorScheme: appearance,
      })
      try {
        const page = await context.newPage()
        await localOnly(page)
        await page.addInitScript((value) => {
          localStorage.setItem('niva.language.chosen', '1')
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value }))
        }, appearance)
        await page.goto('/explore/')
        const intro = page.getByRole('heading', { name: 'Find local shops near you' })
        await expect(intro).toBeVisible({ timeout: 30_000 })
        await settled(page)
        const paper = page.locator('.MuiDialog-paperFullScreen')
        await expect(paper).toHaveCSS('border-top-left-radius', '0px')
        await expect(paper).toHaveCSS('border-bottom-right-radius', '0px')
        const box = (await paper.boundingBox())!
        expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, size.width, size.height])
        // The icon tile: the theme's own surface in dark, never the muddy olive container.
        const tile = page.getByRole('dialog').locator('div[aria-hidden="true"]').first()
        const colour = await tile.evaluate((el) => getComputedStyle(el).backgroundColor)
        expect(colour).not.toBe('rgb(90, 69, 0)')
        if (appearance === 'dark') expect(colour).toBe('rgb(52, 75, 61)')
      } finally {
        await context.close()
      }
    })
  }
}

test.describe('A-44 console', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    // The animations must run to prove they do not warn.
    reducedMotion: 'no-preference',
  })

  for (const path of ['/explore/passport', '/explore/rescue']) {
    for (const quiet of [false, true]) {
      test(`A-44 ${path} makes no GSAP warning and fetches the bootstrap once${quiet ? ' (empty area)' : ''}`, async ({
        page,
      }) => {
        await prepare(page)
        if (quiet)
          await page.addInitScript(() => {
            localStorage.setItem(
              'chalkboard.discover.filters',
              JSON.stringify({ place: { lat: 10.5, lng: 10.5, label: 'Quietville' } }),
            )
          })
        const warnings: string[] = []
        let bootstraps = 0
        page.on('console', (message) => {
          if (['warning', 'error'].includes(message.type())) warnings.push(message.text())
        })
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/api/v1/bootstrap') bootstraps += 1
        })
        await page.request.post('/api/v1/customer/session', { data: { name: 'Neighbour' } })
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await settled(page)
        // Let the entrance timelines start and finish.
        await expect(page.locator('nav.c-nav')).toBeVisible()
        // Loaded: Passport shows its stamp book, Rescue its list or its empty state.
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
        expect(warnings.filter((text) => /GSAP|not found/i.test(text))).toEqual([])
        expect(bootstraps).toBeLessThanOrEqual(1)
      })
    }
  }
})

// #451 (each demo visit holds a sandbox for 15 minutes, so the widest scripts stand for the rest): the owner coach's hint is cut off at 390 ("Tell me about your sho…"): it fits.
for (const [language, width] of [
  ['en', 360],
  ['en', 390],
  ['en', 412],
  ['hi', 360],
  ['ta', 360],
  ['kn', 360],
  ['te', 360],
  ['fil', 360],
] as const) {
  test(`#451 the Coach hint fits its box · ${language} ${width}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    })
    try {
      // OB-132: the local server skips the shared per-IP limits (the demo workspace is read per visit).
      await context.setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
      const page = await context.newPage()
      await localOnly(page)
      await page.addInitScript((value) => {
        localStorage.setItem('niva.language.chosen', '1')
        localStorage.setItem('chalkboard.explainer.owner.v1', '1')
        localStorage.setItem('chalkboard.explainer.customer.v1', '1')
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: value }))
        sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
      }, language)
      await page.goto('/demo', { waitUntil: 'domcontentloaded' })
      const field = page.locator('#coach textarea:not([aria-hidden])')
      await expect(field).toBeVisible({ timeout: 30_000 })
      await settled(page)
      const fit = await field.evaluate((el: HTMLTextAreaElement) => {
        const style = getComputedStyle(el)
        const canvas = document.createElement('canvas').getContext('2d')!
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        return {
          hint: el.placeholder,
          needs: Math.ceil(canvas.measureText(el.placeholder).width),
          room: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        }
      })
      expect(fit.hint.length).toBeGreaterThan(0)
      expect(fit.needs, `"${fit.hint}" needs ${fit.needs}px of ${fit.room}px`).toBeLessThanOrEqual(
        fit.room,
      )
    } finally {
      await context.close()
    }
  })
}
