import {
  capture,
  visibleAction,
  copyFor,
  noOverflow,
  keyboard,
  phones,
  guidedAnswers,
  guidedSteps,
  personas,
  registerLargeTextCases,
  registerStandardMotionCases,
  registerReviewViewportCases,
} from './onboardPhoneSupport.js'
import { expect, test, type Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { enter, image, inChatFixtures, localOnly } from './stories/support.js'
import { FIRST_QUESTION } from './newShopTopics.js'
import { suggestShopPin } from './pinSupport.js'

test.use({
  reducedMotion: 'reduce',
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  viewport: { width: 390, height: 844 },
})
test.setTimeout(90_000)
// A phone battle test: the phone project only (desktop companion cases set their own size).
test.skip(({ isMobile }) => !isMobile, 'phone project only')

async function open(page: Page) {
  await localOnly(page)
  await enter(page)
  await page.getByRole('button', { name: 'Type your shop name' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)
}

async function resumeLocal(page: Page) {
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const hero = page.getByRole('button', { name: 'Let’s begin' })
  await expect(page.getByTestId('new-shop-flow')).toBeVisible()
  if (await hero.isVisible()) await hero.click()
}

test('OB-300 visual viewport keyboard keeps the send action visible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page)
  await page.getByLabel('Message', { exact: true }).fill('Our neighbourhood tea stall')
  // Chromium emulation has no OS keyboard: contract-test the visual viewport contraction.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => 460 })
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await capture(page, 'OB-300-keyboard-360')
  await visibleAction(page, page.getByRole('button', { name: 'Send', exact: true }), 460)
})

// Every phone, language, appearance and shop with ONBOARD_MATRIX=full (54 journeys); by default
// one journey per row below still covers 360/390/412, en/hi/ta, light/dark and all three shops.
const journeys =
  process.env.ONBOARD_MATRIX === 'full'
    ? phones.flatMap((viewport) =>
        (['en', 'hi', 'ta'] as const).flatMap((language) =>
          (['light', 'dark'] as const).flatMap((appearance) =>
            personas.map((persona) => ({ viewport, language, appearance, persona })),
          ),
        ),
      )
    : (
        [
          [0, 'en', 'light', 0],
          [0, 'hi', 'dark', 1],
          [1, 'en', 'dark', 2],
          [1, 'hi', 'light', 0],
          [2, 'ta', 'light', 0],
        ] as const
      ).map(([phone, language, appearance, persona]) => ({
        viewport: phones[phone]!,
        language,
        appearance,
        persona: personas[persona]!,
      }))
for (const { viewport, language, appearance, persona } of journeys)
  test(`OB-300 OB-291 OB-292 OB-293 OB-294 OB-296 OB-298 OB-303 OB-304 OB-306 matrix ${viewport.width} ${language} ${appearance} ${persona.id}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)
    await localOnly(page)
    await suggestShopPin(page, {
      lat: 12.9716,
      lng: 77.6412,
      label:
        language === 'hi'
          ? 'इंदिरानगर, बेंगलुरु'
          : language === 'ta'
            ? 'இந்திராநகர், பெங்களூரு'
            : 'Indiranagar, Bengaluru',
    })
    const [name, kind] = persona[language]
    const tag = `${viewport.width}-${language}-${appearance}-${persona.id}`
    await page.addInitScript(
      ({ language, appearance }) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language, appearance }))
        localStorage.setItem('ogoogle.speakReplies', '0')
        // These journeys use text; media failure/recovery and live-socket fixtures are
        // covered separately, without inventing a microphone on the audit machine.
        Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
        navigator.geolocation.getCurrentPosition = (_success, failure) =>
          failure?.({ code: 1 } as GeolocationPositionError)
      },
      { language, appearance },
    )
    const { copy, flow, guided, optional } = await copyFor(page, language)
    await enter(page, copy)
    await capture(page, `${tag}-0-first-today`)
    // First run (#663): Scan is the one filled action; typing the name is the text button.
    const scan = page.getByRole('button', { name: copy.scan, exact: true })
    await expect(scan).toHaveClass(/MuiButton-contained/)
    await visibleAction(page, scan)
    await visibleAction(page, page.getByRole('button', { name: copy.addShop }))
    await page.getByRole('button', { name: copy.addShop }).click()
    await capture(page, `${tag}-1-hero`)
    await noOverflow(page)
    await visibleAction(page, page.getByRole('button', { name: flow.begin }))
    await page.reload()
    await page.getByRole('button', { name: copy.continuePreview }).click()
    await page.getByRole('button', { name: flow.begin }).click()
    await expect(page.getByRole('log')).not.toBeEmpty()

    // Four-times CPU throttling after initial local module compilation.
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const say = async (text: string) => {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: (500 * 1024) / 8,
        uploadThroughput: (500 * 1024) / 8,
      })
      const input = page.getByRole('textbox', { name: copy.message, exact: true })
      await input.fill(text)
      await input.focus()
      const edge = viewport.height - 340
      await keyboard(page, edge)
      await noOverflow(page)
      await expect(async () =>
        visibleAction(page, page.getByRole('button', { name: copy.send, exact: true }), edge),
      ).toPass()
      await keyboard(page, null)
      await page.getByRole('button', { name: copy.send, exact: true }).click()
    }
    const reload = async () => {
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      await page.reload()
      await page.getByRole('button', { name: copy.continuePreview }).click()
      // 4x CPU stays on across the reload: the dev server's cold modules take longer.
      await expect(page.getByRole('textbox', { name: copy.message, exact: true })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('progressbar')).toHaveCount(0)
    }
    await say(`name: ${name}`)
    await expect(page.getByTestId('shop-so-far')).toContainText(name!)
    await reload()
    await expect(page.getByTestId('shop-so-far')).toContainText(name!)
    await capture(page, `${tag}-2-name-reloaded`)
    await say(`category: ${kind}`)
    await expect(page.getByTestId('shop-so-far')).toContainText(kind!)
    await reload()
    await page.getByTestId('review-my-shop').click()
    await expect(page.getByTestId('draft-summary')).toContainText(name!)
    await capture(page, `${tag}-3-review`)
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('shop-so-far')).toContainText(name!)
    // Denied location still allows a written address.
    await page.getByRole('button', { name: flow.location, exact: true }).click()
    await expect(page.getByRole('log')).toContainText(copy.locationDenied)
    const address =
      language === 'en'
        ? 'Indiranagar, near the neighbourhood park, opposite the old community hall, Bengaluru'
        : language === 'hi'
          ? 'इंदिरानगर, मोहल्ले के पार्क के पास, पुराने सामुदायिक भवन के सामने, बेंगलुरु'
          : 'இந்திராநகர், பூங்காவுக்கு அருகில், சமூகக் கூடத்திற்கு எதிரில், பெங்களூரு'
    await say(`location: ${address}`)
    if (language === 'ta')
      await page
        .getByTestId('map-card')
        .getByRole('button', { name: guided.confirmPin, exact: true })
        .click()
    await expect(page.getByTestId('shop-live')).toBeVisible()
    await reload()
    await expect(page.getByTestId('shop-so-far')).toContainText(name!)
    await expect(page.locator('[data-testid="map-card"][data-state="open"]')).toHaveCount(0)
    await capture(page, `${tag}-4-place`)
    await page.getByTestId('review-my-shop').click()
    await expect(page.getByTestId('draft-summary')).toContainText(
      language === 'hi'
        ? 'आपकी दुकान लाइव है'
        : language === 'ta'
          ? 'உங்கள் கடை நேரலையில் உள்ளது'
          : 'Your shop is live',
    )
    await capture(page, `${tag}-4-live-review`)
    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const hours =
      language === 'hi'
        ? 'सुबह 7 से रात 9 बजे तक'
        : language === 'ta'
          ? 'காலை 7 முதல் இரவு 9 வரை'
          : '7 am to 9 pm'
    await say(`hours: ${hours}`)
    await expect(page.getByTestId('shop-so-far')).toContainText(hours)
    await reload()
    await expect(page.getByTestId('shop-so-far')).toContainText(hours)
    await capture(page, `${tag}-5-hours`)
    await page
      .getByTestId('camera-card')
      .getByRole('button', { name: optional.skipForNow, exact: true })
      .click()
    await expect(page.getByTestId('shop-summary')).toBeVisible()
    if (language === 'hi')
      await expect(page.getByTestId('shop-summary')).not.toContainText(
        /Today|Your shop|Saved|Opening hours|Shop photo/,
      )
    await expect(page.getByTestId('shop-summary')).not.toContainText(
      /\d{1,3}\.\d{4,},\s*-?\d{1,3}\.\d{4,}/,
    )
    await expect(
      page
        .getByTestId('shop-summary')
        .getByRole('button', { name: optional.faceStart, exact: true }),
    ).toHaveCount(0)
    await capture(page, `${tag}-5-summary`)
    await reload()
    await expect(page.getByTestId('shop-summary')).toBeVisible()
    await page
      .getByTestId('shop-summary')
      .getByRole('button', { name: optional.done, exact: true })
      .click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name!)
    if (language === 'ta')
      await expect(page.getByRole('heading', { level: 1 })).toContainText(flow.ready)
    await expect(page.locator('summary')).toHaveText(copy.share)
    const primary = page.getByRole('button', { name: copy.newShopContinue, exact: true })
    await visibleAction(page, primary)
    await noOverflow(page)
    await capture(page, `${tag}-5-ready`)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    await page.reload()
    await page.getByRole('button', { name: copy.continuePreview }).click()
    // Still at 4x CPU, like reload() above.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name!, { timeout: 15_000 })
    await page.getByRole('button', { name: copy.newShopContinue, exact: true }).click()
    await expect(page.getByTestId('today-day-one')).toBeVisible()
    const next = page.getByTestId('today-day-one').locator('button.MuiButton-contained')
    const composer = await page
      .getByRole('textbox', { name: copy.message, exact: true })
      .boundingBox()
    await visibleAction(page, next, composer!.y - 8)
    await noOverflow(page)
    await capture(page, `${tag}-6-coach-today`)
    const saved = await (await page.request.get('/api/v1/businesses')).json()
    expect(saved).toHaveLength(1)
    expect(saved[0].fields).toMatchObject({ name, category: kind })
    expect(saved[0].fields.location).toBe(address)
    expect(saved[0].fields.hours).toBe(hours)
    await cdp.detach()
  })

test('OB-291 unsent guided name survives reload and return to the form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.getByRole('button', { name: 'Type it in instead' }).click()
  await page.getByRole('textbox', { name: 'Shop name', exact: true }).fill('Our home bakery')
  await capture(page, 'OB-291-guided-390')
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(
    page.getByTestId('guided-details').or(page.getByRole('button', { name: 'Let’s begin' })),
  ).toBeVisible()
  if (await page.getByRole('button', { name: 'Let’s begin' }).isVisible())
    await page.getByRole('button', { name: 'Let’s begin' }).click()
  if (!(await page.getByTestId('guided-details').isVisible()))
    await page.getByRole('button', { name: 'Type it in instead' }).click()
  await capture(page, 'OB-291-guided-reloaded-390')
  await expect(page.getByRole('textbox', { name: 'Shop name', exact: true })).toHaveValue(
    'Our home bakery',
  )
})

test('OB-292 ready moment keeps Continue in the phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page)
  await page
    .getByLabel('Message', { exact: true })
    .fill('name: Neighbourhood Kirana; category: Grocery; location: Indiranagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await page.getByTestId('end-conversation').click()
  await page.getByTestId('finish-review').click()
  await expect(page.getByRole('heading', { name: /Congratulations/ })).toBeVisible()
  await capture(page, 'OB-292-ready-360')
  await visibleAction(page, page.getByRole('button', { name: 'Continue with my shop' }))
})

for (const width of [360, 390])
  for (const language of ['en', 'hi'] as const)
    test(`OB-300 OB-291 OB-293 OB-307 guided ${width} ${language}: keyboard, reload and Back at every question`, async ({
      page,
      context,
    }) => {
      test.setTimeout(240_000)
      await localOnly(page)
      await page.setViewportSize({ width, height: width === 360 ? 800 : 844 })
      await page.addInitScript((language) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
        localStorage.setItem('ogoogle.speakReplies', '0')
        Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
      }, language)
      const { copy, flow, guided: c } = await copyFor(page, language)
      await enter(page, copy)
      await page.getByRole('button', { name: copy.addShop }).click()
      await page.getByRole('button', { name: flow.begin }).click()
      await page.getByRole('button', { name: c.typeItIn }).click()
      const answers = guidedAnswers(language)
      const steps = guidedSteps
      for (const [at, step] of steps.entries()) {
        await expect(page.getByTestId('guided-details')).toHaveAttribute('data-step', step)
        if (step === 'products')
          await expect(
            page.getByRole('combobox', { name: copy.currency, exact: true }),
          ).not.toContainText(/\b[A-Z]{3}\b/)
        expect(
          await page
            .getByRole('navigation')
            .getByRole('button')
            .evaluateAll((buttons) =>
              buttons.every((button) => button.getBoundingClientRect().height >= 48),
            ),
        ).toBe(true)
        const text = answers[step]
        if (text) {
          const input =
            step === 'payment' || step === 'delivery'
              ? page.getByRole('combobox')
              : step === 'hours'
                ? page.getByRole('textbox').last()
                : page.getByRole('textbox').first()
          await input.fill(text)
          if (step === 'products') await page.getByRole('textbox').nth(1).fill('25')
          await input.focus()
          await keyboard(page, 460)
          await expect(async () =>
            visibleAction(
              page,
              page.getByRole('button', { name: at === 7 ? flow.review : c.next, exact: true }),
              460,
            ),
          ).toPass()
          await noOverflow(page)
          await capture(page, `${width}-${language}-guided-${step}-keyboard`)
          await keyboard(page, null)
          await input.blur()
        }
        await capture(page, `${width}-${language}-guided-${step}`)
        await page.reload()
        await page.getByRole('button', { name: copy.continuePreview }).click()
        await expect(page.getByTestId('guided-details')).toHaveAttribute('data-step', step)
        if (step === 'payment') await expect(page.getByTestId('guided-details')).toContainText(text)
        else if (step === 'delivery') await expect(page.getByRole('combobox')).toHaveValue(text)
        else
          await expect(
            step === 'hours' ? page.getByRole('textbox').last() : page.getByRole('textbox').first(),
          ).toHaveValue(text)
        if (at > 0) {
          await page.getByRole('button', { name: c.back, exact: true }).click()
          await expect(page.getByTestId('guided-details')).toHaveAttribute(
            'data-step',
            steps[at - 1]!,
          )
          await page.getByRole('button', { name: c.next, exact: true }).click()
        }
        // Browser Back leaves the form; opening it again resumes the same question and edits.
        await page.goBack()
        await expect(page.getByRole('log')).toBeVisible()
        await page.getByRole('button', { name: c.typeItIn }).click()
        await expect(page.getByTestId('guided-details')).toHaveAttribute('data-step', step)
        if (step === 'payment') await expect(page.getByTestId('guided-details')).toContainText(text)
        else if (step === 'delivery') await expect(page.getByRole('combobox')).toHaveValue(text)
        else
          await expect(
            step === 'hours' ? page.getByRole('textbox').last() : page.getByRole('textbox').first(),
          ).toHaveValue(text)
        if (at < 7) await page.getByRole('button', { name: c.next, exact: true }).click()
      }
      // A step works without a network; its unsent changes survive reconnection and reload.
      await context.setOffline(true)
      await page
        .getByRole('navigation')
        .getByRole('button', { name: c.stepNames.name, exact: true })
        .click()
      await page.getByRole('textbox').fill(answers.name + ' 2')
      await context.setOffline(false)
      await page.reload()
      await page.getByRole('button', { name: copy.continuePreview }).click()
      await expect(page.getByRole('textbox')).toHaveValue(answers.name + ' 2')
    })

test('OB-291 an offline message keeps its exact text for retry and reload', async ({ page }) => {
  await open(page)
  const message = 'name: My unsent tea stall'
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(message)
  // The connection drops for the send. (Whole-context offline also fails the dev server's
  // on-demand screen modules, which production precaches.)
  await page.route('**/api/v1/coach/stream', (route) => route.abort('internetdisconnected'))
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(message)
  await capture(page, 'OB-291-offline')
  await page.unroute('**/api/v1/coach/stream')
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(message)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-so-far')).toContainText('My unsent tea stall')
})

test('OB-295 uploaded shop photo survives reload and is offered to the gallery', async ({
  page,
}) => {
  await inChatFixtures(page, 'denied')
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  await open(page)
  await page.route('**/api/v1/photos?*', (route) =>
    route.fulfill({
      json: {
        status: 'nothing_to_propose',
        photo_kind: 'storefront',
        proposal: null,
        extraction: {
          uncertain: [],
          business: { name: '', category: '', location: '', hours: '', phone: '' },
          products: [],
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'Shop photo', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (await chooser).setFiles(await image(page))
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
  await page.reload()
  await resumeLocal(page)
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('name: Family Bakery; category: Bakery; location: Indiranagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await page.getByTestId('end-conversation').click()
  await page.getByTestId('finish-review').click()
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  await expect(page.getByText('Add this photo to your shop gallery?')).toBeVisible()
  await capture(page, 'OB-295-photo-gallery')
})

for (const width of [360, 390])
  for (const language of ['en', 'hi'] as const)
    test(`OB-300 OB-291 slow 3G 4x CPU ${width} ${language}`, async ({ page, context }) => {
      await localOnly(page)
      await page.setViewportSize({ width, height: 844 })
      await page.addInitScript((language) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
        Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
      }, language)
      const { copy, flow: f } = await copyFor(page, language)
      await enter(page, copy)
      await page.getByRole('button', { name: copy.addShop }).click()
      await page.getByRole('button', { name: f.begin }).click()
      await expect(page.getByRole('log')).not.toBeEmpty()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      // Slow-3G interaction profile: 400ms latency, 500kbps down/up. Cold dev-module
      // loading is deliberately outside this interaction test, not a production LCP claim.
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: (500 * 1024) / 8,
        uploadThroughput: (500 * 1024) / 8,
      })
      await page
        .getByRole('textbox', { name: copy.message, exact: true })
        .fill('name: Slow Network Bakery')
      await keyboard(page, 460)
      await expect(async () =>
        visibleAction(page, page.getByRole('button', { name: copy.send, exact: true }), 460),
      ).toPass()
      await capture(page, `${width}-${language}-slow-3g-keyboard`)
      await keyboard(page, null)
      await page.getByRole('button', { name: copy.send, exact: true }).click()
      await expect(page.getByTestId('shop-so-far')).toContainText('Slow Network Bakery', {
        timeout: 30_000,
      })
      await noOverflow(page)
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      await cdp.detach()
    })

test('OB-291 reload while sending keeps the unacknowledged answer', async ({ page }) => {
  await open(page)
  await page.route('**/api/v1/coach/stream', () => undefined)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('name: Still on its way')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.reload()
  await page.unroute('**/api/v1/coach/stream')
  await resumeLocal(page)
  try {
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
      'name: Still on its way',
    )
  } finally {
    await capture(page, 'OB-291-inflight-reload')
  }
})

test('OB-295 captured preview survives reload before Use photo', async ({ page }) => {
  await inChatFixtures(page)
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioWorkletNode', { value: undefined }),
  )
  await open(page)
  await page.getByRole('button', { name: 'Shop photo', exact: true }).click()
  await page.getByTestId('camera-card').getByRole('button', { name: 'Open camera' }).click()
  await expect(page.getByTestId('camera-modal')).toHaveAttribute('data-phase', 'live')
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Take photo', exact: true }).click()
  await expect(page.getByTestId('camera-modal')).toHaveAttribute('data-phase', 'preview')
  await page.reload()
  await resumeLocal(page)
  try {
    await expect(page.getByTestId('camera-modal')).toHaveAttribute('data-phase', 'preview')
  } finally {
    await capture(page, 'OB-295-preview-reloaded')
  }
  await page.getByRole('button', { name: 'Retake', exact: true }).click()
  await expect(page.getByTestId('camera-modal')).toHaveAttribute('data-phase', 'live')
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Take photo', exact: true }).click()
  await page.route('**/api/v1/photos?*', (route) => route.abort())
  await page.getByRole('button', { name: 'Use photo', exact: true }).click()
  const failure = page.getByTestId('photo-read-error')
  await expect(failure).toBeVisible()
  try {
    await expect(failure.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    // The full-screen camera has closed before the card is measured.
    await expect(page.getByTestId('camera-modal')).toHaveCount(0)
    // The Use photo tap leaves the pointer over the composer's mute button: no hover tooltip.
    await page.mouse.move(0, 0)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  } finally {
    await capture(page, 'OB-295-photo-retry')
  }
  await page.unroute('**/api/v1/photos?*')
  await failure.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByTestId('shop-so-far')).toContainText('Photo added')
})

test('OB-294 review honestly names the shared shop state', async ({ page }) => {
  await open(page)
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('name: Corner Tea; category: Tea stall; location: Indiranagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await page.getByTestId('review-my-shop').click()
  await capture(page, 'OB-294-live-review')
  await expect(page.getByTestId('draft-summary')).toContainText('Your shop is live')
})

test('OB-291 OB-293 OB-301 typed review survives reload and honestly opens a private shop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await open(page)
  const { flow, guided } = await page.evaluate(async () => {
    const f = (await import('/src/features/v1/newShopCopy.ts' as string)) as {
      newShopCopyFor: (l: string) => { open: string; ready: string; review: string }
    }
    const c = (await import('/src/features/v1/inChatCopy.ts' as string)) as {
      inChatCopyFor: (l: string) => { typeItIn: string; stepNames: Record<string, string> }
    }
    return { flow: f.newShopCopyFor('en'), guided: c.inChatCopyFor('en') }
  })
  await page.getByRole('button', { name: guided.typeItIn }).click()
  const name = 'Our Family Home Bakery and Celebration Cakes'
  await page.getByRole('textbox', { name: 'Shop name', exact: true }).fill(name)
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.category, exact: true })
    .click()
  await page.getByRole('textbox').fill('Home bakery')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.location, exact: true })
    .click()
  await page
    .getByRole('textbox')
    .fill('Indiranagar, near the neighbourhood park, opposite the old community hall, Bengaluru')
  await page
    .getByRole('navigation')
    .getByRole('button', { name: guided.stepNames.delivery, exact: true })
    .click()
  await page.getByRole('button', { name: flow.review, exact: true }).click()
  await expect(page.getByTestId('new-shop-review')).toBeVisible()
  await capture(page, 'OB-293-typed-review')
  await visibleAction(page, page.getByRole('button', { name: flow.open, exact: true }))
  await page.reload()
  await resumeLocal(page)
  await expect(page.getByTestId('guided-details')).toBeVisible()
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(0)
  await page.getByRole('button', { name: flow.review, exact: true }).click()
  await expect(page.getByTestId('new-shop-review')).toContainText(name)
  await page.getByRole('button', { name: flow.open, exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(flow.ready)
  await expect(page.getByTestId('shop-link')).toHaveCount(0)
  await capture(page, 'OB-301-private-ready')
  const saved = await (await page.request.get('/api/v1/businesses')).json()
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({ public: false, fields: { name, category: 'Home bakery' } })
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  await expect(page.getByTestId('today-day-one')).toBeVisible()
})

for (const appearance of ['light', 'dark'] as const)
  test(`OB-292 OB-293 desktop companion ${appearance}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.addInitScript(
      (appearance) =>
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance })),
      appearance,
    )
    await open(page)
    await capture(page, `1440-${appearance}-conversation`)
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('name: Family Bakery; category: Bakery; location: Indiranagar')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByTestId('shop-live')).toBeVisible()
    await page.getByTestId('end-conversation').click()
    await page.getByTestId('finish-review').click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Congratulations')
    await visibleAction(page, page.getByRole('button', { name: 'Continue with my shop' }))
    await noOverflow(page)
    await capture(page, `1440-${appearance}-ready`)
  })

