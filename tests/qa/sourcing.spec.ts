import { test, expect, owner, say, audit, tamil, evidence } from './support.js'

test('sourcing labels demo suppliers, reviews exact quantities, receives reply and persists Orders', async ({
  page,
}, info) => {
  await owner(page)
  await say(page, 'My flour is running low')
  const suppliers = page.getByRole('list', { name: /suppliers nearby/ })
  await expect(suppliers).toBeVisible()
  await expect(suppliers.getByRole('listitem').first()).toContainText('Demo')
  const message = page.getByRole('textbox', { name: 'Message', exact: true })
  await message.fill('The second one looks good, order 20 kg flour and 5 kg sugar from them')
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'Send', exact: true }).click({ timeout: 1500 })
  } else await message.press('Enter')
  await expect(page.getByText('Nothing is sent until you tap Send. No payment.')).toBeVisible()
  await expect(page.getByText('20 kg', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Send to / }).click()
  await expect(page.getByText(/replied: “Confirmed:/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Automatic demo reply').first()).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Orders/ }).click()
  await expect(page.getByRole('dialog', { name: 'Orders' })).toContainText('Confirmed')
})

test('supplier results leave the touch Send control reachable', async ({ page }) => {
  await owner(page)
  await say(page, 'My flour is running low')
  await expect(page.getByRole('list', { name: /suppliers nearby/ })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Order from the first supplier')
  const send = page.getByRole('button', { name: 'Send', exact: true })
  await expect(send).toBeEnabled()
  const target = await send.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return {
      button: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hit: { tag: hit?.tagName, text: hit?.textContent?.slice(0, 100) },
      reachable: hit === el || el.contains(hit),
    }
  })
  await test
    .info()
    .attach('send-hit-target', { body: JSON.stringify(target), contentType: 'application/json' })
  await evidence(page, 'Q12-supplier-overlap')
  expect(target.reachable).toBe(true)
  await expect(send).toBeInViewport()
  await send.click({ timeout: 1500 })
})

test('empty Orders is keyboard dismissible and leaves owner navigation usable', async ({
  page,
}) => {
  await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Orders/ }).click()
  await audit(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'My shop', exact: true })).toBeVisible()
})

test('Tamil sourcing surface uses the shared locale without layout overflow', async ({ page }) => {
  await owner(page)
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await tamil(page)
  await page.locator('[data-tour="orders"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await audit(page, 'Q14')
})

test('populated Orders has valid list semantics and keyboard-operable rows', async ({ page }) => {
  const id = await owner(page)
  type Event = { kind: string; session_id?: string; data?: { id: string; version: number } }
  const stream = async (data: object) => {
    const response = await page.request.post('/api/v1/coach/stream', { data })
    expect(response.ok()).toBe(true)
    return (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as Event)
  }
  const first = await stream({ message: 'My flour is running low', business_id: id })
  const session = first.find((event) => event.kind === 'ready')!.session_id
  const second = await stream({
    message: 'order 20 kg flour from the second one',
    business_id: id,
    session_id: session,
  })
  const order = second.find((event) => event.kind === 'order')!.data!
  expect(
    (
      await page.request.post(`/api/v1/businesses/${id}/orders/${order.id}/send`, {
        data: { version: order.version },
      })
    ).ok(),
  ).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Continue local preview' }).click()
  await page.getByRole('button', { name: 'My shop', exact: true }).click()
  await page.getByRole('button', { name: /^Orders/ }).click()
  await expect(page.getByRole('dialog', { name: 'Orders' })).toContainText('20 kg')
  await evidence(page, 'Q13-orders-list')
  await audit(page)
  const row = page.getByRole('dialog').getByRole('listitem').first().getByRole('button')
  await row.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Orders', exact: true })).toBeVisible()
})
