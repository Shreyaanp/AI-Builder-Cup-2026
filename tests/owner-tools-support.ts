import { expect, type Page } from '@playwright/test'
import { enter, seedShop } from './stories/support.js'

export async function ownerTools(page: Page, pinned = false) {
  await enter(page)
  await seedShop(page, pinned)
}
/** Payments & rides is a Grow card; the coach guide is under You → Help. */
export async function openTool(page: Page, name: string) {
  const payments = name === 'Payments & rides'
  await page.getByRole('button', { name: payments ? 'Grow' : 'You', exact: true }).click()
  await page
    .getByRole('button', { name: payments ? /^Payments & rides/ : name, exact: !payments })
    .click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
}
export async function preparePayment(page: Page) {
  await openTool(page, 'Payments & rides')
  await page.getByRole('textbox', { name: 'UPI ID', exact: true }).fill('chai.shop@bank')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Amount (₹)', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Amount (₹)', exact: true }).fill('240.50')
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Tea & toast #4')
  await page.getByRole('button', { name: 'Create link', exact: true }).click()
  await expect(page.getByRole('img', { name: /QR.*240.50/ })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Open UPI', exact: true }).getAttribute('href')
  const url = new URL(href!)
  expect(url.protocol).toBe('upi:')
  expect(Object.fromEntries(url.searchParams)).toEqual({
    pa: 'chai.shop@bank',
    pn: 'Courtyard Chai · Bengaluru',
    am: '240.50',
    cu: 'INR',
    tn: 'Tea & toast #4',
  })
  return href!
}
