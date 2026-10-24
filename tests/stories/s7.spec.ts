import { expect, test } from '@playwright/test'
import {
  closeSheet,
  catalogue,
  enter,
  gap,
  liveOnly,
  localOnly,
  menuRow,
  phone,
  seedShop,
  share,
  shot,
} from './support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')
test('S7 · Indian language, local currency and eight-city discovery audit', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  const url = await share(page)
  await closeSheet(page)
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await test.step('1 · Tamil language and read-aloud path', async () => {
    await page.getByRole('button', { name: 'You', exact: true }).click()
    // Stub only on-device speech output, so no audio hardware or cloud TTS is required.
    await page.evaluate(() => {
      const spoken: { lang: string; text: string }[] = []
      Object.defineProperty(window, '__storySpeech', { value: spoken })
      speechSynthesis.speak = (utterance) => {
        spoken.push({ lang: utterance.lang, text: utterance.text })
      }
    })
    await page.route('**/api/v1/tts', (route) => route.fulfill({ status: 503 }))
    await page.getByRole('switch', { name: 'Read replies aloud' }).check()
    await page.getByRole('combobox', { name: 'Language' }).click()
    await expect(page.getByRole('option', { name: /தமிழ்/ })).toBeVisible()
    gap(
      'S7/1: only 10 language choices in this snapshot; Hindi and the other planned Indian languages are worker-owned',
    )
    await page.getByRole('option', { name: /தமிழ்/ }).click()
    await shot(page, 7, '1-language')
    await closeSheet(page)
    await page.locator('[data-tour="nav-coach"]').click()
    await page.getByRole('textbox').fill('வணக்கம்')
    await page.getByRole('button', { name: 'அனுப்புங்கள்', exact: true }).click()
    await expect(page.getByRole('log')).toContainText('முன்பே எழுதிய பதில்')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __storySpeech: { lang: string }[] }).__storySpeech.at(-1)
              ?.lang,
        ),
      )
      .toBe('ta')
    gap(
      'S7/1: Tamil UI and speech locale work, but offline coach reply is English; speech stub does not prove audible Tamil',
    )
    liveOnly('Actual multilingual Gemini replies and audible TTS/ASR quality')
    await shot(page, 7, 1)
  })
  const customer = await context.newPage()
  await localOnly(customer)
  await test.step('2 · shop prices use INR on an Indian phone', async () => {
    await customer.goto(url)
    await expect(menuRow(customer, 'Kopi')).toContainText('₹18.00')
    await expect(customer.getByText('UPI', { exact: true })).toBeVisible()
    await shot(customer, 7, 2)
  })
  await test.step('3 · eight city demo discovery availability', async () => {
    await customer.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    const cities = [
      'Singapore',
      'Bengaluru',
      'Delhi',
      'Mumbai',
      'Kuala Lumpur',
      'Jakarta',
      'Tokyo',
      'Bangkok',
    ]
    // English keeps the city-error evidence legible; locale files remain worker-owned.
    const english = await context.browser()!.newContext({ ...phone })
    try {
      const discovery = await english.newPage()
      await localOnly(discovery)
      await discovery.addInitScript(() =>
        localStorage.setItem('chalkboard.customer.journey', 'done'),
      )
      await discovery.goto(`http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/explore/browse`)
      await expect(discovery.getByText('Demo data', { exact: true })).toBeVisible()
      await discovery.getByRole('button', { name: 'Change area' }).click()
      const place = discovery.getByRole('textbox', { name: 'City or area' })
      for (const city of cities) {
        // Typed loosely, found and named properly: the offline map knows every demo city.
        await place.fill(city.toLowerCase())
        await place.press('Enter')
        await discovery.getByRole('button', { name: 'Change area' }).click()
        await expect(place).toHaveValue(city)
        await expect(
          discovery.getByText('Couldn’t find that place. Try a city or neighbourhood name.', {
            exact: true,
          }),
        ).toHaveCount(0)
        await shot(discovery, 7, `3-${city.toLowerCase().replaceAll(' ', '-')}`)
      }
      liveOnly('Catalogue shops are seeded on the hosted demo; the local preview stays unseeded')
      expect(new Set(catalogue.map((entry) => entry.city)).size).toBe(8)
      for (const entry of catalogue) {
        await discovery.route(`**/api/v1/public/shops/${entry.shop.id}`, (route) =>
          route.fulfill({ json: entry.shop }),
        )
        await discovery.goto(
          `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}/explore/s/${entry.shop.id}`,
        )
        await expect(discovery.getByRole('heading', { name: entry.shop.name })).toBeVisible()
        await expect(discovery.getByText('Demo shop', { exact: true })).toBeVisible()
        await shot(discovery, 7, `3-${entry.city}-catalogue`)
      }
      await shot(discovery, 7, 3)
    } finally {
      await english.close()
    }
  })
})
