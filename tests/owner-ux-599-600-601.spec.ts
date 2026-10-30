import { expect, test, type Page } from '@playwright/test'
import { enter, localOnly, seedShop, shareSigned, closeSheet, phone } from './stories/support.js'
import { ownerTools } from './owner-tools-support.js'

// Owner app fixes: #599 (OB-228) AI replies labelled as AI, #600 (OB-229) photo delete asks first
// with an Undo, #601 (OB-230) the mic explains offline and returns to idle.
const fixture = 'scripts/impact/fixtures/bakery.png'
const slow = { timeout: 45_000 }
test.setTimeout(120_000)
test.use({ actionTimeout: 30_000 })

for (const width of [360, 390, 412]) {
  test(`#599 OB-228 the AI instant answer is labelled AI, not "You" (${width}px)`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await localOnly(page)
    await enter(page)
    await seedShop(page, true, 'Courtyard Chai · Bengaluru')
    await shareSigned(page)
    await closeSheet(page)
    const context = await browser.newContext({ ...phone, viewport: { width, height: 800 } })
    try {
      const customer = await context.newPage()
      await localOnly(customer)
      const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
      await customer.goto(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/s/${shop.id}`)
      await customer.getByRole('button', { name: 'Chat with the shop' }).click()
      await customer.getByRole('button', { name: 'Ask the owner' }).last().click()
      await customer.getByRole('button', { name: /Continue with Google/ }).click()
      await expect(customer.getByText(/Signed in as/)).toBeVisible()
      await customer
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('Do you have 10 cups of chai for a party at 6pm?')
      await customer.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(customer.getByText('AI instant answer').first()).toBeVisible(slow)

      await page.getByRole('button', { name: 'Shop', exact: true }).click()
      await page.getByRole('button', { name: /^Messages/ }).click()
      const messages = page.getByRole('region', { name: /Messages/ })
      await messages.getByRole('button', { name: 'Open conversation', exact: true }).click()
      const thread = messages.getByRole('listitem')
      await expect(thread.filter({ hasText: 'AI instant answer' })).toHaveCount(1, slow)
      // The owner wrote nothing yet: no bubble may claim "You".
      await expect(thread.filter({ hasText: /^You/ })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    } finally {
      await context.close()
    }
  })
}

async function openPhotos(page: Page) {
  await ownerTools(page)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Photos/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Photos' })
  await expect(sheet).toBeVisible()
  await sheet.locator('input[type=file]:not([capture])').setInputFiles(fixture)
  await expect(sheet.getByRole('button', { name: 'Remove photo 1' })).toBeVisible(slow)
  return sheet
}
const gallerySize = async (page: Page) =>
  ((await (await page.request.get('/api/v1/businesses')).json())[0].gallery as string[]).length

for (const width of [360, 390, 412]) {
  test(`#600 OB-229 removing a photo shows Undo and deletes only after the window (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    const deletes: string[] = []
    page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))
    const sheet = await openPhotos(page)
    const remove = sheet.getByRole('button', { name: 'Remove photo 1' })
    // The photo is still scaling in, so check the target's own size, not its animated box.
    await expect(remove).toHaveCSS('width', '48px')
    await expect(remove).toHaveCSS('height', '48px')

    await remove.click()
    // Gone from the screen, Undo offered, nothing deleted yet.
    await expect(sheet.getByRole('button', { name: 'Remove photo 1' })).toHaveCount(0)
    const undo = page.getByRole('button', { name: 'Undo', exact: true })
    await expect(undo).toBeVisible()
    await expect(undo).toHaveCSS('min-height', '48px')
    expect(deletes).toHaveLength(0)
    expect(await gallerySize(page)).toBe(1)

    // Undo brings it back and it is never deleted.
    await undo.click()
    await expect(sheet.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
    await expect(undo).toHaveCount(0)
    expect(deletes).toHaveLength(0)
    expect(await gallerySize(page)).toBe(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('#600 OB-229 a removed photo is deleted for good once the undo window has passed', async ({
  page,
}) => {
  const sheet = await openPhotos(page)
  await sheet.getByRole('button', { name: 'Remove photo 1' }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
  expect(await gallerySize(page)).toBe(1)
  await expect.poll(() => gallerySize(page), { timeout: 15_000 }).toBe(0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)
  await expect(sheet.getByText('0 of 12 photos')).toBeVisible()
})

for (const width of [360, 390, 412]) {
  test(`#601 OB-230 the mic offline explains itself and returns to idle (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await localOnly(page)
    await ownerTools(page)
    await page.getByRole('button', { name: 'Coach', exact: true }).click()
    await page.context().setOffline(true)
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)
    const talk = page.getByRole('button', { name: 'Press to talk' })
    await talk.click()
    await expect(
      page.getByText('Voice needs a connection. Type your message instead.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stop voice' })).toHaveCount(0)
    await expect(talk).toBeVisible()
    expect((await talk.boundingBox())!.height).toBeGreaterThanOrEqual(48)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
