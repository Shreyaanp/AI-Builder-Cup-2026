import { test, expect, owner, publish, audit, evidence } from './support.js'

test('signed-out Saved and Chats offer recovery; keyboard navigation works', async ({ page }) => {
  await page.goto('/explore/saved')
  await expect(page.getByText('Follow shops to see their news here')).toBeVisible()
  await audit(page)
  await page.getByRole('link', { name: 'Chats', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Your chats with shops live here')).toBeVisible()
})

test('follow persists on this device, merges on sign-in and can unfollow', async ({ page }) => {
  const id = await owner(page)
  await publish(page, id)
  await page.goto(`/s/${id}`)
  await page.getByRole('button', { name: /Follow Courtyard/ }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /Unfollow Courtyard/ })).toBeVisible()
  await page.goto('/explore/saved')
  await expect(page.getByRole('region', { name: 'Following' })).toContainText('Courtyard Chai')
  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect
    .poll(
      async () => (await (await page.request.get('/api/v1/customer/me')).json()).profile?.follows,
    )
    .toContain(id)
  await page.goto(`/s/${id}`)
  await page.getByRole('button', { name: /Unfollow Courtyard/ }).click()
  await page.goto('/explore/saved')
  await expect(page.getByText('Follow shops to see their news here')).toBeVisible()
})

test('tips validate abuse, publish literal text, persist, reach owner and delete', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'QA neighbour' } })
  await page.goto(`/s/${id}`)
  const tip = page.getByLabel('Your tip')
  await tip.fill('Call 98765 43210')
  await page.getByRole('button', { name: 'Post tip' }).click()
  await expect(page.getByText(/That tip can’t be shown/)).toBeVisible()
  await expect(tip).toHaveValue('Call 98765 43210')
  await tip.fill('Warm chai and friendly staff <b>literal</b>')
  await page.getByRole('button', { name: 'Post tip' }).click()
  await expect(page.getByText('Thanks! Your tip is live.')).toBeVisible()
  await page.reload()
  await expect(
    page.getByText('Warm chai and friendly staff <b>literal</b>', { exact: true }),
  ).toBeVisible()
  const tips = await (await page.request.get(`/api/v1/businesses/${id}/tips`)).json()
  expect(tips.tips[0].text).toContain('<b>literal</b>')
  await page.getByRole('button', { name: 'Remove my tip' }).click()
  await expect(
    page.getByText('Warm chai and friendly staff <b>literal</b>', { exact: true }),
  ).toHaveCount(0)
})

test('tips load failure must be distinct from an empty community', async ({ page }) => {
  const id = await owner(page)
  await publish(page, id)
  await page.route('**/public/shops/*/tips', (r) => r.fulfill({ status: 503, json: {} }))
  await page.goto(`/s/${id}`)
  await expect(page.getByText('No tips yet. Be the first to help a neighbour.')).toBeVisible()
  await page.getByRole('heading', { name: 'Neighbour tips' }).scrollIntoViewIfNeeded()
  if (test.info().project.name === 'phone')
    await page
      .getByRole('region', { name: 'Neighbour tips' })
      .screenshot({ path: 'docs/qa/Q3-tips-outage.png', animations: 'disabled' })
  // BUG Q3: Tips fetch errors are presented as a successful empty community.
  test.fail()
  await expect(page.getByText('No tips yet. Be the first to help a neighbour.')).toHaveCount(0)
})

test('Saved outage has a retry action and accurately describes the failed feed', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.addInitScript(
    (id) => localStorage.setItem('chalkboard.customer.follows', JSON.stringify([id])),
    id,
  )
  await page.route('**/public/updates?*', (r) => r.fulfill({ status: 503, json: {} }))
  await page.goto('/explore/saved')
  await expect(page.getByRole('alert')).toContainText('This chat is no longer available.')
  await evidence(page, 'Q4-saved-outage')
  // BUG Q4: Saved feed failure reports a lost chat, leaves skeletons and has no retry action.
  test.fail()
  await expect(page.getByRole('button', { name: /Retry|Try again/ })).toBeVisible({ timeout: 1000 })
})

test('clear preferences reports server failure instead of silently doing nothing', async ({
  page,
}) => {
  await page.request.post('/api/v1/customer/session', { data: { name: 'QA customer' } })
  await page.request.put('/api/v1/customer/preferences', { data: { vegetarian: true } })
  await page.goto('/explore/')
  await page.getByRole('button', { name: 'Profile and preferences' }).click()
  await page.route('**/customer/preferences', (r) => r.fulfill({ status: 503, json: {} }))
  await page.getByRole('button', { name: 'Clear preferences and searches' }).click()
  await expect(page.getByRole('dialog')).toContainText('Vegetarian')
  await evidence(page, 'Q5-clear-preferences')
  // BUG Q5: Failed privacy preference deletion is silently swallowed.
  test.fail()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible({ timeout: 1000 })
})

test.describe('Tamil community', () => {
  test.use({ locale: 'ta-IN' })
  test('Saved empty state is localized', async ({ page }) => {
    await page.goto('/explore/saved')
    await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
    await expect(page.getByText('Follow shops to see their news here')).toBeVisible()
    await audit(page)
    // BUG Q2: Customer account/navigation strings are hard-coded English in every locale.
    test.fail()
    await expect(page.getByText('Follow shops to see their news here')).toHaveCount(0)
  })
})
