import { expect, test } from '@playwright/test'

test('budget uses currency thresholds, availability and Google price level fallback', async ({
  page,
}) => {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.addInitScript(() => localStorage.setItem('chalkboard.customer.journey', 'done'))
  const thresholds = {
    INR: 15000,
    JPY: 800,
    USD: 800,
    EUR: 700,
    GBP: 600,
    SGD: 1000,
    MYR: 1500,
    IDR: 30000,
    THB: 12000,
    PHP: 20000,
    VND: 60000,
  }
  const base = {
    source: 'chalkboard',
    category: 'cafe',
    lat: 0,
    lng: 0,
    distance_m: 20,
    open_now: true,
    sold_out: [],
  }
  const places = Object.entries(thresholds).flatMap(([currency, price]) => [
    {
      ...base,
      id: `${currency}-cheap`,
      name: `${currency} cheap`,
      currency,
      items: [{ name: 'Coffee', price, unit: 'cup', available: true }],
    },
    {
      ...base,
      id: `${currency}-expensive`,
      name: `${currency} expensive`,
      currency,
      items: [{ name: 'Coffee', price: price + 1, unit: 'cup', available: true }],
    },
    {
      ...base,
      id: `${currency}-soldout`,
      name: `${currency} soldout`,
      currency,
      items: [{ name: 'Coffee', price: 1, unit: 'cup', available: false }],
    },
  ])
  await page.route('**/api/v1/discover?**', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        places: [
          ...places,
          {
            ...base,
            id: 'unknown',
            name: 'Unknown currency',
            currency: 'BHD',
            items: [{ name: 'Coffee', price: 1, unit: 'cup', available: true }],
          },
          {
            ...base,
            source: 'google',
            id: 'google-cheap',
            name: 'Google cheap',
            price_level: 'PRICE_LEVEL_INEXPENSIVE',
            items: [],
          },
          {
            ...base,
            source: 'google',
            id: 'google-moderate',
            name: 'Google moderate',
            price_level: 'PRICE_LEVEL_MODERATE',
            items: [],
          },
        ],
      },
    }),
  )
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'INR expensive', exact: true })).toBeVisible()
  await page.getByRole('switch', { name: 'Budget', exact: true }).check()
  for (const currency of Object.keys(thresholds)) {
    await expect(
      page.getByRole('heading', { name: `${currency} cheap`, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: `${currency} expensive`, exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: `${currency} soldout`, exact: true }),
    ).toHaveCount(0)
  }
  await expect(page.getByRole('heading', { name: 'Google cheap', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Google moderate', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Unknown currency', exact: true })).toHaveCount(0)
})
