import { test, expect } from '@playwright/test'

test.setTimeout(120_000)

test('public demo tour reaches step five without page errors (OB-51: 7 real steps)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/demo')
  await expect(page.getByText('Demo shop · sample data', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  const welcome = page.getByRole('dialog')
  await welcome.getByRole('button', { name: 'Take the tour' }).click()
  const tour = page.getByRole('dialog')
  await expect(tour.getByText('1 of 7')).toBeVisible({ timeout: 30_000 })
  for (let step = 0; step < 3; step++) {
    await tour.getByRole('button', { name: 'Next' }).click()
  }
  await expect(tour.getByText('4 of 7')).toBeVisible()
  await expect(tour.getByText('Tomorrow’s prep plan', { exact: true })).toBeVisible()
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour.getByText('5 of 7')).toBeVisible()
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
