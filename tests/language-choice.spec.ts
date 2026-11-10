import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { localOnly } from './stories/support.js'

// Owner rule, 9 Nov: the owner app speaks the language the owner chose, and only that. The first
// language step selects the phone's language (never Hindi by default); the coach, reply drafts
// and reminders follow the app language; one Hindi word never switches it; a change applies at
// once. Offline demo: no model is called.
test.setTimeout(120_000)

const DEVANAGARI = /[ऀ-ॿ]/
const FRESH = { cookies: [], origins: [] }
// Before/after screenshots for the PR (set LANGUAGE_SHOTS to keep them out of the repo).
const SHOTS = process.env.LANGUAGE_SHOTS ?? 'test-results/language-shots'

test.beforeEach(async ({ context }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `language-${info.testId}-${Math.random()}`,
  })
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort()
  })
})

type Lang = 'en' | 'hi'
const WORDS = {
  en: { skip: 'Skip', box: 'Message', send: 'Send', messages: /^Messages/, priya: 'Priya' },
  hi: { skip: 'छोड़ें', box: 'संदेश', send: 'भेजें', messages: /^संदेश/, priya: 'Priya' },
}

async function openDemo(page: Page, language: Lang, appearance: 'light' | 'dark' = 'light') {
  await page.addInitScript(
    ([language, appearance]) =>
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language, appearance, languageChosen: true }),
      ),
    [language, appearance] as const,
  )
  await page.goto('/demo')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: WORDS[language].skip, exact: true })
    .click({ timeout: 40_000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('today')).toBeVisible({ timeout: 20_000 })
}

/** Sends one coach message; returns the log's text after it once the reply has settled (the
 * phone coach keeps only the latest reply on screen). */
async function say(page: Page, language: Lang, text: string) {
  const log = page.getByRole('log')
  const read = async () => ((await log.count()) ? await log.innerText() : '')
  const before = await read()
  await page.getByRole('textbox', { name: WORDS[language].box, exact: true }).fill(text)
  await page.getByRole('button', { name: WORDS[language].send, exact: true }).click()
  const after = async () => {
    const all = await read()
    const at = all.lastIndexOf(text)
    return all !== before && at >= 0 ? all.slice(at + text.length).trim() : ''
  }
  await expect.poll(async () => (await after()).length, { timeout: 30_000 }).toBeGreaterThan(20)
  let last = ''
  await expect
    .poll(
      async () => {
        const now = await after()
        const settled = now === last
        last = now
        return settled
      },
      { intervals: [500], timeout: 15_000 },
    )
    .toBe(true)
  return last
}

async function openPriya(page: Page, language: Lang) {
  await page.locator('[data-tour="nav-shop"]').click()
  await page.getByRole('button', { name: WORDS[language].messages }).click()
  const sheet = page.getByRole('dialog')
  await sheet
    .getByRole('button', {
      name: `${language === 'hi' ? 'बातचीत खोलें' : 'Open conversation'}: Priya`,
    })
    .click()
  const chips = sheet
    .getByRole('group', { name: language === 'hi' ? 'सुझाए गए जवाब' : 'Suggested replies' })
    .getByRole('button')
  await expect(chips).toHaveCount(3, { timeout: 20_000 })
  return chips
}

test('an English shop that writes Hindi is answered in English and stays English', async ({
  page,
}) => {
  await openDemo(page, 'en')
  // Hindi questions are understood and answered in English (#714 review): never "Sorry".
  for (const [message, answer] of [
    ['आज कितनी बिक्री हुई?', "Today's demo sales"],
    ['दूध कितना बचा है?', 'no stock count saved for milk'],
    ['मसाला चाय का दाम क्या है?', 'The demo price for Masala chai is ₹20'],
    ['सबसे ज़्यादा क्या बिका?', 'best sellers: Masala chai'],
  ]) {
    const reply = (await say(page, 'en', message)).replace(message, '')
    expect(reply, message).not.toMatch(DEVANAGARI)
    expect(reply, message).toContain(answer)
    expect(reply, message).not.toContain("Sorry, I didn't catch that")
  }
  // One Hindi word in an English sentence: still English.
  expect((await say(page, 'en', 'I need दूध')).replace('I need दूध', '')).not.toMatch(DEVANAGARI)
  // What it understood in Hindi is still done, in English.
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('समोसा ख़त्म हो गया')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText('Sold out', { timeout: 30_000 })
  await expect(review).not.toContainText(DEVANAGARI)
  await review.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Samosa: sold out')
  // The app itself never switched.
  await expect(page.locator('[data-tour="nav-shop"]')).toContainText('Shop')
  // Customer reply drafts are English too.
  const chips = await openPriya(page, 'en')
  for (const chip of await chips.all()) await expect(chip).not.toContainText(DEVANAGARI)
})

