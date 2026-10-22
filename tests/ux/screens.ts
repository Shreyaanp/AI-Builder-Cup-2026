import { expect, type Page } from '@playwright/test'

export type Screen = {
  name: string
  /** A customer session is created first (Passport). */
  signedIn?: boolean
  open: (page: Page) => Promise<void>
}

const SHOP = 'demo-story-bengaluru-chai'

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(700)
}

async function demoTab(page: Page, tab: 'coach' | 'shop' | 'grow' | 'you') {
  await page.goto(tab === 'coach' ? '/demo' : `/demo?tab=${tab}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Demo shop - nothing here is real', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  const skip = page.getByRole('dialog').getByRole('button', { name: 'Skip', exact: true })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The banner shows before the sandbox has loaded; measure the tab itself, not its loading state.
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('main').getByRole('heading', { level: 1 }).first()).toBeAttached()
  await settle(page)
}

/** The key screens of the apps. New screen: add one entry; the gate then covers it. */
export const SCREENS: Screen[] = [
  {
    name: 'landing',
    open: async (page) => {
      await page.goto('/?app=landing', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await settle(page)
    },
  },
  {
    name: 'how-it-works',
    open: async (page) => {
      await page.goto('/how-it-works', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await settle(page)
    },
  },
  {
    name: 'business-sign-in',
    open: async (page) => {
      await page.goto('/?app=business', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
      // A slow first load shows the splash heading first; wait for the sign-in page itself.
      await expect(page.getByRole('button', { name: 'Terms' })).toBeVisible({ timeout: 20_000 })
      await settle(page)
    },
  },
  { name: 'demo-coach', open: (page) => demoTab(page, 'coach') },
  { name: 'demo-shop', open: (page) => demoTab(page, 'shop') },
  { name: 'demo-grow', open: (page) => demoTab(page, 'grow') },
  { name: 'demo-you', open: (page) => demoTab(page, 'you') },
  {
    name: 'customer-explore',
    open: async (page) => {
      await page.goto('/explore/', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('main').getByRole('textbox').first()).toBeVisible({
        timeout: 20_000,
      })
      await settle(page)
    },
  },
  {
    name: 'demo-shop-page',
    open: async (page) => {
      await page.goto(`/explore/s/${SHOP}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
      await settle(page)
    },
  },
  {
    name: 'qr-stamp',
    open: async (page) => {
      await page.goto(`/explore/s/${SHOP}?source=qr`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
      await settle(page)
    },
  },
  {
    name: 'passport',
    signedIn: true,
    open: async (page) => {
      await page.goto('/explore/passport', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await settle(page)
    },
  },
]

// Saved and Chats (OB-139): the customer tabs that were missing from the gate.
for (const [name, path] of [
  ['saved', '/explore/saved'],
  ['chats', '/explore/chats'],
] as const)
  SCREENS.push({
    name,
    signedIn: true,
    open: async (page) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await settle(page)
    },
  })
