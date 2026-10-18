import { expect, test } from '@playwright/test'

// Captain gate (#335): preferences moved to per-side keys. A device-wide record written by an
// older app version (or a test) after the first load must still apply on the next load, and a
// later change on one side must not be undone by that old record.
test('a new device-wide preference is adopted by both sides; side changes then stick', async ({
  page,
}) => {
  await page.goto('/?app=business')
  await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
  await page.evaluate(() =>
    localStorage.setItem('niva.starter.preferences', JSON.stringify({ language: 'hi' })),
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'स्थानीय प्रीव्यू जारी रखें' })).toBeVisible()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('chalkboard.customer.preferences')!)),
  ).toMatchObject({ language: 'hi' })
  // The owner picks English on their side; the old record (still present) does not undo it.
  await page.evaluate(() =>
    localStorage.setItem('chalkboard.owner.preferences', JSON.stringify({ language: 'en' })),
  )
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
})
