import { expect, test } from '@playwright/test'

test('Vite serves bundled fonts when node_modules is linked outside the checkout', async ({
  page,
}) => {
  const fontResponses: { url: string; status: number }[] = []
  page.on('response', (response) => {
    if (response.url().includes('google-sans-flex') && response.url().endsWith('.woff2'))
      fontResponses.push({ url: response.url(), status: response.status() })
  })
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)

  expect(fontResponses).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ url: expect.stringContaining('google-sans-flex'), status: 200 }),
    ]),
  )
  expect(fontResponses.every(({ status }) => status === 200)).toBe(true)
})
