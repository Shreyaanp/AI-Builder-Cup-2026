import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// OB-273: crawlers that do not run JavaScript (WhatsApp, Facebook, search) read the page head and
// robots files from the real server. It runs here on a free port, never on a shared one.
const WHATSAPP = { 'User-Agent': 'WhatsApp/2' }
const FACEBOOK = { 'User-Agent': 'facebookexternalhit/1.1' }
let server: ChildProcess
let base = ''

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
    probe.on('error', reject)
  })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(120_000)
  const dist = mkdtempSync(join(tmpdir(), 'share-seo-'))
  writeFileSync(
    join(dist, 'index.html'),
    '<!doctype html><html><head><title>Old</title><meta name="description" content="old" /></head><body><div id="root"></div></body></html>',
  )
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn(
    'uv',
    ['run', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: 'backend',
      env: { ...process.env, APP_ENV: 'test', FRONTEND_DIST: dist },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  )
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/robots.txt`)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('server did not start')
})

test.afterAll(() => {
  if (!server?.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  else server.kill()
})

test('OB-273: home and how-it-works carry title, description and share tags without running JS', async ({
  request,
}) => {
  for (const [path, title] of [
    ['/', 'Chalkboard — your shop'],
    ['/how-it-works', 'How Chalkboard works'],
  ]) {
    for (const headers of [WHATSAPP, FACEBOOK]) {
      const html = await (await request.get(base + path, { headers })).text()
      expect(html).toContain(`<title>${title}`)
      for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card'])
        expect(html).toContain(key)
      expect(html).not.toContain('content="old"')
    }
  }
})

test('OB-273: robots.txt and sitemap.xml are real text and xml, not 404 json', async ({
  request,
}) => {
  const robots = await request.get(`${base}/robots.txt`)
  expect(robots.status()).toBe(200)
  expect(robots.headers()['content-type']).toContain('text/plain')
  expect(await robots.text()).toContain(`Sitemap: ${base}/sitemap.xml`)
  const sitemap = await request.get(`${base}/sitemap.xml`)
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()['content-type']).toContain('xml')
  expect(await sitemap.text()).toContain('<urlset')
})

test('OB-273: /demo is noindex and business host is closed to crawlers', async ({ request }) => {
  const demo = await request.get(`${base}/demo`)
  expect(demo.headers()['x-robots-tag']).toContain('noindex')
  expect(await demo.text()).toContain('name="robots" content="noindex')
  const robots = await request.get(`${base}/robots.txt`, {
    headers: { Host: 'business.chalkboard.shreyaan.work' },
  })
  expect(await robots.text()).toContain('Disallow: /\n')
})
