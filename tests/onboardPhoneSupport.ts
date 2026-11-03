import { enter, localOnly } from './stories/support.js'
import { expect, test, type Page, type Locator } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const phase = process.env.ONBOARD_SHOTS ?? 'after'

export async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: process.env.ONBOARD_SHOT_DIR
      ? `${process.env.ONBOARD_SHOT_DIR}/${name}-${phase}.png`
      : test.info().outputPath(`${name}-${phase}.png`),
    animations: 'disabled',
  })
  const metrics = await page.evaluate(() => {
    const sizes = new Set<string>()
    const text: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const element = node.parentElement
      if (
        !element ||
        !node.textContent?.trim() ||
        element.closest('[aria-hidden="true"], script, style')
      )
        continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (element.closest('details:not([open])') && !element.closest('summary')) continue
      if (rect.width <= 2 || rect.height <= 2 || rect.bottom <= 0 || rect.top >= innerHeight)
        continue
      sizes.add(getComputedStyle(element).fontSize)
      text.push(node.textContent.trim())
    }
    const smallTargets = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, input, [role="button"]'),
    ).flatMap((el) => {
      const box = el.getBoundingClientRect()
      if (
        !box.width ||
        !box.height ||
        box.bottom < 0 ||
        box.top > innerHeight ||
        box.right < 0 ||
        box.left > innerWidth
      )
        return []
      return box.width < 48 || box.height < 48
        ? [
            {
              text: el.getAttribute('aria-label') ?? el.innerText,
              width: box.width,
              height: box.height,
            },
          ]
        : []
    })
    return {
      sizes: [...sizes],
      smallTargets,
      text,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
  if (process.env.ONBOARD_SHOT_DIR)
    writeFileSync(
      `${process.env.ONBOARD_SHOT_DIR}/${name}-${phase}.json`,
      JSON.stringify(metrics, null, 2),
    )
  if (page.viewportSize()!.width < 600)
    expect(metrics.sizes.length, `${name}: at most three phone text sizes`).toBeLessThanOrEqual(3)
}

export async function visibleAction(page: Page, button: Locator, bottom?: number) {
  await expect(button).toBeVisible()
  const box = await button.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.height).toBeGreaterThanOrEqual(48)
  expect(box!.width).toBeGreaterThanOrEqual(48)
  expect(box!.y + box!.height).toBeLessThanOrEqual(bottom ?? page.viewportSize()!.height)
}

export async function copyFor(page: Page, language: string) {
  await page.goto('/')
  return page.evaluate(async (language) => {
    const app = (await import('/src/features/v1/strings.ts' as string)) as {
      en: Record<string, string>
    }
    const locales = (await import('/src/features/v1/locales/index.ts' as string)) as {
      loaders: Record<string, () => Promise<Record<string, string>>>
    }
    const flowModule = (await import('/src/features/v1/newShopCopy.ts' as string)) as {
      newShopCopyFor: (l: string) => Record<string, string>
    }
    const guidedModule = (await import('/src/features/v1/inChatCopy.ts' as string)) as {
      inChatCopyFor: (l: string) => {
        next: string
        back: string
        typeItIn: string
        confirmPin: string
        stepNames: Record<string, string>
      }
    }
    const onboarding = (await import('/src/features/v1/onboardingCopy.ts' as string)) as {
      onboardingCopyFor: (l: string) => { skipForNow: string; done: string; faceStart: string }
    }
    const t = language === 'en' ? app.en : await locales.loaders[language]!()
    const f = flowModule.newShopCopyFor(language)
    return {
      copy: {
        continuePreview: t.continuePreview!,
        acceptTerms: t.acceptTerms!,
        acceptPrivacy: t.acceptPrivacy!,
        agree: t.agree!,
        coachGreeting: t.coachGreeting!,
        addShop: t.addShop!,
        suggestAdd: t.suggestAdd!,
        share: t.share!,
        currency: t.currency!,
        actionFailed: t.actionFailed!,
        message: t.message!,
        send: t.send!,
        newShopContinue: t.newShopContinue!,
        locationDenied: t.locationDenied!,
      },
      flow: {
        begin: f.begin!,
        review: f.review!,
        location: f.location!,
        open: f.open!,
        ready: f.ready!,
      },
      guided: guidedModule.inChatCopyFor(language),
      optional: onboarding.onboardingCopyFor(language),
    }
  }, language)
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}

