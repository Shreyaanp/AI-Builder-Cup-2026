import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function png(page: Page, width: number): Promise<Buffer> {
  const url = await page.evaluate((size) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = 40
    const context = canvas.getContext('2d')!
    context.fillStyle = '#f0c878'
    context.fillRect(0, 0, size, 40)
    return canvas.toDataURL('image/png')
  }, width)
  return Buffer.from(url.split(',')[1], 'base64')
}

async function consent(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
}

async function open(page: Page) {
  await consent(page)
  const agree = page.getByRole('button', { name: 'Agree and continue' })
  await expect(agree).toBeDisabled()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await agree.click()
  await expect(page.getByRole('heading', { name: 'What shall we work on today?' })).toBeVisible()
}

async function addShop(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add my shop' }).click()
  await page.getByLabel('Shop name').fill(name)
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Nothing is published to Google')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

async function sharedShop(page: Page) {
  await open(page)
  await addShop(page, 'Accessibility Tea Stall')
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  // My shop is tiles; each opens a bottom sheet.
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.getByRole('button', { name: 'Add product', exact: true }).click()
  await page.getByLabel('Product name').fill('Chai')
  await page.getByLabel(/^Price/).fill('15')
  await page.getByLabel('Unit (cup, kg, piece…)').fill('cup')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Chai')
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /^Menu/ }).click()
  await expect(page.getByRole('button', { name: /^Edit Chai/ })).toContainText('$15.00')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /^Customer page/ }).click()
  const sharing = page.getByRole('switch', { name: 'Share customer page' })
  await sharing.click()
  await expect(sharing).toBeChecked()
  const url = await page.getByRole('link', { name: 'Open page' }).getAttribute('href')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return url
}

async function settled(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    )
  })
}

const screens = [
  'Welcome',
  'Consent',
  'Coach',
  'Review',
  'My shop',
  'Google',
  'Privacy',
  'Delete confirmation',
  'Public customer page',
] as const

for (const colorScheme of ['light', 'dark'] as const) {
  for (const screen of screens) {
    test(`${screen} accessibility in ${colorScheme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme })
      switch (screen) {
        case 'Welcome':
          await page.goto('/')
          await expect(
            page.getByRole('heading', { name: 'Your shop, online in one conversation' }),
          ).toBeVisible()
          break
        case 'Consent':
          await consent(page)
          break
        case 'Coach':
          await open(page)
          await expect(page.getByRole('log')).toHaveCount(0)
          await expect(
            page.getByRole('region', { name: 'Scan your menu or shop board' }),
          ).toBeVisible()
          break
        case 'Review':
          await open(page)
          await page.locator('input[type="file"]').setInputFiles({
            name: 'tea-menu.png',
            mimeType: 'image/png',
            buffer: await png(page, 64),
          })
          await expect(page.getByRole('dialog', { name: 'Check before saving' })).toBeVisible()
          break
        default: {
          const shared = await sharedShop(page)
          if (screen === 'Google') {
            await page.getByRole('button', { name: 'Google', exact: true }).click()
            await expect(page.getByRole('heading', { name: 'Get on Google' })).toBeVisible()
          } else if (screen === 'Privacy' || screen === 'Delete confirmation') {
            await page.getByRole('button', { name: 'Privacy', exact: true }).click()
            await expect(page.getByRole('heading', { name: 'Privacy & data' })).toBeVisible()
            if (screen === 'Delete confirmation') {
              await page.getByRole('button', { name: 'Delete all my data' }).click()
              await expect(page.getByRole('dialog', { name: 'Delete everything?' })).toBeVisible()
            }
          } else if (screen === 'Public customer page') {
            expect(shared).toContain('/s/')
            await page.goto(shared!)
            await expect(
              page.getByRole('heading', { name: 'Accessibility Tea Stall' }),
            ).toBeVisible()
            await expect(page.getByRole('listitem').filter({ hasText: 'Chai' })).toContainText(
              '$15.00',
            )
          }
        }
      }

      await settled(page)
      if (testInfo.project.name === 'phone') {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
          `${screen} must not overflow horizontally`,
        ).toBe(true)
        // Welcome, Consent and the customer page have no owner navigation.
        // Modal dialogs hide the shell from assistive tech, but it remains visually present.
        if (!['Welcome', 'Consent', 'Public customer page'].includes(screen)) {
          const navigation = page.getByRole('navigation', { name: 'Main', includeHidden: true })
          await expect(navigation).toBeVisible()
          await expect(navigation).toBeInViewport()
        }
      }
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      await testInfo.attach('axe-results', {
        body: JSON.stringify(result.violations, null, 2),
        contentType: 'application/json',
      })
      expect(result.violations).toEqual([])
    })
  }
}
