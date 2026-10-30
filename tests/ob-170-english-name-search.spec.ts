import { expect, test } from '@playwright/test'
import { publish } from './qa/support.js'
import { enter, seedShop } from './stories/support.js'

// OB-170 (#528): a shop named in Hindi (or any script) is found by typing its name in English.
const INDIRANAGAR = { lat: 12.9719, lng: 77.6412 }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
})

test('OB-170: Ask finds "चिंकू जिया" when the customer types "chinku jiya"', async ({ page }) => {
  test.setTimeout(90_000)
  await enter(page)
  // Its own point and name each run, so shops left by earlier runs never stand in for it.
  const point = {
    lat: Number((INDIRANAGAR.lat + (Math.random() - 0.5) * 0.01).toFixed(6)),
    lng: Number((INDIRANAGAR.lng + (Math.random() - 0.5) * 0.01).toFixed(6)),
  }
  const name = `चिंकू जिया ${Date.now().toString().slice(-6)}`
  await seedShop(page, false, name, point)
  const id = (await (await page.request.get('/api/v1/businesses')).json())[0].id as string
  await publish(page, id)
  await page.addInitScript(
    (area) => localStorage.setItem('chalkboard.discover.filters', JSON.stringify({ place: area })),
    { ...point, label: 'Indiranagar' },
  )
  await page.goto('/explore/')
  await page.getByRole('textbox', { name: 'Ask about anything nearby' }).fill('chinku jiya')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const card = page.locator(`a[href="/explore/s/${id}"]`)
  await expect(card).toContainText('चिंकू जिया', { timeout: 15_000 })
  await expect(card).toBeVisible()
})
