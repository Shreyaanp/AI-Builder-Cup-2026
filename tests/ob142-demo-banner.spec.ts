import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // OB-132: repeated layout checks opt out of the local demo allocation limit.
  await context.setExtraHTTPHeaders({ 'x-test-rate-limit-bypass': '1' })
})

test.afterEach(async ({ page }) => {
  // Exercise the way out and release each sandbox before the next repeated case.
  await page.locator('header').first().getByRole('button').click()
  await expect(page).toHaveURL(/\/(?:explore\/)?$/)
})

for (const appearance of ['light', 'dark']) {
  for (const width of [360, 390, 412, 1280]) {
    for (const path of ['/demo', '/explore/demo']) {
      test(`OB-142: ${path} ${width}px ${appearance} shows the complete demo notice and actions`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.addInitScript((appearance) => {
          localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance }))
          sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
        }, appearance)
        await page.route('**/*', (route) =>
          ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
            ? route.continue()
            : route.abort(),
        )
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        const notice = page.getByText('Demo shop - nothing here is real', { exact: true })
        await expect(notice).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const header = notice.locator('xpath=ancestor::header')
        await expect(header.getByRole('link')).toHaveAttribute(
          'href',
          path === '/demo' ? '/explore/demo' : '/demo',
        )
        await expect(header.getByRole('button', { name: 'Exit demo', exact: true })).toBeVisible()
        await expect
          .poll(() =>
            notice.evaluate(
              (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
            ),
          )
          .toBe(true)
        for (const control of await header.locator('a, button').all()) {
          const box = await control.boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(48)
          expect(box!.width).toBeGreaterThanOrEqual(48)
          expect(box!.x).toBeGreaterThanOrEqual(16)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width - 16)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        )
        if (path === '/demo') await expect(page.locator('main')).toBeVisible({ timeout: 30_000 })
        await page.screenshot({ path: info.outputPath('banner.png') })
      })
    }
  }
}

for (const language of ['en', 'hi', 'ja']) {
  for (const path of ['/demo', '/explore/demo']) {
    test(`OB-142: ${path} ${language} larger text keeps the notice, actions and workspace in bounds`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.addInitScript((language) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
        sessionStorage.setItem('chalkboard.demo.welcome.v1', '1')
      }, language)
      await page.route('**/*', (route) =>
        ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
          ? route.continue()
          : route.abort(),
      )
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const header = page.locator('header').first()
      await expect(header.locator('a')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      const notice = header.locator('p')
      await expect
        .poll(() =>
          notice.evaluate(
            (el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
          ),
        )
        .toBe(true)
      for (const control of await header.locator('a, button').all()) {
        await expect(control).toBeVisible()
        const box = await control.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(16)
        expect(box!.x + box!.width).toBeLessThanOrEqual(374)
        expect(box!.height).toBeGreaterThanOrEqual(48)
      }
      // Resizing text must also resize the space reserved above the owner workspace.
      if (path === '/demo') {
        const main = page.locator('main')
        await expect(main).toBeVisible({ timeout: 30_000 })
        await expect
          .poll(() =>
            header.evaluate((el) => {
              const probe = document.createElement('div')
              probe.style.height = 'var(--app-viewport)'
              el.parentElement!.append(probe)
              const height = probe.getBoundingClientRect().height
              probe.remove()
              return Math.abs(height + el.getBoundingClientRect().height - innerHeight)
            }),
          )
          .toBeLessThanOrEqual(1)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      )
    })
  }
}