test('a Hindi shop that types English is answered in Hindi, drafts in Hindi', async ({ page }) => {
  await openDemo(page, 'hi')
  for (const message of ['what sold today?', 'kal kya banau?', 'sabse zyada kya bika?', 'hello']) {
    const reply = (await say(page, 'hi', message)).replace(message, '')
    expect(reply, message).toMatch(DEVANAGARI)
    expect(reply, message).not.toMatch(/Sorry|Next, open|Today’s demo sales|menu items/)
  }
  const chips = await openPriya(page, 'hi')
  await expect(chips.first()).toContainText('जी हाँ, मसाला चाय आज मिल रहा है')
})

test('changing the language by chat applies everywhere at once', async ({ page }) => {
  await openDemo(page, 'en')
  const reply = await say(page, 'en', 'Change language to Hindi')
  expect(reply).toContain('ग्राहकों को आपके जवाब हिंदी में हैं')
  // The app, the next coach turn and the reply drafts are Hindi straight away.
  await expect(page.locator('[data-tour="nav-shop"]')).toContainText('दुकान')
  expect((await say(page, 'hi', 'what sold today?')).replace('what sold today?', '')).toMatch(
    DEVANAGARI,
  )
  const chips = await openPriya(page, 'hi')
  await expect(chips.first()).toContainText('जी हाँ')
})

async function languageStep(browser: Browser, locale: string, timezoneId: string) {
  const context = await browser.newContext({
    locale,
    timezoneId,
    storageState: FRESH,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    for (const app of ['owner', 'customer'])
      localStorage.setItem(`chalkboard.explainer.${app}.v1`, '1')
  })
  await localOnly(page)
  await page.goto('/')
  // The sign-in page already follows the phone (a Hindi phone reads it in Hindi).
  await page
    .getByRole('button', { name: /^(?:Continue local preview|स्थानीय प्रीव्यू जारी रखें)$/ })
    .click({ timeout: 30_000 })
  return { context, page }
}

test.describe('the first language step', () => {
  for (const [locale, zone, chosen, title] of [
    // A phone in a language the app does not speak, in India: English, never Hindi by default.
    ['fr-FR', 'Asia/Kolkata', 'English', 'Choose your language'],
    ['en-IN', 'Asia/Kolkata', 'English', 'Choose your language'],
    // A Hindi phone: Hindi, because it is the phone's language.
    ['hi-IN', 'Asia/Kolkata', 'हिन्दी', 'अपनी भाषा चुनें'],
  ] as const) {
    test(`${locale} phone in India selects ${chosen}`, async ({ browser }) => {
      const { context, page } = await languageStep(browser, locale, zone)
      const choices = page.getByRole('radiogroup', { name: title })
      await expect(choices).toBeVisible({ timeout: 30_000 })
      await expect(choices.getByRole('radio', { name: chosen })).toBeChecked()
      // Hindi is still offered, one tap away.
      await expect(choices.getByRole('radio', { name: 'हिन्दी' })).toBeVisible()
      await context.close()
    })
  }
})

// Screenshots for the PR at 360x800 and 390x844, en + hi, light + dark. Each language writes in
// the other one, so the shot shows which language the reply came back in.
for (const language of ['en', 'hi'] as const)
  for (const appearance of ['light', 'dark'] as const)
    for (const [width, height] of [
      [360, 800],
      [390, 844],
    ] as const)
      test(`shots ${width} ${language} ${appearance}`, async ({ page, browser }) => {
        mkdirSync(SHOTS, { recursive: true })
        await page.setViewportSize({ width, height })
        await openDemo(page, language, appearance)
        const crossed = language === 'en' ? 'आज कितनी बिक्री हुई?' : 'what sold today?'
        await say(page, language, crossed)
        const tag = `${width}-${language}-${appearance}`
        await page.screenshot({ path: `${SHOTS}/1-coach-other-script-${tag}.png` })
        await openPriya(page, language)
        await page.screenshot({ path: `${SHOTS}/2-reply-drafts-${tag}.png` })
        if (width === 390 && appearance === 'light') {
          const phone = language === 'en' ? 'fr-FR' : 'hi-IN'
          const { context, page: step } = await languageStep(browser, phone, 'Asia/Kolkata')
          await expect(step.getByRole('radiogroup')).toBeVisible({ timeout: 30_000 })
          await step.screenshot({ path: `${SHOTS}/3-language-step-${phone}-390-light.png` })
          await context.close()
        }
      })
