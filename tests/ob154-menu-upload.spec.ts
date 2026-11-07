import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('OB-154: photo menu import survives HTTP upload, review and save', async ({ request }) => {
  await request.get('/api/v1/bootstrap')
  const me = await (await request.get('/api/v1/me')).json()
  expect(
    (
      await request.post('/api/v1/consent', {
        data: { version: me.legal_version, terms: true, privacy: true },
      })
    ).ok(),
  ).toBeTruthy()
  const shopDraft = await (
    await request.post('/api/v1/proposals', {
      data: {
        kind: 'business',
        revision: 0,
        business: { name: 'Menu speed fixture', currency: 'INR' },
      },
    })
  ).json()
  const shop = await (
    await request.post(`/api/v1/proposals/${shopDraft.id}/approve`, {
      data: { digest: shopDraft.digest },
    })
  ).json()
  const base = `/api/v1/businesses/${shop.business_id}`
  const photos = ['excel', 'petpooja'].map((name) =>
    readFileSync(`backend/tests/fixtures/screen-photos/${name}/photo.png`).toString('base64'),
  )
  const analyzed = await request.post(`${base}/connect/analyze`, {
    headers: { 'Content-Type': 'application/vnd.chalkboard.screen-photos+json' },
    data: JSON.stringify({ photos }),
  })
  expect(analyzed.ok()).toBeTruthy()
  const result = await analyzed.json()
  expect(result.total_rows).toBe(2)
  expect(result.cell_flags).toHaveLength(1)
  const sync = await request.post(`${base}/connect/sync`, {
    data: {
      content: result.photo_content,
      content_type: 'application/json',
      mapping: result.mapping,
    },
  })
  expect(sync.ok()).toBeTruthy()
  expect(await (await request.get(`${base}/inventory`)).json()).toEqual([])
  const { proposal } = await sync.json()
  const saved = await request.post(`/api/v1/proposals/${proposal.id}/approve`, {
    data: { digest: proposal.digest },
  })
  expect(saved.ok()).toBeTruthy()
  const inventory = await (await request.get(`${base}/inventory`)).json()
  expect(inventory.map((item: { name: string }) => item.name).sort()).toEqual([
    'Mango Lassi',
    'Masala Dosa',
  ])
})
