import { test, expect } from '@playwright/test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
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
let shopId = ''

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
  // One real shared shop whose location is a full home address, in a fresh local file.
  const database = join(dist, 'merchant.sqlite3')
  const seed = spawnSync('uv', ['run', 'python', '-m', 'tests.seo_seed', database], {
    cwd: 'backend',
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  })
  shopId = seed.stdout.trim().split(/\s+/).pop() ?? ''
  if (!/^[\w-]+$/.test(shopId)) throw new Error(`seed failed: ${seed.stderr}`)
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn(
    'uv',
    ['run', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
    {
      cwd: 'backend',
      env: {
        ...process.env,
        APP_ENV: 'test',
        FRONTEND_DIST: dist,
        V1_ENABLED: 'true',
        COACH_MODE: 'offline',
        MERCHANT_BACKEND: 'sqlite',
        MERCHANT_DATABASE: database,
        RECALL_PATH: join(dist, 'recall'),
      },
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
  const rules = await robots.text()
  expect(rules).toContain(`Sitemap: ${base}/sitemap.xml`)
  // Previews need the shop photo; the rest of the API stays closed to crawlers.
  expect(rules).toContain('Disallow: /api/\n')
  expect(rules).toContain('Allow: /api/v1/public/shops/*/photos/*.jpg$\n')
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

test('OB-273: a shared shop preview shows its name and area, never the street address', async ({
  request,
}) => {
  for (const headers of [WHATSAPP, FACEBOOK]) {
    const page = await request.get(`${base}/explore/s/${shopId}`, { headers })
    const html = await page.text()
    expect(html).toContain('<title>Meena Home Bakes — Singapore</title>')
    expect(html).toContain('property="og:title" content="Meena Home Bakes — Singapore"')
    expect(html).toContain(`property="og:url" content="${base}/explore/s/${shopId}"`)
    for (const secret of ['412', 'Bedok', '#05', '460412', 'Block', '8123'])
      expect(html).not.toContain(secret)
  }
})

test('OB-273: business pages and the demo are noindex on every host', async ({ request }) => {
  const business = { Host: 'business.chalkboard.shreyaan.work' }
  for (const path of ['/coach', '/new-shop', '/settings', `/explore/s/${shopId}`]) {
    const page = await request.get(base + path, { headers: business })
    expect(page.headers()['x-robots-tag'], path).toContain('noindex')
    expect(await page.text(), path).toContain('name="robots" content="noindex')
  }
  for (const headers of [{}, business]) {
    for (const path of ['/explore/demo', '/explore/demo/browse']) {
      const page = await request.get(base + path, { headers })
      expect(page.headers()['x-robots-tag'], path).toContain('noindex')
      expect(await page.text(), path).toContain('name="robots" content="noindex')
    }
  }
  expect(await (await request.get(`${base}/robots.txt`)).text()).toContain(
    'Disallow: /explore/demo\n',
  )
})
