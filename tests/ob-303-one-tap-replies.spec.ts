import { expect, test, type Page } from '@playwright/test'

// OB-303 "a customer is waiting": one-tap replies in the owner's chosen language (owner rule,
// 9 Nov), ✓ Sent, human times, "See translation" only for another language and "You:" on the
// shop's own last line.
test.setTimeout(120_000)

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `ob303-${info.testId}` })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

async function openMessages(page: Page, language: 'en' | 'hi' = 'en') {
  if (language !== 'en')
    await page.addInitScript((language) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
    }, language)
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: language === 'hi' ? 'छोड़ें' : 'Skip', exact: true })
    .click({ timeout: 40_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('[data-tour="nav-shop"]').click()
  await page.getByRole('button', { name: language === 'hi' ? /^संदेश/ : /^Messages/ }).click()
  return page.getByRole('dialog')
}

test('OB-303 the demo drafts three replies; a tap fills the box and Send shows ✓ Sent', async ({
  page,
}) => {
  const paid: string[] = []
  page.on('request', (request) => {
    if (/generativelanguage|aiplatform|gemini/i.test(request.url())) paid.push(request.url())
  })
  const sheet = await openMessages(page)
  // The shop's own last line reads "You: …", never as if Wei wrote it.
  const wei = sheet.getByRole('button', { name: 'Open conversation: Wei' })
  await expect(wei).toContainText('You: Yes, cash and the listed local payment method')
  await expect(sheet.getByRole('button', { name: 'Open conversation: Priya' })).not.toContainText(
    'You:',
  )
  // The language picker no longer sits beside the conversation (You → Language keeps it).
  await expect(sheet.getByRole('combobox')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Open conversation: Priya' }).click()
  const log = sheet.getByRole('log', { name: 'Conversation' })
  await expect(log.getByRole('listitem')).toHaveCount(1)
  // A human time in the shop's timezone, never "03/11/26, 12:00 am".
  await expect(log).toContainText(/Today, \d{1,2}:\d{2}\s[ap]m/i)
  await expect(log).not.toContainText(/\d{2}\/\d{2}\/\d{2}/)
  // An English question in an English app: nothing to translate.
  await expect(log.getByRole('button', { name: 'See translation' })).toHaveCount(0)

  const drafts = sheet.getByRole('group', { name: 'Suggested replies' })
  const chips = drafts.getByRole('button')
  await expect(chips).toHaveCount(3)
  await expect(chips.first()).toHaveText(
    'Yes, Masala chai is available today: ₹20 per cup. Shall I keep one for you?',
  )
  const box = sheet.getByLabel('Reply', { exact: true })
  await chips.first().click()
  // A tap only fills the box; the owner can still change it, and nothing is sent yet.
  await expect(box).toHaveValue(
    'Yes, Masala chai is available today: ₹20 per cup. Shall I keep one for you?',
  )
  await expect(box).toBeFocused()
  await expect(log.getByRole('listitem')).toHaveCount(1)
  await box.press('End')
  await box.pressSequentially(' See you soon!')
  await sheet.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(log.getByRole('listitem')).toHaveCount(2)
  await expect(log).toContainText('Shall I keep one for you? See you soon!')
  await expect(log.getByText('Sent', { exact: true })).toBeVisible()
  await expect(box).toHaveValue('')
  // Once the shop has replied there is nothing left to draft.
  await expect(drafts).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Open conversation: Priya' })).toContainText(
    'You: Yes, Masala chai is available today',
  )
  expect(paid).toEqual([])
})

test('OB-303 in Hindi: drafts are in the shop language, translation only for another language, 360 px', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone width')
  await page.setViewportSize({ width: 360, height: 800 })
  const sheet = await openMessages(page, 'hi')
  await expect(sheet.getByRole('button', { name: 'बातचीत खोलें: Wei' })).toContainText('आप: ')
  await sheet.getByRole('button', { name: 'बातचीत खोलें: Priya' }).click()
  const log = sheet.getByRole('log', { name: 'बातचीत' })
  // Priya wrote in English; the shop chose Hindi, so what it will send reads in Hindi.
  const chips = sheet.getByRole('group', { name: 'सुझाए गए जवाब' }).getByRole('button')
  await expect(chips).toHaveCount(3)
  await expect(chips.first()).toContainText('जी हाँ, मसाला चाय आज मिल रहा है: ₹20 प्रति कप')
  for (const chip of await chips.all()) await expect(chip).not.toContainText(/\b(?:Yes|today)\b/)
  // Her English words in a Hindi app can be translated; the time is Hindi too.
  await expect(log.getByRole('button', { name: 'अनुवाद देखें' })).toHaveCount(1)
  await expect(log).toContainText(/आज, /)
  await expect(log).not.toContainText(/\b(?:AM|PM|am|pm)\b/)
  await chips.nth(1).click()
  await sheet.getByRole('button', { name: 'संदेश भेजें', exact: true }).click()
  await expect(log.getByRole('listitem')).toHaveCount(2)
  await expect(log.getByText('भेजा गया', { exact: true })).toBeVisible()
  // Never on the owner's own message.
  await expect(log.getByRole('button', { name: 'अनुवाद देखें' })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const sheetBox = await sheet.boundingBox()
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(360)
})

test('OB-303 at 360 px in English the drafts and the reply box fit without side scrolling', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone width')
  await page.setViewportSize({ width: 360, height: 800 })
  const sheet = await openMessages(page)
  await sheet.getByRole('button', { name: 'Open conversation: Priya' }).click()
  const chips = sheet.getByRole('group', { name: 'Suggested replies' }).getByRole('button')
  await expect(chips).toHaveCount(3)
  for (const chip of await chips.all()) {
    const box = await chip.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(360)
    expect(box!.height).toBeGreaterThanOrEqual(40)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
