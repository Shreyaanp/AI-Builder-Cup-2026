import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// OB-239 (#621, review of PR #623): a low item the app cannot tell about asks the owner once,
// "Do you make it or buy it?", with two 48 px answers. Buy brings the Order button; Make brings
// "Make more" and never a supplier order. Phone widths 360/390/412, light and dark. Local only.
test.skip(({ isMobile }) => !isMobile, 'phone story')
// A tap's reload may still be fetching Today when a test ends.
test.afterEach(({ page }) => page.unrouteAll({ behavior: 'ignoreErrors' }))

async function cafe(page: Page, name: string) {
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Café',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          hours: '07:00–21:00',
          phone: '+91 80 4000 1234',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Filter coffee', price: 3000, unit: 'cup', category: 'Drinks', stock: 40 },
          { name: 'Samosa', price: 2000, unit: 'piece', category: 'Snacks', stock: 4 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  expect(approved.ok()).toBe(true)
}

async function prefer(page: Page, language: 'en' | 'hi', appearance: 'light' | 'dark') {
  await page.evaluate(
    (value) => localStorage.setItem('niva.starter.preferences', JSON.stringify(value)),
    { language, appearance },
  )
}

async function open(page: Page, continueLabel = 'Continue local preview') {
  // A playbook that leads with stock, so the low row is on Today whatever else is pending.
  await page.route('**/api/v1/businesses/*/today', async (route) => {
    const response = await route.fetch()
    const real = await response.json()
    await route.fulfill({
      response,
      json: {
        ...real,
        hints: {
          focus: null,
          pulse: ['sales'],
          line_topics: [],
          needs_you: ['low_stock', 'questions', 'menu_check', 'missing_info'],
          metrics: ['sales'],
          units: [],
        },
      },
    })
  })
  await page.reload()
  await page.getByRole('button', { name: continueLabel }).click()
  await expect(page.locator('[data-need]').first()).toBeVisible()
  return page.locator('[data-need="low"]').filter({ hasText: 'Samosa' })
}

async function fitsThePhone(page: Page, row: ReturnType<Page['locator']>) {
  for (const button of await row.getByRole('button').all()) {
    const box = (await button.boundingBox())!
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(48)
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(48)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

for (const width of [360, 390, 412])
  for (const scheme of ['light', 'dark'] as const)
    test(`OB-239: the make-or-buy question fits a ${width} px phone (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: 844 })
      await localOnly(page)
      await enter(page)
      await prefer(page, 'en', scheme)
      const name = `Corner Café ${width} ${scheme}`
      await cafe(page, name)
      const row = await open(page)
      await expect(row).toContainText('Samosa: only 4 left. Do you make it or buy it?')
      await expect(row.getByRole('button', { name: 'I make Samosa' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'I buy Samosa' })).toBeVisible()
      // Never an Order button before the owner says they buy it.
      await expect(row.getByRole('button', { name: 'Order', exact: true })).toHaveCount(0)
      await fitsThePhone(page, row)
      // Contrast: the question reads in both themes (text is not the background colour).
      const colours = await row.getByText('Do you make it or buy it?').evaluate((node) => {
        const style = getComputedStyle(node)
        return { color: style.color, background: getComputedStyle(document.body).backgroundColor }
      })
      expect(colours.color).not.toBe(colours.background)
      await page.screenshot({ path: test.info().outputPath(`make-or-buy-${width}-${scheme}.png`) })

      if (width === 390) {
        // Buy: saved on the item; the row now orders, and the question is never asked again.
        await row.getByRole('button', { name: 'I buy Samosa' }).click()
        await expect(row.getByRole('button', { name: 'Order', exact: true })).toBeVisible()
        await expect(row).not.toContainText('Do you make it or buy it?')
        await page.reload()
        await page.getByRole('button', { name: 'Continue local preview' }).click()
        await expect(
          page.locator('[data-need="low"]').filter({ hasText: 'Samosa' }).getByRole('button', {
            name: 'Order',
            exact: true,
          }),
        ).toBeVisible()
      }
      if (width === 412) {
        // Make: the prep plan's "Make more", never a supplier order.
        await row.getByRole('button', { name: 'I make Samosa' }).click()
        await expect(row.getByRole('button', { name: 'Make more' })).toBeVisible()
        await expect(row.getByRole('button', { name: 'Order', exact: true })).toHaveCount(0)
        await fitsThePhone(page, row)
      }
    })

test('OB-239: the make-or-buy question in Hindi, 360 px dark', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 844 })
  await localOnly(page)
  await enter(page)
  await prefer(page, 'hi', 'dark')
  await cafe(page, 'Corner Café hi')
  const row = await open(page, 'स्थानीय प्रीव्यू जारी रखें')
  await expect(row).toContainText('सिर्फ़ 4 बचे। आप इसे बनाते हैं या खरीदते हैं?')
  await expect(row.getByRole('button', { name: 'Samosa: बनाते हैं' })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Samosa: खरीदते हैं' })).toBeVisible()
  await fitsThePhone(page, row)
  await page.screenshot({ path: test.info().outputPath('make-or-buy-360-dark-hi.png') })
})

// Second review of PR #623, point 4: every feature has a screen path, not chat only. The menu
// item editor reads and writes the same saved answer as Today, and changing it starts no reorder.
async function editSamosa(page: Page, shop: string, menu: string, edit: string) {
  await page.getByRole('button', { name: shop, exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${menu}`) }).click()
  const sheet = page.getByRole('dialog', { name: menu })
  await expect(sheet).toHaveCSS('transform', 'none')
  await sheet.getByRole('button', { name: `${edit} Samosa` }).click()
  return page.getByRole('dialog', { name: edit })
}

