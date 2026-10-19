import { test, expect } from '@playwright/test'

test.setTimeout(120_000)

test('OB-72 demo tour plays recorded audio and never uses the browser voice', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  const audio: string[] = []
  const live: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/audio/')) audio.push(pathname)
    if (pathname.endsWith('/tts')) live.push(pathname)
  })
  await page.addInitScript(() => {
    localStorage.setItem('chalkboard.tour.narration', 'true')
    const counter = { spoken: 0 }
    Object.assign(window, { speechCalls: counter })
    if ('speechSynthesis' in window) {
      speechSynthesis.speak = () => {
        counter.spoken++
      }
    }
    // Keep playback deterministic: record the file, do not depend on autoplay policy.
    HTMLMediaElement.prototype.play = () => Promise.resolve()
  })
  await page.goto('/demo')
  await page.getByRole('dialog').getByRole('button', { name: 'Take the tour' }).click()
  const tour = page.getByRole('dialog')
  await expect(tour.getByText('1 of 7')).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => audio).toContain('/audio/demo/en/step-0.mp3')

  // Walk on to the supply card, whose line carries live shop data and so has no recording.
  for (let step = 0; step < 1; step++) await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByText('2 of 7')).toBeVisible()
  const recorded = audio.length
  expect(audio.length).toBe(recorded)
  expect(audio.every((path) => path.startsWith('/audio/demo/'))).toBe(true)
  expect(live).toEqual([])
  expect(
    await page.evaluate(
      () => (window as unknown as { speechCalls: { spoken: number } }).speechCalls.spoken,
    ),
  ).toBe(0)
})
