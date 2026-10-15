import { test, expect, owner, publish, audit, tamil } from './support.js'
import { LOCALES } from '../../src/i18n/locales.js'

test('QR stamps are daily, reload-persistent and honestly device-only', async ({ page }) => {
  const id = await owner(page)
  await publish(page, id)
  await page.goto(`/s/${id}?source=qr`)
  const card = page.getByRole('region', { name: 'Stamp card' })
  await expect(card.getByRole('status')).toContainText('1 stamps')
  await expect(card).toContainText('This card is stored on this phone.')
  await page.reload()
  await expect(card.getByRole('status')).toContainText('1 stamps')
  await audit(page)
})

test('theme toggles and persists after reload without blocking web use', async ({ page }) => {
  await page.goto('/explore/')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
  await audit(page)
})

test('all 15 languages are selectable and install is optional', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('combobox', { name: 'Language' }).click()
  expect(await page.getByRole('option').count()).toBe(LOCALES.length + 1)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Install app', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Install app' })).toContainText(
    'Installation is not available yet',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Tamil QR stamp labels wrap in both themes', async ({ page }) => {
  const id = await owner(page)
  await tamil(page)
  await publish(page, id)
  await page.goto(`/s/${id}?source=qr`)
  await expect(page.getByRole('region', { name: 'முத்திரை அட்டை' })).toBeVisible()
  await audit(page)
})