export async function keyboard(page: Page, height: number | null) {
  await page.evaluate((height) => {
    if (height === null) delete (window.visualViewport as unknown as Record<string, unknown>).height
    else
      Object.defineProperty(window.visualViewport!, 'height', {
        configurable: true,
        get: () => height,
      })
    window.visualViewport!.dispatchEvent(new Event('resize'))
  }, height)
}

export const phones = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
]

export const personas = [
  {
    id: 'tea',
    en: ['Neighbourhood Tea Stall and Snacks Corner', 'Tea stall'],
    hi: ['मोहल्ले की चाय और नाश्ते की दुकान', 'चाय की दुकान'],
    ta: ['அக்கம் பக்கத்து தேநீர் கடை', 'தேநீர் கடை'],
  },
  {
    id: 'bakery',
    en: ['Our Family Home Bakery and Celebration Cakes', 'Home bakery'],
    hi: ['हमारे घर की बेकरी और जन्मदिन के केक', 'घर की बेकरी'],
    ta: ['எங்கள் வீட்டு கேக் பேக்கரி', 'பேக்கரி'],
  },
  {
    id: 'kirana',
    en: ['Shree Ganesh Family Kirana and Everyday Essentials', 'Grocery'],
    hi: ['श्री गणेश परिवार किराना और रोज़मर्रा का सामान', 'किराना'],
    ta: ['கணேஷ் குடும்ப மளிகைக் கடை', 'மளிகைக் கடை'],
  },
]

export function registerLargeTextCases() {
  for (const language of ['en', 'hi'])
    test(`OB-300 OB-309 large text and a long answer leave room for the keyboard ${language}`, async ({
      page,
    }) => {
      await localOnly(page)
      await page.setViewportSize({ width: 360, height: 800 })
      await page.addInitScript((language) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
        Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
      }, language)
      const { copy, flow } = await copyFor(page, language)
      await enter(page, copy)
      await page.getByRole('banner').getByRole('button', { name: copy.addShop }).click()
      await page.getByRole('button', { name: flow.begin }).click()
      await expect(page.getByRole('log')).not.toBeEmpty()
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      await page
        .getByRole('textbox', { name: copy.message, exact: true })
        .fill(
          (language === 'hi'
            ? 'मेरी घर की बेकरी में जन्मदिन के केक और ताज़े बिस्कुट मिलते हैं। '
            : 'Our home bakery makes birthday cakes and fresh cookies. '
          ).repeat(12),
        )
      await keyboard(page, 460)
      await capture(page, `OB-300-${language}-large-text-keyboard`)
      await expect(async () =>
        visibleAction(page, page.getByRole('button', { name: copy.send, exact: true }), 460),
      ).toPass()
      const log = await page
        .getByRole('log')
        .evaluate((el) => el.parentElement!.getBoundingClientRect().height)
      expect(log).toBeGreaterThanOrEqual(48)
      await noOverflow(page)
    })
}

