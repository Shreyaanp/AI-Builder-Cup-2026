import { test, expect, enter, owner, publish, prepare, approve, audit, tamil } from './support.js'
import { localOnly } from '../stories/support.js'

test('separate owner cannot read inventory, approvals or inbox; public page stays bounded', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await owner(page)
  await publish(page, id)
  const shop = (await (await page.request.get('/api/v1/businesses')).json())[0]
  const proposal = await prepare(page.request, {
    kind: 'business',
    business_id: id,
    revision: shop.revision,
    business: { name: 'Private pending change' },
  })
  const context = await browser.newContext({ baseURL })
  try {
    const bob = await context.newPage()
    await localOnly(bob)
    await enter(bob)
    expect(await (await bob.request.get('/api/v1/businesses')).json()).toEqual([])
    for (const path of [
      `/api/v1/businesses/${id}/inventory`,
      `/api/v1/businesses/${id}/inquiries`,
    ]) {
      expect((await bob.request.get(path)).status()).toBe(404)
    }
    expect((await approve(bob.request, proposal)).status()).toBe(404)
    const publicData = await (await bob.request.get(`/api/v1/public/shops/${id}`)).json()
    expect(JSON.stringify(publicData)).not.toContain('Private pending change')
  } finally {
    await context.close()
  }
})

test('separate customers cannot access each other’s threads', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.request.post('/api/v1/customer/session', { data: { name: 'Alice' } })
  const started = await (
    await page.request.post(`/api/v1/customer/shops/${id}/threads`, {
      data: { text: 'Alice private question' },
    })
  ).json()
  const context = await browser.newContext({ baseURL })
  try {
    await context.request.post('/api/v1/customer/session', { data: { name: 'Bob' } })
    const path = `/api/v1/customer/shops/${id}/threads/${started.thread.id}`
    expect((await context.request.get(path)).status()).toBe(404)
    expect(
      (
        await context.request.post(`${path}/messages`, { data: { text: 'Bob injection' } })
      ).status(),
    ).toBe(404)
    expect((await context.request.delete(path)).status()).toBe(404)
  } finally {
    await context.close()
  }
})

test('delete all owner data requires confirmation; cancel keeps shop; erase removes public data', async ({
  page,
}) => {
  const id = await owner(page)
  await publish(page, id)
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete everything?' })).toBeVisible()
  await audit(page)
  await page.keyboard.press('Escape')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
  expect((await page.request.delete('/api/v1/me/data')).ok()).toBe(true)
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  expect((await page.request.get(`/api/v1/public/shops/${id}`)).status()).toBe(404)
})

for (const appearance of ['light', 'dark'] as const) {
  test(`delete all shows progress, then a clear success and restarts (${appearance})`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value }))
    }, appearance)
    await owner(page)
    await page.getByRole('button', { name: 'Privacy', exact: true }).click()
    // Hold the real request so the progress state can be checked.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/v1/me/data', async (route) => {
      await held
      await route.fallback()
    })
    await page.getByRole('button', { name: 'Delete all my data' }).click()
    await page.getByRole('button', { name: 'Delete permanently' }).click()
    await expect(page.getByRole('progressbar', { name: /Deleting your data/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete all my data' })).toBeDisabled()
    await audit(page)
    release()
    await expect(
      page.getByRole('status').filter({ hasText: 'All your data was deleted' }),
    ).toBeVisible()
    await audit(page)
    await expect(page.getByRole('button', { name: 'Continue local preview' })).toBeVisible()
    expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
  })

  test(`partial erase names what is pending and Try again finishes (${appearance})`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('niva.starter.preferences', JSON.stringify({ appearance: value }))
    }, appearance)
    const id = await owner(page)
    await page.getByRole('button', { name: 'Privacy', exact: true }).click()
    // First attempt: the face worker and photo storage fail on the server.
    await page.route(
      '**/api/v1/me/data',
      (route) =>
        route.fulfill({
          json: {
            status: 'partial',
            erased: ['records', 'gallery', 'community', 'memory', 'conversations'],
            pending: ['face', 'photos'],
            retry_saved: true,
            businesses: 1,
            photos: 0,
            conversations: 0,
          },
        }),
      { times: 1 },
    )
    await page.getByRole('button', { name: 'Delete all my data' }).click()
    await page.getByRole('button', { name: 'Delete permanently' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'still being deleted' })
    await expect(alert).toContainText('Still pending: face data and photos')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await audit(page)
    expect(await (await page.request.get('/api/v1/businesses')).json()).toHaveLength(1)
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'All your data was deleted' }),
    ).toBeVisible()
    expect((await page.request.get(`/api/v1/public/shops/${id}`)).status()).toBe(404)
  })
}

test('failed erase request offers Try again', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await page.route('**/api/v1/me/data', (route) => route.abort(), { times: 1 })
  await page.getByRole('button', { name: 'Delete all my data' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'Deletion didn’t finish' })
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'All your data was deleted' }),
  ).toBeVisible()
})

test('Tamil privacy surface remains accessible', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'Privacy', exact: true }).click()
  await tamil(page)
  await audit(page)
})

test('legacy public inquiry route cannot bypass required customer sign-in', async ({
  page,
  browser,
  baseURL,
}) => {
  const id = await owner(page)
  await publish(page, id)
  const anonymous = await browser.newContext({ baseURL })
  try {
    expect((await anonymous.request.get('/api/v1/customer/me')).ok()).toBe(true)
    const response = await anonymous.request.post(`/api/v1/public/shops/${id}/inquiries`, {
      data: {
        name: 'Unverified stranger',
        contact: 'stranger@example.invalid',
        message: 'Anonymous chat bypass QA',
      },
    })
    // Q8 fixed: a new owner conversation needs a signed-in customer; nothing reaches Messages.
    expect(response.status()).toBe(401)
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    await expect(page.getByRole('button', { name: /^Messages 1/ })).toHaveCount(0)
  } finally {
    await anonymous.close()
  }
})
