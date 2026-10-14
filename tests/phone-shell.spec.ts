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
  expect(result.violations.map((v) => [v.id, v.nodes.map((n) => [n.target, n.html])])).toEqual([])
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

test('B4: Back closes the top sheet or dialog first, and asks before throwing away unsaved input', async ({
  page,
}) => {
  await enter(page)
  await saveShop(page)
  const composer = page.getByLabel('Message', { exact: true })
  const prompt = page.getByRole('dialog', { name: 'Discard changes?' })

  // A sheet: Back closes it and the owner stays in the app.
  await page.getByRole('button', { name: 'Shop details: Katong Kopi' }).first().tap()
  const sheet = page.getByRole('dialog', { name: 'Katong Kopi' })
  await expect(sheet).toBeVisible()
  await page.goBack()
  await expect(sheet).toBeHidden()
  await expect(composer).toBeVisible()

  // A sheet that hands over to a form: Back closes the form, then nothing is left open.
  await page.getByRole('button', { name: 'Shop details: Katong Kopi' }).first().tap()
  await sheet.getByRole('button', { name: 'Edit details' }).tap()
  const form = page.getByRole('dialog', { name: 'Edit details' })
  await expect(form).toBeVisible()
  await page.goBack()
  await expect(form).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Typed changes: Back asks first. Keep editing keeps them; Discard closes the form.
  await page.getByRole('button', { name: 'Shop details: Katong Kopi' }).first().tap()
  await sheet.getByRole('button', { name: 'Edit details' }).tap()
  await form.getByLabel('Hours note (optional)').fill('7am–3pm')
  await page.goBack()
  await expect(prompt).toBeVisible()
  await axe(page)
  await prompt.getByRole('button', { name: 'Keep editing' }).tap()
  await expect(prompt).toBeHidden()
  await expect(form.getByLabel('Hours note (optional)')).toHaveValue('7am–3pm')
  await page.goBack()
  await prompt.getByRole('button', { name: 'Discard' }).tap()
  await expect(form).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // An open review is unsaved: Back asks, Discard closes it without saving.
  await page.getByRole('button', { name: 'Shop details: Katong Kopi' }).first().tap()
  await sheet.getByRole('button', { name: 'Edit details' }).tap()
  await form.getByLabel('Hours note (optional)').fill('7am–3pm')
  await form.getByRole('button', { name: 'Review', exact: true }).tap()
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toBeVisible()
  await page.goBack()
  await prompt.getByRole('button', { name: 'Discard' }).tap()
  await expect(review).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('7am–3pm')).toHaveCount(0)

  // A typed draft: Back asks, and leaving the page asks the browser to confirm.
  await composer.fill('Kopi is $1.80 today')
  await page.goBack()
  await prompt.getByRole('button', { name: 'Keep editing' }).tap()
  await expect(composer).toHaveValue('Kopi is $1.80 today')
  const unload = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.type())
      void dialog.dismiss()
    }),
  )
  await page.close({ runBeforeUnload: true })
  expect(await unload).toBe('beforeunload')
})

