import { expect, test } from '@playwright/test'

test('hosted mode requires Google sign-in before sending a private note', async ({ page }) => {
  let coachRequests = 0
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        auth_mode: 'firebase',
        firebase: {
          apiKey: 'fixture-browser-key',
          appId: '1:123:web:fixture',
          projectId: 'demo-ogoogle-local',
          authDomain: 'demo-ogoogle-local.firebaseapp.com',
        },
      },
    }),
  )
  await page.route('**/api/v1/coach/stream', (route) => {
    coachRequests += 1
    return route.abort()
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  const note = page.getByRole('textbox', { name: 'Your note', exact: true })
  await note.fill('A private merchant note')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeDisabled()
  await expect(note).toHaveValue('A private merchant note')
  expect(coachRequests).toBe(0)
})

test('missing sign-in configuration preserves inputs and shows a useful error', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({ json: { auth_mode: 'firebase', firebase: {} } }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Sign-in setup is unavailable')
  const note = page.getByRole('textbox', { name: 'Your note', exact: true })
  await note.fill('Keep this draft')
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeDisabled()
  await expect(note).toHaveValue('Keep this draft')
})
