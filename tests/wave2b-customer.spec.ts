import { expect, test } from '@playwright/test'

test('OB-57: a 410 from the demo coach clears its saved session', async ({ page }) => {
  await page.goto('/explore/')
  const result = await page.evaluate(async () => {
    const modulePath = new URL('/src/api/stream.ts', location.origin).href
    const { setCoachEndpoint, streamCoach } = await import(/* @vite-ignore */ modulePath)
    const originalFetch = window.fetch
    sessionStorage.setItem(
      'chalkboard.demo.session',
      JSON.stringify({ session_id: 'expired-session', expires_at: Date.now() / 1000 + 600 }),
    )
    window.fetch = async (url) =>
      String(url).endsWith('/bootstrap')
        ? new Response('{}')
        : new Response('DEMO_EXPIRED', { status: 410 })
    let expired = false
    setCoachEndpoint('/expired-coach', () => {
      expired = true
      sessionStorage.removeItem('chalkboard.demo.session')
    })
    try {
      await streamCoach({ message: 'Hello' }, new AbortController().signal, () => {}).catch(
        () => undefined,
      )
      return { expired, stored: sessionStorage.getItem('chalkboard.demo.session') }
    } finally {
      window.fetch = originalFetch
      setCoachEndpoint(null)
    }
  })
  expect(result).toEqual({ expired: true, stored: null })
})

test('OB-58: a failed demo shop detail request settles its card', async ({ page }) => {
  test.setTimeout(60_000)
  await page.route('**/api/v1/demo/sessions/*', async (route) => {
    const path = new URL(route.request().url()).searchParams.get('path')
    if (path?.startsWith('/public/shops/')) {
      const id = path.slice('/public/shops/'.length)
      if (id.endsWith('coffee')) {
        await route.fulfill({ status: 503, body: 'unavailable' })
        return
      }
    }
    await route.fallback()
  })
  await page.goto('/explore/demo')
  await expect(page.getByRole('heading', { name: 'Browse shops' })).toBeVisible({ timeout: 30_000 })
  const failed = page.getByRole('link', { name: /Courtyard Filter House/ })
  await expect(failed).toBeVisible()
  await expect(failed.locator('.MuiSkeleton-root')).toHaveCount(0, { timeout: 15_000 })
})

test('OB-98: signing out does not surface an aborted view transition', async ({ page }) => {
  const session = await page.request.post('/api/v1/customer/session', { data: { name: 'Asha' } })
  expect(session.ok(), await session.text()).toBe(true)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`))
  await page.goto('/explore/')
  await page.getByRole('button', { name: 'Profile' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/explore\/?$/)
  await page.waitForTimeout(250)
  expect(errors).toEqual([])
})

test('OB-130: the demo Passport link skips first-run intro on a fresh device', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('niva.language.chosen', '1')
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'en' }))
    localStorage.removeItem('chalkboard.explainer.customer.v1')
    document.cookie = 'chalkboard.explainer.customer.v1=; Path=/; Max-Age=0'
  })
  await page.goto('/explore/demo')
  await expect(page.getByRole('link', { name: 'See your Passport' })).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('link', { name: 'See your Passport' }).click()
  await expect(page.getByRole('heading', { name: 'Your passport' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Find local shops near you')).toHaveCount(0)
})
