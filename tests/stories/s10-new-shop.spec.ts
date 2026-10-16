import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { enter, image, liveOnly, localOnly, phone, shot } from './support.js'

// S10 · Opening a new shop (owner answers, 15 Oct): big hero, then a full-screen conversation in
// which the coach speaks first, drives one question at a time, acts in the chat (also when the
// owner says nothing), builds the shop live, and ends in one review page and a ready moment.
test.use(phone)
// Light and dark captures of every screen (phone and desktop) are in tests/new-shop.spec.ts.
test.skip(({ isMobile }) => !isMobile, 'Story evidence uses the phone project')

async function axe(page: Page) {
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('S10 · owner opens a new shop by talking to the coach', async ({ page, context }) => {
  test.setTimeout(120_000)
  await localOnly(page)
  // A local tone stands in for the microphone (the offline backend runs no speech recognition).
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const destination = audio.createMediaStreamDestination()
      audio.createOscillator().connect(destination)
      return destination.stream
    }
  })
  // Granting only geolocation would leave the microphone "denied" for the page, which the flow
  // rightly reports as a blocked mic; the stand-in mic needs its permission too.
  await context.grantPermissions(['geolocation', 'microphone'])
  await context.setGeolocation({ latitude: 12.9718234, longitude: 77.6412345, accuracy: 20 })
  await enter(page)

  await test.step('1 · "+" opens the hero (no dialog)', async () => {
    await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
    await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    // Let the chalk drawing finish before the evidence shot.
    await page.waitForTimeout(3000)
    await axe(page)
    await shot(page, 10, '1-hero')
  })

  await test.step('2 · the coach greets first, out loud, and the mic opens', async () => {
    liveOnly(
      'Gemini Live voice and its spoken greeting; offline the greeting is the scripted coach',
    )
    await page.getByRole('button', { name: 'Let’s begin' }).click()
    await expect(page.getByRole('log')).toContainText('What is your business called?')
    // Voice mode: one open conversation; the mic stays on (not paused) after the greeting and
    // the orb listens. Keyboard, mute and end voice are the other controls.
    await expect(page.getByTestId('voice-orb').first()).toHaveAttribute('data-phase', 'listening')
    await expect(page.getByRole('button', { name: 'Pause the mic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByRole('button', { name: 'Mute the coach’s voice' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'End voice' })).toBeVisible()
    await shot(page, 10, '2-greeting')
  })

  await test.step('3 · the owner answers; the agent acts in the chat; the shop builds live', async () => {
    liveOnly('Speech recognition of the owner’s answer; the answer is typed into the live session')
    await page.getByRole('button', { name: 'Type instead' }).click()
    await page.getByLabel('Message', { exact: true }).fill('name: Market Chai; category: Tea stall')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const action = page.getByTestId('agent-action').last()
    await expect(action).toContainText('Market Chai')
    await expect(page.getByTestId('shop-so-far')).toContainText('Market Chai')
    await expect(page.getByRole('log')).toContainText('Where is your shop?')
    await shot(page, 10, '3-action')
  })

  await test.step('4 · silence: the coach still answers in the chat and moves on', async () => {
    // No answer for ~9 s: the coach leaves the location out for now and asks the next question.
    await expect(page.getByRole('log')).toContainText('leave the location out', {
      timeout: 20_000,
    })
    await expect(page.getByRole('log')).toContainText('What are your opening hours?')
    await shot(page, 10, '4-silence')
    await axe(page)
  })

  await test.step('5 · location and a menu photo are actions in the chat', async () => {
    await page.getByRole('button', { name: 'My location' }).click()
    await expect(page.getByTestId('agent-action').last()).toContainText(
      'Saved your location: Near Indiranagar',
    )
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Menu photo' }).click()
    await (await chooser).setFiles(await image(page))
    await expect(page.getByTestId('agent-action').last()).toContainText(/I read your menu|Added/)
    await shot(page, 10, '5-photo')
  })

  await test.step('6 · one full-screen review page with one button', async () => {
    await page.getByRole('button', { name: 'Review my shop' }).click()
    const review = page.getByTestId('new-shop-review')
    await expect(review).toContainText('within 20 m')
    await expect(review.getByRole('button', { name: 'Open my shop' })).toBeVisible()
    expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
    await shot(page, 10, '6-review')
    await axe(page)
  })

  await test.step('7 · "Your shop is ready"', async () => {
    await page.getByRole('button', { name: 'Open my shop' }).click()
    await expect(page.getByRole('heading', { name: 'Your shop is ready' })).toBeVisible()
    await shot(page, 10, '7-ready')
    await axe(page)
    await page.getByRole('button', { name: 'Continue with my shop' }).click()
    await expect(page.getByRole('button', { name: /Choose shop: / })).toBeVisible()
  })
})

test('S10 · entries: tour end and an empty My shop open the same flow', async ({ page }) => {
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  await test.step('empty My shop: "Create your shop"', async () => {
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    await page.getByRole('button', { name: 'Create your shop' }).click()
    await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  })
  await test.step('end of the tour: "Start my own shop"', async () => {
    await page.getByRole('button', { name: 'Take the tour' }).click()
    await expect(page.getByRole('dialog', { name: 'Your shop at a glance' })).toBeVisible()
    for (let step = 0; step < 8; step++)
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    await page.getByRole('button', { name: 'Start my own shop' }).click()
    await expect(page.getByRole('heading', { name: 'Let’s open your shop' })).toBeVisible()
    await axe(page)
    await shot(page, 10, '8-from-tour')
  })
})
