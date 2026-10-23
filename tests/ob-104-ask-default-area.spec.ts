import { expect, test } from '@playwright/test'

// OB-104 / audit A-3: an Indian phone that has not shared a location starts in "Indiranagar".
// The search measured from central Bengaluru (5 km away), so "Where can I get masala chai under
// 30 rupees?" missed Indiranagar's chai shops while the header said Indiranagar.
const INDIRANAGAR = { lat: 12.9784, lng: 77.6408 }

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6_371_000
}

test('OB-104 the default Indiranagar area searches Indiranagar and finds its chai', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  })
  try {
    const page = await context.newPage()
    await page.route('**/*', (route) =>
      ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
        ? route.fallback()
        : route.abort(),
    )
    // No saved place and no location shared: the phone's region decides the area.
    await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
    await page.goto('/explore/')
    const field = page.getByRole('search').getByRole('textbox')
    // The first load compiles the app (dev server); the splash can outlast the default 5 s.
    await expect(field).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Indiranagar').first()).toBeVisible()

    const asked = page.waitForRequest(
      (request) => request.url().includes('/api/v1/discover/ask') && request.method() === 'POST',
    )
    await field.fill('Where can I get masala chai under 30 rupees?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const body = (await asked).postDataJSON() as { lat: number; lng: number }
    expect(metres(body, INDIRANAGAR)).toBeLessThan(300)

    // Lantern Chai Corner (Indiranagar, masala chai ₹20) is a Chalkboard answer.
    const card = page.getByRole('heading', { name: /Lantern Chai Corner/ }).first()
    await expect(card).toBeVisible({ timeout: 15_000 })
  } finally {
    await context.close()
  }
})
