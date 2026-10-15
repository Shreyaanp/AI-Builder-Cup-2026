import {
  test,
  expect,
  enter,
  owner,
  publish,
  prepare,
  approve,
  audit,
  tamil,
  evidence,
} from './support.js'
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
    await page.reload()
    await page.getByRole('button', { name: 'Continue local preview' }).click()
    await page.getByRole('button', { name: 'My shop', exact: true }).click()
    await page.getByRole('button', { name: /^Messages 1/ }).click()
    await expect(page.getByRole('region', { name: /Messages/ })).toContainText(
      'Anonymous chat bypass QA',
    )
    await evidence(page, 'Q8-anonymous-bypass')
    // BUG Q8: Legacy public inquiry creation bypasses the required Google/customer sign-in gate.
    test.fail()
    expect(response.status()).toBe(401)
  } finally {
    await anonymous.close()
  }
})
