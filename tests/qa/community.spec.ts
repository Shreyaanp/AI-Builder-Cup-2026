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
  let outage = true
  await page.route('**/public/shops/*/tips', (r) =>
    outage ? r.fulfill({ status: 503, json: {} }) : r.fallback(),
  )
  await page.goto(`/s/${id}`)
  const tips = page.getByRole('region', { name: 'Neighbour tips' })
  // Fixed Q3: a failed load says so and offers Retry; it never claims an empty community.
  await expect(tips.getByRole('alert')).toContainText('Tips couldn’t load')
  await expect(page.getByText('No tips yet. Be the first to help a neighbour.')).toHaveCount(0)
  await tips.scrollIntoViewIfNeeded()
  if (test.info().project.name === 'phone')
    await tips.screenshot({ path: 'docs/qa/Q3-tips-outage.png', animations: 'disabled' })
  outage = false
  await tips.getByRole('button', { name: 'Try again' }).click()
  await expect(tips.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('No tips yet. Be the first to help a neighbour.')).toBeVisible()
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
  let outage = true
  await page.route('**/public/updates?*', (r) =>
    outage ? r.fulfill({ status: 503, json: {} }) : r.fallback(),
  )
  await page.goto('/explore/saved')
  // Fixed Q4: the feed failure is described as such, placeholders stop, and Retry recovers.
  await expect(page.getByRole('alert')).toContainText('Updates couldn’t load')
  await expect(page.getByText('This chat is no longer available.')).toHaveCount(0)
  await expect(page.locator('.MuiSkeleton-root')).toHaveCount(0)
  await evidence(page, 'Q4-saved-outage')
  outage = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('chalkboard.customer.follows'))).toContain(
    id,
  )
})

test('clear preferences reports server failure instead of silently doing nothing', async ({
  page,
}) => {
  await page.request.post('/api/v1/customer/session', { data: { name: 'QA customer' } })
  await page.request.put('/api/v1/customer/preferences', { data: { vegetarian: true } })
  await page.goto('/explore/')
  await page.getByRole('button', { name: 'Profile and preferences' }).click()
  let outage = true
  await page.route('**/customer/preferences', (r) =>
    outage ? r.fulfill({ status: 503, json: {} }) : r.fallback(),
  )
  await page.getByRole('button', { name: 'Clear preferences and searches' }).click()
  const dialog = page.getByRole('dialog')
  // Fixed Q5: the refused deletion is announced, the preference stays, and Retry completes it.
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t clear')
  await expect(dialog).toContainText('Vegetarian')
  await evidence(page, 'Q5-clear-preferences')
  outage = false
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog).toContainText('Cleared. Follows stay until you unfollow.')
  await expect(dialog.getByText('Vegetarian', { exact: true })).toHaveCount(0)
})

test.describe('Tamil community', () => {
  test.use({ locale: 'ta-IN' })
  test('Saved empty state is localized', async ({ page }) => {
    await page.goto('/explore/saved')
    await expect(page.locator('html')).toHaveAttribute('lang', /^ta/)
    // Fixed Q2: customer account and community copy follows the selected language.
    await expect(page.getByRole('heading', { name: 'சேமித்தவை', level: 1 })).toBeVisible()
    await expect(
      page.getByText('கடைகளின் செய்திகளை இங்கே பார்க்க அவற்றைப் பின்தொடருங்கள்'),
    ).toBeVisible()
    await expect(page.getByText('Follow shops to see their news here')).toHaveCount(0)
    await audit(page)
  })
})
