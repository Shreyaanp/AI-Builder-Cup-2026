import { expect, type Page } from '@playwright/test'
import { enter, localOnly } from '../stories/support.js'

/** A kirana with onions (kg) and milk (l), 12 of each and four weeks of sales: both run out
 * within the week (#603: more than one need). */
export async function kirana(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await localOnly(page)
  await enter(page)
  const name = 'Corner Store'
  const prepared = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: {
          name,
          category: 'Grocery',
          location: 'Indiranagar, Bengaluru',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          phone: '+919876543210',
          weekly_hours: [{ day: 'thu', open: '07:00', close: '20:00', closed: false }],
          stamps_needed: 8,
          reward_text: 'Your tenth bag is free',
        },
        owner_location: { lat: 12.9716, lng: 77.6412, accuracy_m: 0, source: 'pin' },
        products: [
          { name: 'Onions', price: 4000, unit: 'kg', category: 'Veg', stock: 12 },
          { name: 'Milk', price: 6000, unit: 'l', category: 'Dairy', stock: 12 },
        ],
      },
    })
  ).json()
  const approved = await page.request.post(`/api/v1/proposals/${prepared.id}/approve`, {
    data: { digest: prepared.digest },
  })
  const { business_id: id } = await approved.json()
  const shopDay = (back: number) =>
    new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
  for (let back = 28; back >= 1; back--) {
    const v = 3 + (back % 3)
    const day = await page.request.post(`/api/v1/businesses/${id}/day/prepare`, {
      data: {
        date: shopDay(back),
        sales: [
          { item: 'Onions', quantity: v, amount: v * 40 },
          { item: 'Milk', quantity: v, amount: v * 60 },
        ],
      },
    })
    const { sales } = await day.json()
    await page.request.post(`/api/v1/businesses/${id}/import/${sales.import_id}/approve`, {
      data: { digest: sales.digest },
    })
  }
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: `Choose shop: ${name}` })).toBeVisible()
  await page.keyboard.press('Escape')
}
