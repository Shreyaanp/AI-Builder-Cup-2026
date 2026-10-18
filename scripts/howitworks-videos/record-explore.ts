import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { enter, localOnly } from '../../tests/stories/support.js'

const out = 'C:/Users/pshre/work/hiw-out'
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
})
let n = 0
const snap = async (page: Page, name: string) => {
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/g-${String(++n).padStart(2, '0')}-${name}.png` })
}
const photo = (name: string) =>
  fileURLToPath(
    new URL(`../../backend/tests/fixtures/screen-photos/${name}/photo.png`, import.meta.url),
  )

test('explore', async ({ page }) => {
  test.setTimeout(300_000)
  await localOnly(page)
  await enter(page)
  await page.getByRole('button', { name: 'Grow', exact: true }).click()
  await page.getByRole('button', { name: /^Purchase orders/ }).click()
  await page.getByRole('button', { name: 'Try supply demo', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Supply chain' })).toContainText(/runs out/)
  const shops = await (await page.request.get('/api/v1/businesses')).json()
  const id = shops[0].id
  const sup = await (await page.request.get(`/api/v1/businesses/${id}/supply`)).json()
  console.log('SUPPLY', JSON.stringify(sup).slice(0, 2500))
  const row = sup.suppliers[0]
  const put = await page.request.put(
    `/api/v1/businesses/${id}/supply/suppliers/${row.supplier.id}/rules`,
    {
      data: { version: row.version, rules: { ...row.rules, system_format: 'text' } },
    },
  )
  console.log('PUT', put.status(), (await put.text()).slice(0, 300))
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  const today = page.getByRole('region', { name: 'Supply chain' })
  await today.getByRole('button', { name: 'Reorder', exact: true }).click()
  await snap(page, 'draft')
  const card = page.getByRole('article').first()
  await card.getByRole('button', { name: 'Approve and send', exact: true }).click()
  await snap(page, 'sent')
  console.log('CARD', (await card.innerText()).replace(/\n+/g, ' | ').slice(0, 1500))
  await card
    .getByRole('button', { name: /supplier/i })
    .first()
    .click()
    .catch((e) => console.log('nobtn', e.message.slice(0, 100)))
  await snap(page, 'doc')
  await page.screenshot({ path: `${out}/g-doc-full.png`, fullPage: true })
  console.log('DOC', (await card.innerText()).replace(/\n+/g, ' | ').slice(0, 2500))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /Connect your system/i }).click()
  const connect = page.getByRole('dialog', { name: 'Connect your system' })
  await snap(page, 'connect')
  await connect.getByTestId('screen-gallery').setInputFiles([photo('petpooja')])
  await snap(page, 'picked')
  await connect.getByRole('button', { name: 'Read photos', exact: true }).click()
  await expect(connect.getByText('AI column mapping')).toBeVisible()
  await snap(page, 'mapped')
  await page.screenshot({ path: `${out}/g-mapped-full.png`, fullPage: true })
  await connect.getByRole('button', { name: 'Confirm & review import' }).click()
  await snap(page, 'review')
  console.log(
    'REVIEW',
    (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(-1200),
  )
})
