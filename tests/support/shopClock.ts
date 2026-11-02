import type { Page } from '@playwright/test'

/** The demo shop's local times the Coach card changes at: morning, afternoon, close window, late. */
export const SHOP_TIMES = ['08:00', '14:00', '20:30', '23:30'] as const

/**
 * Pins the page clock to the demo shop's (Bengaluru, +05:30) `hh:mm`, the latest one that has
 * already passed: the demo sandbox lives 15 minutes on the real clock, so a time ahead of now would
 * show "This demo has ended" instead of the screen.
 */
export async function pinShopTime(page: Page, time: string) {
  const day = (back: number) =>
    new Date(Date.now() + 5.5 * 3600e3 - back * 86400e3).toISOString().slice(0, 10)
  const today = new Date(`${day(0)}T${time}:00+05:30`)
  await page.clock.setFixedTime(
    today.getTime() <= Date.now() ? today : new Date(`${day(1)}T${time}:00+05:30`),
  )
}
