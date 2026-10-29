import {
  test,
  expect,
  enter,
  owner,
  say,
  confirm,
  image,
  voiceFixture,
  audit,
  evidence,
  tamil,
} from './support.js'

test('text upkeep reviews price and sold-out together before saving', async ({ page }) => {
  const id = await owner(page)
  await say(page, 'Kopi is 20 rupees now, kaya toast sold out')
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText(/₹20(?![.d])/)
  const before = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  expect(before.find((p: { name: string }) => p.name === 'Kopi').price).toBe(1800)
  await confirm(page)
  const after = await (await page.request.get(`/api/v1/businesses/${id}/inventory`)).json()
  expect(after.find((p: { name: string }) => p.name === 'Kopi').price).toBe(2000)
  expect(after.find((p: { name: string }) => p.name === 'Kaya toast').available).toBe(false)
})

test('photo is explicitly an offline fixture at the approval boundary and cancel saves nothing', async ({
  page,
}) => {
  await enter(page)
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles(await image(page))
  const review = page.getByRole('dialog', { name: 'Check before saving' })
  await expect(review).toContainText(/offline|fixture/i)
  await audit(page)
  await page.keyboard.press('Escape')
  expect(await (await page.request.get('/api/v1/businesses')).json()).toEqual([])
})

test('synthetic voice connects, ends, shows labelled transcript and releases control', async ({
  page,
}) => {
  await voiceFixture(page)
  await enter(page)
  await page.getByRole('button', { name: 'Press to talk', exact: true }).click()
  await page.getByRole('button', { name: 'Finish speaking', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Offline voice fixture received.')
  await expect(page.getByRole('button', { name: 'Press to talk', exact: true })).toBeVisible()
})

test('coach server failure preserves draft and retry recovers', async ({ page }) => {
  await enter(page)
  await page.route('**/coach/stream', (route) => route.fulfill({ status: 503, json: {} }))
  await say(page, 'Help me plan today')
  await expect(page.getByRole('alert').first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'Help me plan today',
  )
  await page.unroute('**/coach/stream')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('scripted reply')
})

test('Tamil coach responds in the selected language', async ({ page }) => {
  await owner(page)
  await tamil(page)
  await page.getByRole('textbox').fill('வணக்கம்')
  await page.getByRole('button', { name: 'அனுப்புங்கள்', exact: true }).click()
  const log = page.getByRole('log')
  await expect(log).toContainText('முன்பே எழுதிய பதில்')
  await evidence(page, 'Q1-tamil-coach')
  await expect(log).not.toContainText('This is a scripted reply')
})

test('actual offline coach preserves a failed draft and reconnect retry works', async ({
  page,
  context,
}) => {
  await enter(page)
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Help me plan this afternoon')
  await context.setOffline(true)
  try {
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(input).toHaveValue('Help me plan this afternoon')
  } finally {
    await context.setOffline(false)
  }
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('scripted reply')
})
