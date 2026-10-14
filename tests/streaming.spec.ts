import { expect, test } from '@playwright/test'
import type { CoachEvent } from '../src/api/stream.js'

test('real Python stream completes without changing reviewed business facts', async ({ page }) => {
  await page.goto('/?classic=1')
  await expect(page).toHaveTitle(/Chalkboard/)
  await page.getByRole('textbox', { name: 'Your note', exact: true }).fill('I run a tea stall')
  const response = page.waitForResponse((item) => item.url().endsWith('/api/v1/coach/stream'))
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  const stream = await response
  expect(stream.headers()['content-type']).toContain('text/event-stream')
  await expect(page.getByLabel('Coach response')).toContainText('scripted reply')
  await expect(page.getByRole('textbox', { name: 'Your note', exact: true })).toHaveValue('')
  await expect(page.getByText('Offline demonstration · scripted response')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your business, coming together.' })).toBeVisible()
})

// FIXME: legacy ?classic=1 screen only; the V1 coach Stop is covered in coach-reliability.spec.ts.
test.fixme('stopping a real stream preserves the input and allows another turn', async ({
  page,
}) => {
  await page.goto('/?classic=1')
  const note = page.getByRole('textbox', { name: 'Your note', exact: true })
  await note.fill('Help with my bakery')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await page.getByRole('button', { name: 'Stop reply', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Reply stopped')
  await expect(note).toHaveValue('Help with my bakery')
  await expect(note).toBeEnabled()
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(note).toHaveValue('')
  await expect(page.getByLabel('Coach response')).toContainText('scripted reply')
})

test('an incomplete stream is reported and the note can be retried', async ({ page }) => {
  await page.route('**/api/v1/coach/stream', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"kind":"ready","mode":"offline"}\n\ndata: {"kind":"delta","text":"Partial"}\n\n',
    }),
  )
  await page.goto('/?classic=1')
  const note = page.getByRole('textbox', { name: 'Your note', exact: true })
  await note.fill('My grocery shop')
  await page.getByRole('button', { name: 'Add note', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('connection ended early')
  await expect(note).toHaveValue('My grocery shop')
  await expect(note).toBeEnabled()
})

test('stream decoder handles split UTF-8, CRLF and heartbeat frames', async ({ page }) => {
  await page.goto('/?classic=1')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/stream.ts'
    const { streamCoach } = await import(/* @vite-ignore */ modulePath)
    const originalFetch = window.fetch
    let requests = 0
    const events: CoachEvent[] = []
    window.fetch = async () => {
      requests += 1
      if (requests === 1) return new Response('{}', { status: 200 })
      const bytes = new TextEncoder().encode(
        ': heartbeat\r\n\r\ndata: {"kind":"delta","text":"नमस्ते"}\r\n\r\n' +
          'data: {"kind":"turn_complete"}\r\n\r\n',
      )
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
            controller.close()
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    }
    try {
      await streamCoach(
        { message: 'Hello', language: 'hi' },
        new AbortController().signal,
        (event: CoachEvent) => events.push(event),
      )
      return events
    } finally {
      window.fetch = originalFetch
    }
  })
  expect(result).toEqual([{ kind: 'delta', text: 'नमस्ते' }, { kind: 'turn_complete' }])
})
