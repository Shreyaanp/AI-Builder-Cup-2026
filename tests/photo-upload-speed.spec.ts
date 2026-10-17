import { expect, test } from '@playwright/test'
import { exifGps, fitSize } from '../src/features/v1/photoPrep.js'
import { enter, localOnly } from './stories/support.js'

// Unit checks (pure functions, no browser) and one phone check that a big camera photo is shrunk
// on the device before it is uploaded.

/** A minimal JPEG whose only segment is an EXIF block with GPS 12°58'0" N, 77°35'30" E. */
function jpegWithGps(): Uint8Array {
  const tiff: number[] = []
  const u16 = (v: number) => tiff.push(v >> 8, v & 255)
  const u32 = (v: number) => tiff.push((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255)
  tiff.push(0x4d, 0x4d)
  u16(42)
  u32(8)
  // IFD0 at 8: one entry, GPS IFD pointer (0x8825) -> 26
  u16(1)
  u16(0x8825)
  u16(4)
  u32(1)
  u32(26)
  u32(0)
  // GPS IFD at 26: 4 entries; rationals live at 26 + 2 + 48 + 4 = 80 and 104
  u16(4)
  for (const [tag, type, count, value] of [
    [1, 2, 2, 0x4e000000], // N
    [2, 5, 3, 80],
    [3, 2, 2, 0x45000000], // E
    [4, 5, 3, 104],
  ]) {
    u16(tag)
    u16(type)
    u32(count)
    u32(value)
  }
  u32(0)
  for (const [n, d] of [
    [12, 1],
    [58, 1],
    [0, 1],
    [77, 1],
    [35, 1],
    [30, 1],
  ]) {
    u32(n)
    u32(d)
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const length = exif.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255, ...exif, 0xff, 0xd9])
}

test('fitSize caps the long side and never enlarges', () => {
  expect(fitSize(4000, 3000)).toEqual({ width: 1600, height: 1200 })
  expect(fitSize(3000, 4000)).toEqual({ width: 1200, height: 1600 })
  expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 })
})

test('exifGps reads the location the canvas would drop', () => {
  expect(exifGps(jpegWithGps())).toBe('12.966667,77.591667')
  expect(exifGps(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
  expect(exifGps(new Uint8Array([1, 2, 3]))).toBeNull()
})

test('a big camera photo is shrunk on the phone before it uploads', async ({ page }) => {
  test.setTimeout(120_000)
  await localOnly(page)
  await enter(page)
  const camera = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4000
    canvas.height = 3000
    const ctx = canvas.getContext('2d')!
    const pixels = ctx.createImageData(4000, 3000)
    for (let i = 0; i < pixels.data.length; i++)
      pixels.data[i] = i % 4 === 3 ? 255 : Math.random() * 255
    ctx.putImageData(pixels, 0, 0)
    ctx.fillStyle = '#000'
    ctx.font = '120px sans-serif'
    ctx.fillText('Chai 15  Samosa 20', 400, 1500)
    return canvas.toDataURL('image/jpeg', 0.98).split(',')[1]
  })
  const original = Buffer.from(camera, 'base64')
  let sent = { bytes: 0, type: '', width: 0 }
  await page.route('**/api/v1/photos?*', async (route) => {
    const request = route.request()
    const body = request.postDataBuffer()!
    const width = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob()
      return (await createImageBitmap(blob)).width
    }, body.toString('base64'))
    sent = { bytes: body.length, type: request.headers()['content-type'] ?? '', width }
    await route.fulfill({
      json: {
        status: 'nothing_to_propose',
        photo_kind: 'menu',
        proposal: null,
        extraction: {
          uncertain: [],
          business: { name: '', category: '', location: '', hours: '', phone: '' },
          products: [],
        },
      },
    })
  })
  await page.getByRole('banner').getByRole('button', { name: 'Add shop details' }).click()
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await page.getByRole('button', { name: 'Shop photo' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('camera-card').getByRole('button', { name: 'Upload instead' }).click()
  await (await chooser).setFiles({ name: 'camera.jpg', mimeType: 'image/jpeg', buffer: original })
  await expect.poll(() => sent.bytes).toBeGreaterThan(0)
  expect(sent.type).toBe('image/jpeg')
  expect(sent.width).toBe(1600)
  expect(sent.bytes).toBeLessThan(original.length / 2)
})