test('B5: no "What’s new at …" line; + sits top-right next to settings', async ({ page }) => {
  await enter(page)
  await saveShop(page)
  await expect(page.getByText(/What’s new at/)).toHaveCount(0)
  const header = page.getByRole('banner')
  const plus = header.getByRole('button', { name: 'New conversation', exact: true })
  const settings = header.getByRole('button', { name: 'Settings', exact: true })
  await expect(plus).toBeVisible()
  const a = (await plus.boundingBox())!
  const b = (await settings.boundingBox())!
  // Same row, directly left of settings, at the right edge of the bar.
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
  expect(b.x - (a.x + a.width)).toBeLessThanOrEqual(8)
  expect(b.x + b.width).toBeGreaterThan(390 - 24)
  await expect(page.locator('main').getByRole('button', { name: 'New conversation' })).toHaveCount(
    0,
  )
  await axe(page)
  await plus.tap()
  await expect(page.getByRole('dialog', { name: 'New conversation' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).tap()
  // It belongs to the coach; other screens don't show it.
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await expect(plus).toHaveCount(0)
})

test('B6: the coach fits the phone without scrolling, suggestions sit under the shop card, and finished setup is one chip', async ({
  page,
}) => {
  await enter(page)
  await saveShop(page)
  const fits = () =>
    page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)
  const suggestions = page.getByRole('button', { name: 'Share my customer page' })
  const freshness = page.getByRole('heading', { name: 'Still the same menu today?' })
  await expect(suggestions).toBeInViewport()
  await expect(freshness).toBeVisible()
  expect(await fits()).toBe(true)
  // Suggestions come straight after the shop card, above the attention card.
  const shopCard = (await page.getByRole('region', { name: 'Katong Kopi' }).boundingBox())!
  const chip = (await suggestions.boundingBox())!
  expect(chip.y).toBeGreaterThan(shopCard.y + shopCard.height - 1)
  expect(chip.y).toBeLessThan((await freshness.boundingBox())!.y)
  // Everything clears the composer.
  const composer = (await page.locator('#coach form').boundingBox())!
  const attention = (await page.getByTestId('coach-attention').boundingBox())!
  expect(attention.y + attention.height).toBeLessThanOrEqual(composer.y)
  // One attention card at a time: once the menu is confirmed, the next one takes its place.
  await expect(page.getByRole('region', { name: /^Customers ask/ })).toBeHidden()
  await page.getByRole('button', { name: 'Yes, all good' }).tap()
  await expect(freshness).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^Customers ask/ })).toBeVisible()
  expect(await fits()).toBe(true)
  await axe(page)

  // Finish setup (share the customer page): the setup card collapses to one small chip.
  await expect(page.getByText('Step 4 of 5')).toBeVisible()
  await page.getByRole('button', { name: 'My shop', exact: true }).tap()
  await page.getByRole('button', { name: /^Customer page/ }).tap()
  await page.getByRole('switch', { name: 'Share customer page' }).tap()
  await expect(page.getByRole('switch', { name: 'Share customer page' })).toBeChecked()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Coach', exact: true }).tap()
  const done = page.getByRole('link', { name: 'Setup complete · Open customer page' })
  await expect(done).toBeVisible()
  expect((await done.boundingBox())!.height).toBeLessThanOrEqual(32)
  await expect(page.getByText(/^Step \d of 5$/)).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: /^Step/ })).toHaveCount(0)
  expect(await fits()).toBe(true)
  await axe(page)
})

test('B7: every photo entry offers Take photo (rear camera) and Upload', async ({ page }) => {
  await enter(page)
  const input = page.locator('#coach input[type="file"]')
  const take = page.getByRole('menuitem', { name: 'Take photo' })
  const upload = page.getByRole('menuitem', { name: 'Upload photo' })

  // The start card's "Take a photo" (before a shop exists).
  await page.getByRole('button', { name: 'Take a photo' }).tap()
  await expect(take).toBeVisible()
  await expect(upload).toBeVisible()
  await axe(page)
  let chooser = page.waitForEvent('filechooser')
  await take.tap()
  await chooser
  await expect(input).toHaveAttribute('capture', 'environment')

  // The composer's photo button.
  await page.getByRole('button', { name: 'Add photo', exact: true }).tap()
  chooser = page.waitForEvent('filechooser')
  await upload.tap()
  await chooser
  await expect(input).not.toHaveAttribute('capture')

  // A suggestion chip, then an actual upload reaches the review.
  await saveShop(page)
  await page.getByRole('button', { name: 'Add my menu' }).tap()
  chooser = page.waitForEvent('filechooser')
  await take.tap()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 40
    canvas.getContext('2d')!.fillRect(0, 0, 64, 40)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await (
    await chooser
  ).setFiles({
    name: 'menu.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  })
  await expect(page.getByRole('dialog', { name: 'Check before saving' })).toBeVisible()
})
