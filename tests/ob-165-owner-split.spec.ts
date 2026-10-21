import { expect, test, type Page } from '@playwright/test'
import {
  createShopFromReview,
  editShopDetails,
  enter,
  localOnly,
  openNewShopReview,
  seedShop,
  shopName,
} from './stories/support.js'

// OB-165 (#505) and OB-78 (#387): the owner app was one 561 kB chunk that even the welcome page
// waited for, so the first visit after a deploy sat on "Getting things ready…". The welcome now
// loads none of the workspace, and the first owner screen (Today) none of the code behind a tap.
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })

const WORKSPACE =
  /\/src\/features\/v1\/(AppShell|WorkspaceProvider|NewShopFlow|screens\/CoachScreen)\.tsx/

// Loaded only after a tap or mid-conversation (fetched while idle, never needed to paint).
const AFTER_A_TAP = [
  'src/features/v1/NewShopFlow.tsx',
  'src/features/v1/ShopTiles.tsx',
  'src/features/v1/ReviewDialog.tsx',
  'src/features/v1/EditDialogs.tsx',
  'src/features/closeday/CloseDay.tsx',
  'src/features/connect/ConnectSheet.tsx',
  'src/features/owner-tools/PaymentsScreen.tsx',
  'src/features/sourcing/Orders.tsx',
  'src/features/sourcing/SourcingCards.tsx',
  'src/features/supply/SupplyHub.tsx',
  'src/features/supply/OrderSheet.tsx',
  'src/features/supply/PurchaseOrderCard.tsx',
  'src/design/RichText.tsx',
]

test.beforeEach(async ({ page }) => {
  await localOnly(page)
})

test('OB-78/OB-165: the business welcome loads none of the owner workspace', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => requested.push(new URL(request.url()).pathname))
  await page.goto('/')
  // A cold dev server compiles on first use; the requests below are what this test is about.
  await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible({
    timeout: 20_000,
  })
  expect(requested.filter((path) => WORKSPACE.test(path))).toEqual([])
})

async function withoutTapCode(page: Page) {
  const blocked: string[] = []
  await page.route(
    (url) => AFTER_A_TAP.some((file) => url.pathname === `/${file}`),
    (route) => {
      blocked.push(new URL(route.request().url()).pathname)
      return route.abort()
    },
  )
  return blocked
}

test('OB-165: consent, the coach and Today paint without the code behind a tap', async ({
  page,
}) => {
  const blocked = await withoutTapCode(page)
  await enter(page)
  await seedShop(page)
  await expect(page.getByRole('button', { name: `Choose shop: ${shopName}` })).toBeVisible()
  await expect(page.getByTestId('today')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Nothing on screen fell back to the "could not load" state.
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  // The idle fetch did ask for that code, and it was refused without breaking the screen.
  await expect.poll(() => blocked.length).toBeGreaterThan(0)
})

test('OB-165: "+" opens the new-shop conversation and a shop goes live', async ({ page }) => {
  await enter(page)
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await expect(page.getByRole('button', { name: 'Let’s begin' })).toBeVisible()
  // The coach greets with its first question, then the shop card fills from one message.
  await openNewShopReview(page)
  await createShopFromReview(page)
  await expect(page.getByTestId('today')).toBeVisible()
})

test('OB-165: the deferred edit dialog opens with the saved details', async ({ page }) => {
  await enter(page)
  await seedShop(page)
  await editShopDetails(page)
  await expect(page.getByLabel('Shop name')).toHaveValue(shopName)
})

// Review of #525: the owner phone sweep tapped an item (the menu closes, the item's dialog opens)
// while the dialog's code was still on its way. Nothing showed, Back had nothing to close, and the
// dialog popped up later over Grow and blocked every tap.
test('OB-165: a tap answers before its code arrives, and Back closes it for good', async ({
  page,
}) => {
  const EDIT_DIALOGS = '/src/features/v1/EditDialogs.tsx'
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(
    (url) => url.pathname === EDIT_DIALOGS,
    async (route) => {
      await held
      await route.continue()
    },
  )
  await enter(page)
  await seedShop(page)
  await page.locator('[data-tour="nav-shop"]').click()
  const menuButton = page.locator('[data-tour="menu"]')
  await menuButton.click()
  await page.getByRole('dialog').locator('[data-menu-item="Kopi"]').click()
  // The tap answers at once, before the form's code is here, and Back closes it.
  const pending = page.getByRole('dialog', { name: 'Edit' })
  await expect(pending).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const landed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === EDIT_DIALOGS,
  )
  release()
  await landed
  // The code arriving later opens nothing: the menu still takes a tap, and the item now opens
  // the real form.
  await menuButton.click()
  await page.getByRole('dialog').locator('[data-menu-item="Kopi"]').click()
  await expect(page.getByLabel('Product name')).toHaveValue('Kopi')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
