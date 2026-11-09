import { expect, test, type Route } from '@playwright/test'
import { enter, localOnly } from './stories/support.js'
import { startNewShop } from './support/newShop.js'
import { FIRST_QUESTION } from './newShopTopics.js'

// OB-259 (#661): while a new-shop reply retries the owner sees "Reconnecting…", and a retry that
// fails leaves the error and the owner's words, never half a reply.
const HALF_REPLY = 'Your tea stall sounds lov'

test('OB-259 a failed retry shows Reconnecting, then no half reply', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone flow')
  test.setTimeout(90_000)
  await localOnly(page)
  await enter(page)
  await startNewShop(page)
  await page.getByRole('button', { name: 'Let’s begin' }).click()
  await expect(page.getByRole('log')).toContainText(FIRST_QUESTION)

  await page.route('**/api/v1/coach/stream', async (route: Route) => {
    if (route.request().headers()['last-event-id']) {
      // A real refusal takes a round trip; without it the state is too brief to see.
      await new Promise((resolve) => setTimeout(resolve, 900))
      return route.fulfill({ status: 503, json: { detail: 'unavailable' } })
    }
    const frames = [
      `id: 1\ndata: ${JSON.stringify({ kind: 'ready', session_id: 'retry-session' })}\n\n`,
      `id: 2\ndata: ${JSON.stringify({ kind: 'delta', text: HALF_REPLY })}\n\n`,
    ]
    // Ends without turn_complete: the connection dropped mid-reply.
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: frames.join(''),
    })
  })

  const note = page.getByRole('textbox').first()
  await note.fill('I run a tea stall')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toBeVisible({
    timeout: 15_000,
  })
  // The microphone notice is an alert too; this one is the failed reply.
  await expect(
    page.getByRole('alert').filter({ hasText: 'The reply didn’t finish. You' }),
  ).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('log')).not.toContainText(HALF_REPLY)
  await expect(note).toHaveValue('I run a tea stall')
  await expect(page.getByRole('status').filter({ hasText: 'Reconnecting…' })).toHaveCount(0)
})
