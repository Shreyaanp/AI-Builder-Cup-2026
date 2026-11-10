import type { Page } from '@playwright/test'

/**
 * Pins the browser clock to a wall-clock time, today, at a fixed UTC offset: '14:00' and
 * '+05:30' give 14:00 in Bengaluru on today's Bengaluru date. Specs whose screens change with the
 * shop's open or busy hours (the Sold out row's busy-hours question, Open now / Closed now) call
 * it first, so the suite gives the same result whatever hour the runner starts. The date stays
 * today's, so the server's "today" (sold out today, the day's sales) still matches.
 */
export async function atShopTime(page: Page, time: string, offset = '+05:30') {
  const [sign, hours, minutes] = [offset[0], Number(offset.slice(1, 3)), Number(offset.slice(4))]
  const shift = (sign === '-' ? -1 : 1) * (hours * 60 + minutes) * 60e3
  const day = new Date(Date.now() + shift).toISOString().slice(0, 10)
  await page.clock.setFixedTime(new Date(`${day}T${time}:00${offset}`))
}
