// Verify deliverable coverage and evidence integrity, not product completeness.
import { access, readFile, stat, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { stories } from './catalog.mjs'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const variants = ['phone-light', 'phone-dark', 'desktop-light', 'desktop-dark']
const allowed = new Set([
  'owner onboarding',
  'coach',
  'my shop',
  'customer',
  'passport/games',
  'supply chain',
  'trust',
])
let runs = 0,
  screens = 0,
  failures = 0,
  blocked = 0,
  viewportDrift = 0
const shas = new Set()
const layoutFindings = []
const accessibilityFindings = []
let manualContrastChecks = 0
for (const story of stories) {
  assert(allowed.has(story.area), `${story.id}: one recognized area owner required`)
  for (const screen of story.screens)
    for (const state of ['loading', 'empty', 'error', 'offline', 'success'])
      assert(screen[state]?.length, `${story.id}/${screen.name}: missing ${state}`)
  await access(`docs/briefs/fix-${story.id}.md`)
  for (const variant of variants) {
    const directory = `docs/stories/director/${story.id}/${variant}`
    const run = JSON.parse(await readFile(`${directory}/run.json`, 'utf8'))
    assert.equal(run.id, story.id)
    assert.equal(run.variant, variant)
    shas.add(run.sha)
    assert(run.serverRun, `${directory}: missing director server identity`)
    runs++
    if (run.status === 'failed') failures++
    if (run.status === 'blocked') blocked++
    assert((await stat(`${directory}/walk.webm`)).size > 1000, `${directory}: missing usable video`)
    assert(run.evidence.length > 0, `${directory}: no screenshots`)
    for (const evidence of run.evidence) {
      for (const suffix of ['.png', '.json', '-heatmap.svg'])
        await access(`${directory}/${evidence.name}${suffix}`)
      const metrics = JSON.parse(await readFile(`${directory}/${evidence.name}.json`, 'utf8'))
      const png = await readFile(`${directory}/${evidence.name}.png`)
      const recordingViewport = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
      assert.deepEqual(
        recordingViewport,
        variant.startsWith('phone') ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      )
      if (
        metrics.viewport.width !== recordingViewport.width ||
        metrics.viewport.height !== recordingViewport.height
      ) {
        viewportDrift++
        layoutFindings.push({
          story: story.id,
          variant,
          screen: evidence.name,
          recordingViewport,
          layoutViewport: metrics.viewport,
        })
      }
      if (metrics.accessibility.length)
        accessibilityFindings.push({
          story: story.id,
          variant,
          screen: evidence.name,
          rules: metrics.accessibility.map((v) => v.id),
        })
      manualContrastChecks += metrics.contrast.manualReview.length
      assert.equal(metrics.grid.length, 12)
      assert(metrics.grid.every((row) => row.length === 6))
      assert(metrics.contrast && metrics.accessibility)
      assert(
        metrics.loadedFonts.some((font) => font.includes('Google Sans Flex')),
        `${directory}/${evidence.name}: brand-font evidence missing`,
      )
      screens++
    }
  }
}
assert.equal(
  shas.size,
  1,
  'Do not aggregate different checkout SHAs without separate baseline reports',
)
const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    [...shas][0],
    checkoutSha,
    '--',
    'src',
    'backend',
    'public',
    'scripts',
    'tests',
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'playwright.config.ts',
    'tsconfig*.json',
  ],
  { stdio: 'pipe' },
)
const contracts = await readFile('STORIES.md', 'utf8')
for (const s of stories)
  assert(contracts.includes(`### ${s.id.toUpperCase()} ·`), `Missing ${s.id} contract`)
console.log(
  `${stories.length} contracts/briefs; ${runs} variant videos; ${screens} screenshot/metric/heatmap triplets; ${blocked} blocked paths; ${failures} execution failures; one baseline SHA.`,
)
const documents = [
  'docs/research/ux-2026.md',
  'docs/qa/story-scorecard.md',
  'docs/qa/director-house-checklist.md',
  'docs/stories/director/README.md',
  'docs/briefs/fix-my-shop-entrance.md',
  ...stories.map((s) => `docs/briefs/fix-${s.id}.md`),
]
let links = 0
for (const file of documents) {
  const content = await readFile(file, 'utf8')
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0]
    if (!target || /^https?:/.test(target)) continue
    await access(resolve(dirname(file), decodeURIComponent(target)))
    links++
  }
}
console.log(`${links} local document links resolve.`)
console.log(
  `${viewportDrift} layout-viewport drift observations retained as UX findings; raster/video configuration remains unchanged.`,
)
await writeFile(
  'docs/stories/director/verification.json',
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      sha: [...shas][0],
      checkoutSha,
      runtimeEquivalentToCheckout: true,
      stories: stories.length,
      runs,
      screens,
      blocked,
      failures,
      links,
      viewportDrift,
      layoutFindings,
      accessibilityFindings,
      manualContrastChecks,
    },
    null,
    2,
  ),
)
assert.equal(
  failures,
  0,
  'Execution failures remain; diagnose before calling the recording suite passing',
)
