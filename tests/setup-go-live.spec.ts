import { expect, test, type Page } from '@playwright/test'
import { FIRST_QUESTION, FIRST_QUESTION_HI } from './newShopTopics.js'
import { enter, localOnly } from './stories/support.js'
import { shopMore } from './support/shopMore.js'

// Persona runs, 8 Nov (Ramesh, Priya, Ahmed): setup and going live without getting stuck.
test.use({ reducedMotion: 'reduce', locale: 'en-IN', timezoneId: 'Asia/Kolkata' })

const HI_COPY = {
  continuePreview: 'स्थानीय प्रीव्यू जारी रखें',
  acceptTerms: 'मैं शर्तों से सहमत हूँ',
  acceptPrivacy: 'मैंने गोपनीयता सूचना पढ़ी है',
  agree: 'सहमत होकर आगे बढ़ें',
  firstTitle: 'अपनी दुकान ऑनलाइन लाएँ',
}

async function openSetup(page: Page, language: 'en' | 'hi') {
  await localOnly(page)
  await page.addInitScript((language) => {
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
  }, language)
  if (language === 'hi') {
    await page.goto('/')
    await page.getByRole('button', { name: HI_COPY.continuePreview }).click()
    await page.getByLabel(HI_COPY.acceptTerms).check()
    await page.getByLabel(HI_COPY.acceptPrivacy).check()
    await page.getByRole('button', { name: HI_COPY.agree }).click()
    await page.getByRole('button', { name: 'दुकान का नाम लिखें' }).click()
    await page.getByRole('button', { name: 'शुरू करें', exact: true }).click()
  } else {
    await enter(page)
    await page.getByRole('button', { name: 'Type your shop name' }).click()
    await page.getByRole('button', { name: 'Let’s begin', exact: true }).click()
  }
  await expect(page.getByRole('log')).toContainText(
    language === 'hi' ? FIRST_QUESTION_HI : FIRST_QUESTION,
  )
}

const coachLines = (page: Page) =>
  page.getByRole('log').locator('li').filter({ hasNotText: /^$/ }).allInnerTexts()

for (const language of ['en', 'hi'] as const) {
  test(`setup never loops: Skip moves on and two misses offer taps (${language})`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openSetup(page, language)
    const words =
      language === 'hi'
        ? { send: 'भेजें', message: 'संदेश', skip: 'छोड़ें', typeIt: 'इसके बजाय टाइप करें' }
        : { send: 'Send', message: 'Message', skip: 'Skip', typeIt: 'Type it in instead' }
    // An answer the offline coach cannot use (Ramesh typed everything in one Hindi message).
    await page
      .getByLabel(words.message, { exact: true })
      .fill(language === 'hi' ? 'पता नहीं, आप बताइए क्या करें?' : 'Not sure, what should I do?')
    await page.getByRole('button', { name: words.send, exact: true }).click()
    const skip = page.getByRole('button', { name: words.skip, exact: true })
    await expect(skip).toBeEnabled()
    const before = (await coachLines(page)).at(-1)
    await skip.click()
    // Skip moves on: the next coach line is a different question, never the same one again.
    await expect.poll(async () => (await coachLines(page)).length).toBeGreaterThan(3)
    await expect(skip).toBeEnabled()
    const after = (await coachLines(page)).at(-1)
    expect(after).not.toBe(before)
    // Two turns in a row understood nothing: the rest is offered as taps.
    const stuck = page.getByTestId('setup-stuck')
    await expect(stuck).toBeVisible()
    await stuck.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`setup-stuck-${language}.png`) })
    await stuck.getByRole('button', { name: words.typeIt }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(stuck).toHaveCount(0)
  })
}

