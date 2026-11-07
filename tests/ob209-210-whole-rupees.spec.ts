import { expect, test } from '@playwright/test'
import { closeSheet, enter, localOnly, phone, reviewName, seedShop } from './stories/support.js'

test.use(phone)
test.skip(({ isMobile }) => !isMobile, 'Phone story')

const PAISE_ZEROES = /₹[\d,]+\.00(?!\d)/

// OB-209 / OB-210: whole rupees never read ".00" on the owner's Menu list and the
// "Check before saving" review; no GSAP "target not found" warning while those screens animate.
test('OB-209 OB-210: Menu list and review sheet show whole rupees; no GSAP warnings', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const warnings: string[] = []
  page.on('console', (message) => {
    if (/GSAP target .* not found/i.test(message.text())) warnings.push(message.text())
  })
  await localOnly(page)
  await enter(page)
  await seedShop(page)
  await closeSheet(page)

  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('Kopi is 20 rupees now')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  const review = page.getByRole('dialog', { name: reviewName })
  await expect(review).toContainText('₹20 / cup')
  expect(await review.innerText()).not.toMatch(PAISE_ZEROES)
  await review.getByRole('button', { name: 'Confirm and save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Shop', exact: true }).click()
  await page.getByRole('button', { name: /^Menu/ }).click()
  const menu = page.getByRole('dialog', { name: 'Menu' })
  await expect(menu).toContainText('₹20')
  expect(await menu.innerText()).not.toMatch(PAISE_ZEROES)
  expect(warnings).toEqual([])
})