export function registerStandardMotionCases(open: (page: Page) => Promise<void>) {
  for (const width of [360, 390])
    test(`standard motion keeps setup usable ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await open(page)
      await page
        .getByRole('textbox', { name: 'Message', exact: true })
        .fill('name: Family Bakery; category: Bakery; location: Indiranagar')
      await keyboard(page, 460)
      await expect(async () =>
        visibleAction(page, page.getByRole('button', { name: 'Send', exact: true }), 460),
      ).toPass()
      await keyboard(page, null)
      await page.getByRole('button', { name: 'Send', exact: true }).click()
      await expect(page.getByTestId('shop-live')).toBeVisible()
      await page.getByTestId('end-conversation').click()
      await page.getByTestId('finish-review').click()
      await expect(page.locator('[data-ready-shop]')).toHaveCSS('opacity', '1')
      await visibleAction(page, page.getByRole('button', { name: 'Continue with my shop' }))
      await capture(page, `${width}-standard-motion-ready`)
    })
}

export function registerReviewViewportCases() {
  for (const variant of [{ width: 390, height: 844, language: 'zh-Hans', color: 'light' }] as const)
    test(`review viewport ${variant.width} ${variant.language} ${variant.color}`, async ({
      page,
    }) => {
      await localOnly(page)
      await page.setViewportSize({ width: variant.width, height: variant.height })
      await page.emulateMedia({ colorScheme: variant.color })
      await page.addInitScript((language) => {
        localStorage.setItem('niva.starter.preferences', JSON.stringify({ language }))
        Object.defineProperty(window, 'AudioWorkletNode', { value: undefined })
      }, variant.language)
      const { copy, flow, guided } = await copyFor(page, variant.language)
      const tag = `review-${variant.width}-${variant.language}-${variant.color}`
      await enter(page, copy)
      await capture(page, `${tag}-first`)
      await page.getByRole('banner').getByRole('button', { name: copy.addShop }).click()
      await capture(page, `${tag}-hero`)
      await page.getByRole('button', { name: flow.begin }).click()
      await page.getByRole('button', { name: guided.typeItIn }).click()
      await page
        .getByRole('textbox')
        .fill(variant.language === 'zh-Hans' ? '我们家的烘焙小店' : 'Our Family Home Bakery')
      await capture(page, `${tag}-guided`)
      await page
        .getByRole('navigation')
        .getByRole('button', { name: guided.stepNames.delivery, exact: true })
        .click()
      await page.getByRole('button', { name: flow.review, exact: true }).click()
      await expect(page.getByTestId('new-shop-review')).toBeVisible()
      await capture(page, `${tag}-review`)
      await page.getByRole('button', { name: flow.open, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(flow.ready)
      await capture(page, `${tag}-ready`)
      await visibleAction(
        page,
        page.getByRole('button', { name: copy.newShopContinue, exact: true }),
      )
      await page.getByRole('button', { name: copy.newShopContinue, exact: true }).click()
      await expect(page.getByTestId('today-day-one')).toBeVisible()
      await capture(page, `${tag}-today`)
      await noOverflow(page)
    })
}

export const guidedSteps = [
  'name',
  'category',
  'products',
  'location',
  'hours',
  'phone',
  'payment',
  'delivery',
] as const
export function guidedAnswers(language: 'en' | 'hi') {
  return {
    name:
      language === 'en'
        ? 'A very long family home bakery name for the neighbourhood'
        : 'मोहल्ले के लिए हमारे परिवार की घर की बहुत लंबे नाम वाली बेकरी',
    category: language === 'en' ? 'Home bakery' : 'घर की बेकरी',
    products: language === 'en' ? 'Fresh family birthday cake' : 'ताज़ा जन्मदिन का केक',
    location:
      language === 'en'
        ? 'Indiranagar, near the park, opposite the old community hall, Bengaluru'
        : 'इंदिरानगर, पार्क के पास, पुराने सामुदायिक भवन के सामने, बेंगलुरु',
    hours: language === 'en' ? 'Closed on public holidays' : 'सरकारी छुट्टियों पर बंद',
    phone: '9876543210',
    payment: language === 'en' ? 'Neighbourhood credit' : 'मोहल्ले का उधार',
    delivery: language === 'en' ? 'Neighbourhood delivery' : 'मोहल्ले में डिलीवरी',
  }
}