async function seedUnpinnedShop(page: Page, name: string) {
  const prepared = await page.request.post('/api/v1/proposals', {
    data: {
      kind: 'business',
      business: {
        name,
        category: 'Bakery',
        location: '',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
      },
      products: [{ name: 'Brownie', price: 8000, unit: 'piece', category: 'Bakes' }],
    },
  })
  expect(prepared.ok()).toBe(true)
  const proposal = await prepared.json()
  expect(
    (
      await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
        data: { digest: proposal.digest },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
}

test('going live: type the area, show only the area, one switch makes the shop visible', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  const name = `Priya's Bakes ${crypto.randomUUID().slice(0, 6)}`
  await seedUnpinnedShop(page, name)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()

  // The sold-out sheet never promises "Customers see it straight away" while they cannot.
  await page.getByRole('button', { name: /^Sold out/ }).click()
  const soldOut = page.getByRole('dialog', { name: 'Sold out' })
  await expect(soldOut).toContainText('Customers will see it once your shop is visible')
  await expect(soldOut).not.toContainText('straight away')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Your shop page/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Your shop page', exact: true })
  const live = sheet.getByRole('switch', { name: 'Customers can see my shop' })
  await expect(live).not.toBeChecked()
  await expect(sheet).toContainText('First say where customers can find you')
  // The area is typed; the map opens in India (Ahmed: it opened in Singapore).
  await sheet.getByLabel('Type your area or address').fill('Tolichowki, Hyderabad')
  await sheet.getByRole('button', { name: 'Find', exact: true }).click()
  await expect(sheet.getByTestId('pin-map')).toBeVisible()
  await expect(sheet).not.toContainText('Tiong Bahru')
  await sheet.getByRole('checkbox', { name: 'Show only my area, not my exact address' }).check()
  await page.screenshot({ path: test.info().outputPath('go-live-area.png') })
  await sheet.getByRole('button', { name: 'This is my shop', exact: true }).click()
  // One step: the place is saved and the shop shown, without a second review or switch.
  await expect(live).toBeChecked()
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toHaveCount(0)
  const shop = (await (await page.request.get('/api/v1/businesses')).json()).find(
    (s: { fields: { name: string } }) => s.fields.name === name,
  )
  expect(shop.public).toBe(true)
  expect(shop.fields.pin_source).toBe('area')
  expect(shop.fields.lat).toBeCloseTo(17.39, 2)
  expect(shop.fields.lng).toBeCloseTo(78.49, 2)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Sold out/ }).click()
  await expect(page.getByRole('dialog', { name: 'Sold out' })).toContainText(
    'Customers see it straight away',
  )
})

async function openBilling(page: Page) {
  await localOnly(page)
  await enter(page)
  await seedUnpinnedShop(page, `Ahmed Kirana ${crypto.randomUUID().slice(0, 6)}`)
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await shopMore(page)
  const row = page.getByRole('button', { name: /Link your billing app/i })
  await row.click()
  const connect = page.getByRole('dialog', { name: 'Link your billing app' })
  await connect.getByRole('button', { name: 'Petpooja', exact: true }).click()
  const upload = async (csv: string) => {
    await connect.getByTestId('connector-file').setInputFiles({
      name: 'sales.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    })
    await expect(connect.getByText('Column mapping')).toBeVisible()
    await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  }
  return { row, connect, upload }
}

test('billing import reads Indian dates (07/11/2026)', async ({ page }) => {
  test.setTimeout(90_000)
  const { connect, upload } = await openBilling(page)
  await upload(
    [
      'Date,Item,Qty,Net Sales',
      '07/11/2026,Toor Dal 1kg,9,1350',
      '08/11/2026,Toor Dal 1kg,4,600',
    ].join('\n'),
  )
  await expect(page.getByText('Toor Dal 1kg').first()).toBeVisible()
  await expect(connect.getByText('Could not complete sync')).toHaveCount(0)
})

test('billing import explains the rows it cannot read, and a failed sync is not a link', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { row, connect, upload } = await openBilling(page)
  await upload(
    [
      'Date,Item,Qty,Net Sales',
      '31/02/2026,Toor Dal 1kg,9,1350',
      '07/11/2026,Sugar 1kg,2,abc',
    ].join('\n'),
  )
  const problem = connect.getByRole('alert').filter({ hasText: 'Nothing was saved' })
  await expect(problem).toContainText('Nothing was saved: 2 rows could not be read')
  await expect(problem).toContainText('Date "31/02/2026" (Toor Dal 1kg)')
  await expect(problem).toContainText('Amount "abc" (Sugar 1kg)')
  await expect(connect).not.toContainText('Could not complete sync')
  await page.screenshot({ path: test.info().outputPath('import-bad-rows.png') })
  await connect.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(connect).toHaveCount(0)
  if (!(await row.isVisible())) await shopMore(page)
  await expect(row).toBeVisible()
  await expect(row).not.toContainText('Petpooja')
})