test('OB-291 tab recovery is account scoped and owner sign-out clears it', async ({ page }) => {
  await open(page)
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Keep this unfinished answer private')
  const result = await page.evaluate(async () => {
    const draft = (await import('/src/features/v1/onboardingDraft.ts' as string)) as {
      readOnboardingDraft: (scope: string, part: string) => { note: string } | null
    }
    return {
      same: draft.readOnboardingDraft('local-preview', 'chat')?.note,
      other: draft.readOnboardingDraft('another-test-account', 'chat'),
    }
  })
  expect(result).toEqual({ same: 'Keep this unfinished answer private', other: null })
  await page.evaluate(async () => {
    const session = (await import('/src/auth/clearSession.ts' as string)) as {
      clearSession: (side: string) => Promise<void>
    }
    await session.clearSession('owner')
  })
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('chalkboard.owner.onboarding.')),
    ),
  ).toEqual([])
})

registerStandardMotionCases(open)
registerReviewViewportCases()

test('OB-306 a shared shop first Today names the next task, its primary above the composer', async ({
  page,
}) => {
  await open(page)
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('name: Family Bakery; category: Bakery; location: Indiranagar')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('shop-live')).toBeVisible()
  await page.getByTestId('end-conversation').click()
  await page.getByTestId('finish-review').click()
  await page.getByRole('button', { name: 'Continue with my shop' }).click()
  const today = page.getByTestId('today-day-one')
  await expect(today).toBeVisible()
  await capture(page, 'OB-306-first-today')
  const primary = today.locator('button.MuiButton-contained')
  const composer = await page.getByRole('textbox', { name: 'Message', exact: true }).boundingBox()
  await visibleAction(page, primary, composer!.y - 8)
  await expect(today).not.toContainText('online')
})

registerLargeTextCases()
