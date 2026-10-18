// Short load test of the live service on NON-AI endpoints only (no Gemini, TTS, Vision or
// Document AI is ever called). Node 20+, no dependencies:
//   node scripts/load-cloud.mjs --vus 50 --seconds 60 --out docs/impact/scalability-load.json
// Readers loop over health, a customer shop page (HTML) and the app bundle (static file).
// One paced explorer calls the discovery list below its per-IP limit (30 a minute).
// Not called on purpose: /public/shops/{id} records a page view for the owner per request, and
// the coach, voice, ask and photo routes call models.
import { writeFileSync } from 'node:fs'

const ALLOWED = new Set([
  'chalkboard.shreyaan.work',
  'business.chalkboard.shreyaan.work',
  'ogoogle-ai-5dnlvslisq-el.a.run.app',
])
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((part) => part.trim().split(/\s+/)),
)
const origin = new URL(args.origin ?? 'https://chalkboard.shreyaan.work').origin
if (!ALLOWED.has(new URL(origin).hostname)) throw new Error(`Refusing unknown target ${origin}`)
const vus = Number(args.vus ?? 50)
const seconds = Number(args.seconds ?? 60)
const shop = args.shop ?? 'demo-w-401dd4ab3b-7'
const thinkMs = 100
const exploreEveryMs = 2500

const page = await fetch(`${origin}/explore/s/${shop}`)
const bundle = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
if (!page.ok || !bundle) throw new Error('Shop page or bundle not found')

const routes = {
  health: `${origin}/api/v1/health`,
  shop_page: `${origin}/explore/s/${shop}`,
  bundle: `${origin}${bundle}`,
  explore_list: `${origin}/api/v1/discover?lat=12.9716&lng=77.5946&radius=5000`,
}
const stats = Object.fromEntries(
  Object.keys(routes).map((name) => [name, { ms: [], errors: 0, status: {} }]),
)

async function hit(name) {
  const started = performance.now()
  let code = 'network'
  try {
    const response = await fetch(routes[name], { redirect: 'manual' })
    await response.arrayBuffer()
    code = response.status
  } catch {
    /* Counted as a network error below. */
  }
  const entry = stats[name]
  entry.ms.push(performance.now() - started)
  entry.status[code] = (entry.status[code] ?? 0) + 1
  if (!(code >= 200 && code < 300)) entry.errors += 1
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const deadline = Date.now() + seconds * 1000
const readers = ['health', 'shop_page', 'bundle']

async function reader(index) {
  for (let i = index; Date.now() < deadline; i++) {
    await hit(readers[i % readers.length])
    await sleep(thinkMs)
  }
}

async function explorer() {
  while (Date.now() < deadline) {
    const next = Date.now() + exploreEveryMs
    await hit('explore_list')
    await sleep(Math.max(0, next - Date.now()))
  }
}

const startedAt = new Date().toISOString()
const wall = performance.now()
await Promise.all([...Array.from({ length: vus }, (_, i) => reader(i)), explorer()])
const elapsed = (performance.now() - wall) / 1000

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
const round = (n) => Math.round(n * 10) / 10
const summary = (entry) => {
  const sorted = [...entry.ms].sort((a, b) => a - b)
  return {
    requests: sorted.length,
    errors: entry.errors,
    status: entry.status,
    rps: round(sorted.length / elapsed),
    p50_ms: round(pct(sorted, 0.5)),
    p95_ms: round(pct(sorted, 0.95)),
    p99_ms: round(pct(sorted, 0.99)),
    max_ms: round(sorted.at(-1)),
  }
}
const all = { ms: [], errors: 0, status: {} }
for (const entry of Object.values(stats)) {
  all.ms.push(...entry.ms)
  all.errors += entry.errors
  for (const [code, n] of Object.entries(entry.status))
    all.status[code] = (all.status[code] ?? 0) + n
}
const report = {
  started_at: startedAt,
  origin,
  vus,
  explorer_vus: 1,
  seconds: round(elapsed),
  think_ms: thinkMs,
  explore_every_ms: exploreEveryMs,
  total: summary(all),
  endpoints: Object.fromEntries(Object.entries(stats).map(([name, e]) => [name, summary(e)])),
}
console.log(JSON.stringify(report, null, 2))
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n')
