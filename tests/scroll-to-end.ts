import type { Page } from '@playwright/test'

/**
 * OB-48: a shop page keeps growing after a first scroll (the stamp card and tips load after the
 * page), so one scrollTo can stop short of the end. Keep scrolling until the page height has not
 * changed for half a second, then measure.
 */
export async function scrollToEnd(page: Page) {
  let last = -1
  let stable = 0
  for (let i = 0; i < 50 && stable < 5; i++) {
    const height = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return document.documentElement.scrollHeight
    })
    stable = height === last ? stable + 1 : 0
    last = height
    await page.waitForTimeout(100)
  }
}
