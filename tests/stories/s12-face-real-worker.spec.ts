import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { enter, localOnly, seedShop } from './support.js'

/**
 * S12 with the real private face worker: FaceDialog → main app → face_worker.py and its models,
 * no fixture anywhere. Chrome's fake camera plays a real phone-style recording of a face
 * (backend/tests/fixtures/face/chrome-vp8.webm, looped), so the capture goes through the same
 * MediaRecorder, canvas sampling and upload as on a phone.
 *
 * Runs only with the worker on: FACE_WORKER_TOKEN=<any> starts it (playwright.config.ts) and
 * needs the models in backend/data/face-models (uv run --extra face python
 * scripts/fetch_face_models.py in backend/).
 */
const enabled = Boolean(process.env.FACE_WORKER_TOKEN)
const camera = resolve('test-results/face-fake-camera.y4m')
if (enabled) {
  // Chrome's fake camera reads raw Y4M: decode the committed recording into one.
  mkdirSync('test-results', { recursive: true })
  execFileSync(
    'uv',
    [
      'run',
      '--project',
      'backend',
      'python',
      '-c',
      `
import av, sys
source = av.open("backend/tests/fixtures/face/chrome-vp8.webm")
with open(sys.argv[1], "wb") as out:
    out.write(b"YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\\n")
    for frame in source.decode(video=0):
        frame = frame.reformat(width=640, height=480, format="yuv420p")
        out.write(b"FRAME\\n")
        for plane in frame.planes:
            data = bytes(plane)
            for row in range(plane.height):
                out.write(data[row * plane.line_size : row * plane.line_size + plane.width])
`,
      camera,
    ],
    { stdio: 'inherit' },
  )
}

test.use({
  permissions: ['camera'],
  launchOptions: {
    executablePath:
      process.env.CHROME_PATH ||
      (process.platform === 'win32'
        ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
        : undefined),
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${camera}`,
    ],
  },
})

test('a real face through the real worker is verified', async ({ page }) => {
  test.skip(!enabled, 'Set FACE_WORKER_TOKEN to run the real face worker.')
  test.setTimeout(120_000)
  const health = await page.request.get('http://127.0.0.1:3401/health', {
    headers: {
      Authorization: `Bearer ${process.env.FACE_WORKER_TOKEN}`,
      'X-Owner': 'spec',
    },
  })
  expect((await health.json()).models_ready, 'face models fetched').toBe(true)

  await localOnly(page)
  await enter(page)
  await seedShop(page, false, `Face Check ${Date.now().toString().slice(-6)}`)
  await page.getByRole('button', { name: 'You', exact: true }).click()
  await page.getByRole('button', { name: /^Privacy & your data/ }).click()
  const card = page.getByRole('region', { name: 'Verify it’s you' })
  await card.getByRole('button', { name: 'Verify it’s you' }).click()

  const dialog = page.getByRole('dialog', { name: 'Verify it’s you' })
  await dialog.getByLabel(/I agree to this face check/).check()
  const captured = page.waitForResponse(/\/api\/v1\/face\/challenges\/[^/]+\/capture$/, {
    timeout: 90_000,
  })
  await dialog.getByRole('button', { name: 'Open camera' }).click()
  const response = await captured
  const sent = response.request().headers()['content-type']
  const answer = (await response.json()) as { result: string; reason: string }
  test.info().annotations.push({ type: 'capture', description: `${sent} → ${answer.reason}` })
  expect(answer, `upload was ${sent}`).toMatchObject({ result: 'verified', reason: 'ok' })
  await expect(dialog.getByRole('heading', { name: 'You’re verified' })).toBeVisible()
})
