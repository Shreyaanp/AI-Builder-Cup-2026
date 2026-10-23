import { expect, test, type Page, type Request } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'

// OB-194 (owner P0, 23 Oct): menu uploading was still broken after #520. Reading a real menu photo
// or PDF takes 25-40 s in production, but the menu sheet's import gave up after the app's default
// 25 s wait, so the owner always saw "could not import" while the server was still reading.
// OB-195 (owner P0, 23 Oct): a first visit is light everywhere, even on a phone set to dark.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

type Item = { name: string; unit: string; price: number; category: string }
const MENU: Item[] = [
  { name: 'Masala Dosa', unit: 'plate', price: 6000, category: 'Food' },
  { name: 'Filter Coffee', unit: 'cup', price: 2500, category: 'Drinks' },
]

async function seed(page: Page) {
  const proposal = await (
    await page.request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        business: { name: 'Udupi Corner', category: 'Restaurant', location: 'Jayanagar' },
        products: [],
      },
    })
  ).json()
  const saved = await (
    await page.request.post(`/api/v1/proposals/${proposal.id}/approve`, {
      data: { digest: proposal.digest },
    })
  ).json()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await expect(page.getByRole('button', { name: 'Choose shop: Udupi Corner' })).toBeVisible()
  return saved.business_id as string
}

/** A camera-sized phone photo (4000 x 3000, a few MB), drawn in the browser. */
async function phonePhoto(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(4000, 3000)
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(4000, 3000)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const v = (i * 2654435761) >>> 24
      pixels.data.set([v, 255 - v, (v * 7) & 255, 255], i)
    }
    context.putImageData(pixels, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000)
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(text)
  })
  return Buffer.from(base64, 'base64')
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R>>endobj\n' +
    '4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 20 150 Td (Masala Dosa 60  Filter Coffee 25) Tj ET\nendstream endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
)

for (const kind of ['photo', 'pdf'] as const) {
  test(`OB-194: a menu ${kind} that takes 30 s to read still opens the review and saves`, async ({
    page,
  }) => {
    // Drawing a camera-sized photo and shrinking it on the phone take real seconds.
    test.setTimeout(90_000)
    await localOnly(page)
    await enter(page)
    const bid = await seed(page)
    const shops = await (await page.request.get('/api/v1/businesses')).json()
    // The production reader's answer for this menu, sealed by the real endpoint.
    const sealed = await (
      await page.request.post('/api/v1/proposals', {
        data: { kind: 'inventory', business_id: bid, revision: shops[0].revision, products: MENU },
      })
    ).json()
    let release!: () => void
    const reading = new Promise<void>((resolve) => (release = resolve))
    const arrived: Request[] = []
    await page.route(`**/api/v1/businesses/${bid}/import`, async (route) => {
      arrived.push(route.request())
      await reading
      await route.fulfill({ json: { kind: 'menu', proposal: sealed, items: 2, skipped: 0 } })
    })

    await page.getByRole('button', { name: 'Shop', exact: true }).click()
    await page.getByRole('button', { name: /^Menu/ }).click()
    const menu = page.getByRole('dialog', { name: 'Menu' })
    await menu.getByRole('button', { name: 'Import sales or menu (Excel, photo, notes)' }).click()
    const file =
      kind === 'photo'
        ? { name: 'menu.jpg', mimeType: 'image/jpeg', buffer: await phonePhoto(page) }
        : { name: 'menu.pdf', mimeType: 'application/pdf', buffer: PDF }
    // Fake time from here on, so the 30 s production read is simulated without waiting for it.
    await page.clock.install()
    await menu.locator('input[type="file"][accept*=".xlsx"]').setInputFiles(file)
    await expect.poll(() => arrived.length).toBe(1)
    const sent = arrived[0]
    if (kind === 'photo') {
      // Shrunk on the phone first: a camera original is megabytes on mobile data.
      expect(file.buffer.length).toBeGreaterThan(2_000_000)
      expect(sent.headers()['content-type']).toBe('image/jpeg')
      expect(sent.postDataBuffer()!.length).toBeLessThan(file.buffer.length / 2)
    } else {
      expect(sent.headers()['content-type']).toBe('application/pdf')
      expect(sent.postDataBuffer()!.equals(PDF)).toBe(true)
    }

    // The server is still reading after 30 s, as it does in production: the app keeps waiting.
    await page.clock.fastForward('00:30')
    await expect(menu.getByTestId('import-failed')).toHaveCount(0)
    release()
    const review = page.getByRole('dialog', { name: 'Check before saving' })
    await expect(review).toContainText('Masala Dosa')
    await expect(menu.getByTestId('import-failed')).toHaveCount(0)
    await review.getByRole('button', { name: 'Confirm and save' }).click()
    await expect(review).toBeHidden()
    const saved = await (await page.request.get(`/api/v1/businesses/${bid}/inventory`)).json()
    expect(saved.map((item: { name: string }) => item.name).sort()).toEqual([
      'Filter Coffee',
      'Masala Dosa',
    ])
  })
}

const luminance = (rgb: string) => {
  const [r, g, b] = rgb
    .match(/\d+(\.\d+)?/g)!
    .slice(0, 3)
    .map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
const bodyLuminance = async (page: Page) =>
  luminance(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))

test.describe('OB-195: first visit on a dark phone', () => {
  test.use({ colorScheme: 'dark' })

  async function expectLight(page: Page) {
    // Body surface and browser chrome are both light (luminance well above mid-grey).
    await expect.poll(() => bodyLuminance(page)).toBeGreaterThan(0.85)
    const chrome = await page.locator('meta[name="theme-color"]').getAttribute('content')
    const hex = chrome!.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16))
    expect(luminance(`rgb(${r}, ${g}, ${b})`)).toBeGreaterThan(0.85)
  }

  for (const path of ['/?app=landing', '/explore/']) {
    test(`${path} starts light`, async ({ page }) => {
      await localOnly(page)
      await page.goto(path)
      await expectLight(page)
      if (path.includes('landing'))
        await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
    })
  }

  test('the owner app starts light, before and after sign-in', async ({ page }) => {
    await localOnly(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
    await expectLight(page)
    await enter(page)
    await expectLight(page)
    await page.getByRole('button', { name: 'You', exact: true }).click()
    const look = page.getByRole('group', { name: 'Look', exact: true })
    await expect(look.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('an explicit dark or System pick is kept', async ({ page }) => {
    await localOnly(page)
    await page.goto('/explore/')
    for (const appearance of ['dark', 'system']) {
      await page.evaluate(
        (value) =>
          localStorage.setItem(
            'chalkboard.customer.preferences',
            JSON.stringify(
              value === 'system'
                ? { appearance: value, appearanceChosen: true }
                : { appearance: value },
            ),
          ),
        appearance,
      )
      await page.reload()
      await expect.poll(() => bodyLuminance(page)).toBeLessThan(0.3)
    }
    // A "system" saved by an older build without the pick marker was never a choice: light.
    await page.evaluate(() =>
      localStorage.setItem(
        'chalkboard.customer.preferences',
        JSON.stringify({ appearance: 'system' }),
      ),
    )
    await page.reload()
    await expectLight(page)
  })
})