async function savedShop(page: Page, name: string) {
  const shops: { id: string; fields: { name: string } }[] = await (
    await page.request.get('/api/v1/businesses')
  ).json()
  const id = shops.find((shop) => shop.fields.name === name)!.id
  const samosa = async (): Promise<string | undefined> => {
    const items: { name: string; source?: string }[] = await (
      await page.request.get(`/api/v1/businesses/${id}/inventory`)
    ).json()
    return items.find((item) => item.name === 'Samosa')!.source
  }
  const orders = async (): Promise<unknown[]> =>
    (await (await page.request.get(`/api/v1/businesses/${id}/supply`)).json()).orders
  return { samosa, orders }
}

for (const width of [360, 390, 412, 1280])
  for (const scheme of ['light', 'dark'] as const)
    test(`OB-239: the menu editor changes make or buy, no reorder, ${width} px (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 })
      await localOnly(page)
      await enter(page)
      await prefer(page, 'en', scheme)
      const name = `Editor Café ${width} ${scheme}`
      await cafe(page, name)
      const row = await open(page)
      const saved = await savedShop(page, name)

      let form = await editSamosa(page, 'Shop', 'Menu', 'Edit')
      const answer = form.getByRole('group', { name: 'Do you make it or buy it?' })
      const make = answer.getByRole('button', { name: 'Make', exact: true })
      const buy = answer.getByRole('button', { name: 'Buy', exact: true })
      await answer.scrollIntoViewIfNeeded()
      // Nothing is claimed before the owner has said: neither answer is chosen.
      await expect(make).toHaveAttribute('aria-pressed', 'false')
      await expect(buy).toHaveAttribute('aria-pressed', 'false')
      for (const control of [make, buy]) {
        const box = (await control.boundingBox())!
        expect(Math.round(box.height)).toBeGreaterThanOrEqual(48)
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)

      // OB-243: the tap saves at once (Cancel does not undo it), so the editor says so.
      const note = form.getByTestId('product-source-saved')
      await expect(note).toHaveText('')
      await buy.click()
      await expect(buy).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(saved.samosa).toBe('bought')
      await expect(note).toHaveText('Saved')
      expect(
        (await new AxeBuilder({ page }).include('[role=dialog]').withTags(['wcag2aa']).analyze())
          .violations,
      ).toEqual([])
      await page.screenshot({ path: test.info().outputPath(`editor-${width}-${scheme}.png`) })

      // Tapping the chosen answer again keeps it: an answer is changed, never cleared.
      await buy.click()
      await expect(buy).toHaveAttribute('aria-pressed', 'true')

      // The same answer on Today: the question is gone and the row orders.
      await form.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Coach', exact: true }).click()
      await expect(row.getByRole('button', { name: 'Order', exact: true })).toBeVisible()
      await expect(row).not.toContainText('Do you make it or buy it?')

      // It reads the saved answer back, and a mis-tap is fixed from the screen.
      form = await editSamosa(page, 'Shop', 'Menu', 'Edit')
      await expect(buy).toHaveAttribute('aria-pressed', 'true')
      await make.click()
      await expect(make).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(saved.samosa).toBe('made')
      await form.getByRole('button', { name: 'Cancel' }).click()
      await page.getByRole('button', { name: 'Coach', exact: true }).click()
      await expect(row.getByRole('button', { name: 'Make more' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Order', exact: true })).toHaveCount(0)

      // Changing it twice from the screen never started an order.
      expect(await saved.orders()).toEqual([])
    })

test('OB-239: an answer given on Today shows in the menu editor', async ({ page }) => {
  // The menu's copy of the item was not refreshed by Today's answer: the editor showed none.
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await enter(page)
  await prefer(page, 'en', 'light')
  await cafe(page, 'Today Answer Café')
  const row = await open(page)
  await row.getByRole('button', { name: 'I make Samosa' }).click()
  await expect(row.getByRole('button', { name: 'Make more' })).toBeVisible()
  const form = await editSamosa(page, 'Shop', 'Menu', 'Edit')
  await expect(form.getByRole('button', { name: 'Make', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('OB-239: a new menu item saves make or buy with the item', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await localOnly(page)
  await enter(page)
  await prefer(page, 'en', 'light')
  const name = 'New Item Café'
  await cafe(page, name)
  await open(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page
    .getByRole('dialog', { name: 'Menu' })
    .getByRole('button', { name: 'Add product' })
    .click()
  const form = page.getByRole('dialog', { name: 'Add product' })
  await form.getByRole('textbox', { name: 'Product name' }).fill('Masala vada')
  await form.getByRole('textbox', { name: 'Price' }).fill('20')
  await form.getByRole('button', { name: 'Make', exact: true }).click()
  await form.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const shops: { id: string; fields: { name: string } }[] = await (
    await page.request.get('/api/v1/businesses')
  ).json()
  const id = shops.find((shop) => shop.fields.name === name)!.id
  const items: { name: string; source?: string }[] = await (
    await page.request.get(`/api/v1/businesses/${id}/inventory`)
  ).json()
  expect(items.find((item) => item.name === 'Masala vada')!.source).toBe('made')
})

test('OB-239: the menu editor in Hindi, 360 px dark', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 360, height: 844 })
  await localOnly(page)
  await enter(page)
  await prefer(page, 'hi', 'dark')
  await cafe(page, 'Editor Café hi')
  await open(page, 'स्थानीय प्रीव्यू जारी रखें')
  const form = await editSamosa(page, 'दुकान', 'मेन्यू', 'बदलें')
  const answer = form.getByRole('group', { name: 'आप इसे बनाते हैं या खरीदते हैं?' })
  await answer.scrollIntoViewIfNeeded()
  await answer.getByRole('button', { name: 'खरीदते हैं', exact: true }).click()
  await expect(answer.getByRole('button', { name: 'खरीदते हैं', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(answer.getByRole('button', { name: 'बनाते हैं', exact: true })).toBeVisible()
  await expect(page.locator('.MuiDialog-container').last()).toHaveCSS('opacity', '1')
  await page.screenshot({ path: test.info().outputPath('editor-360-dark-hi.png') })
})
