import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Phone shell bugs B1–B7 (BUGS.md), at the 390×844 size they were reported on.
test.skip(({ isMobile }) => !isMobile, 'phone-only regressions')
test.use({ viewport: { width: 390, height: 844 } })

async function enter(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByLabel('I agree to the Terms').check()
  await page.getByLabel('I have read the Privacy Notice').check()
  await page.getByRole('button', { name: 'Agree and continue' }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
}

async function axe(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    )
  })
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(result.violations).toEqual([])
}

async function saveShop(page: Page) {
  await page.getByRole('button', { name: 'Add my shop' }).tap()
  await page.getByLabel('Shop name').fill('Katong Kopi')
  await page.getByLabel('Address or area').fill('Katong, Singapore')
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Katong Kopi' })).toBeVisible()
}

test('B1: a bottom sheet sits on the bottom edge, full width, with its actions on screen', async ({
  page,
}) => {
  await enter(page)
  await saveShop(page)
  await page.getByRole('button', { name: 'Shop details: Katong Kopi' }).first().tap()
  const sheet = page.getByRole('dialog', { name: 'Katong Kopi' })
  await expect(sheet).toBeVisible()
  // Wait for the slide-in to finish, then measure.
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox()
      return box && Math.round(box.y + box.height)
    })
    .toBe(844)
  const box = (await sheet.boundingBox())!
  expect(box.x).toBe(0)
  expect(box.width).toBe(390)
  expect(box.y).toBeGreaterThan(844 * 0.1 - 1)
  await expect(sheet.getByRole('button', { name: 'Edit details' })).toBeInViewport()
  await axe(page)
  await sheet.getByRole('button', { name: 'Close' }).tap()
  await expect(sheet).toBeHidden()
})

test('B2: the navigation stays after "Something changed" and returns when the keyboard closes', async ({
  page,
}) => {
  await enter(page)
  await saveShop(page)
  const nav = page.getByRole('navigation', { name: 'Main' })
  const composer = page.getByLabel('Message', { exact: true })
  await page.getByRole('button', { name: 'Something changed' }).tap()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue('Today: ')
  await expect(nav).toBeInViewport()
  // The composer sits on top of the navigation, not under it.
  const form = (await page.locator('#coach form').boundingBox())!
  const bar = (await nav.boundingBox())!
  expect(form.y + form.height).toBeLessThanOrEqual(bar.y + 1)
  // Keyboard up (the window gets shorter): the navigation makes room for the composer.
  await page.setViewportSize({ width: 390, height: 500 })
  await expect(nav).toBeHidden()
  await expect(composer).toBeInViewport()
  // Keyboard dismissed while the field keeps focus: the navigation comes back.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(composer).toBeFocused()
  await expect(nav).toBeInViewport()
  await axe(page)
})

test('B3: the composer is one line (even with a long translated hint), grows for multi-line text, and voice never moves it', async ({
  page,
}) => {
  // A local tone stands in for the microphone; the voice socket answers "ready" and waits.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      audio.createOscillator().connect(destination)
      return destination.stream
    }
  })
  await page.routeWebSocket('**/api/v1/voice*', (socket) => {
    socket.send(JSON.stringify({ kind: 'ready', session_id: 'fixture-voice', mode: 'offline' }))
  })
  await enter(page)
  const field = page.locator('#coach textarea:not([aria-hidden])')
  const form = page.locator('#coach form')
  // One line is the 48dp row plus the composer's 4px padding.
  const height = async () => Math.round((await form.boundingBox())!.height)
  expect(await height()).toBe(56)
  // Tamil has the longest hint; it used to make the empty composer several lines tall.
  await page.getByRole('button', { name: 'Settings' }).tap()
  await page.getByRole('combobox', { name: 'Language' }).tap()
  await page.getByRole('option', { name: 'தமிழ்' }).tap()
  await page.keyboard.press('Escape')
  await expect(field).toHaveAttribute('placeholder', /கடை/)
  expect(await height()).toBe(56)
  await page.getByRole('button', { name: 'அமைப்புகள்' }).tap()
  await page.getByRole('combobox').tap()
  await page.getByRole('option', { name: 'English', exact: true }).tap()
  await page.keyboard.press('Escape')
  await expect(field).toHaveAttribute('placeholder', 'Tell me about your shop…')
  // Multi-line text grows the field a line at a time; clearing it goes back to one line.
  await field.fill('Kopi\nTeh\nMilo')
  expect(await height()).toBe(104)
  await field.fill('')
  expect(await height()).toBe(56)

  // Press to talk: only the icon and the text slot change state.
  const mic = page.getByRole('button', { name: 'Press to talk', exact: true })
  const before = (await form.boundingBox())!
  const micBefore = (await mic.boundingBox())!
  // A long press shows no tooltip over the composer.
  await mic.dispatchEvent('touchstart')
  await page.waitForTimeout(1000)
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await mic.dispatchEvent('touchend')
  await mic.tap()
  const finish = page.getByRole('button', { name: 'Finish speaking', exact: true })
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByRole('status')).toHaveText('Listening · up to 30 seconds')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  expect(await form.boundingBox()).toEqual(before)
  expect(await finish.boundingBox()).toEqual(micBefore)
  await axe(page)
  await finish.tap()
  await expect(form.getByRole('status')).toHaveText('Replying…')
  expect(await form.boundingBox()).toEqual(before)
})
