import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test'

/** Raw phone recordings land here (outside the repo); compose.mjs cuts them into scenes. */
export const RAW = process.env.HIW_RAW ?? 'C:/Users/pshre/work/hiw-video/raw'
export const PHONE = { width: 390, height: 844 }
// The customer origin printed on screens and in QR codes, as on production.
export const PUBLIC_ORIGIN = 'https://chalkboard.shreyaan.work'

/**
 * Short, believable names for the seeded demo records (the owner's rule: no long or odd names).
 * Only what is shown changes; the data underneath is the seeded demo world.
 */
export const RENAME: [string, string][] = [
  ['Lantern Chai Corner (Demo) (Tour)', 'Chai Corner'],
  ['Milk shop (Supply demo)', 'Chai Corner'],
  ['Fresh Dairy (Demo)', 'Raju Dairy'],
  ['Lantern Tea Wholesale (Demo)', 'Raju Traders'],
  ['Lantern Chai Corner (Demo)', 'Lantern Tea House'],
  ['Offline template: ', ''],
]

export function relabel(text: string, origin: string) {
  let out = text.replaceAll(origin, PUBLIC_ORIGIN)
  for (const [from, to] of RENAME) out = out.replaceAll(from, to)
  return out
}

/** A phone at 390x844, device scale 3, touch, screencast from the first frame; taps ripple. */
export async function phone(browser: Browser, baseURL: string, name: string, extra: object = {}) {
  mkdirSync(RAW, { recursive: true })
  const context: BrowserContext = await browser.newContext({
    baseURL,
    viewport: PHONE,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    colorScheme: 'light',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            { name: 'niva.language.chosen', value: '1' },
            { name: 'chalkboard.explainer.owner.v1', value: '1' },
            { name: 'chalkboard.explainer.customer.v1', value: '1' },
            {
              name: 'niva.starter.preferences',
              value: JSON.stringify({ language: 'en', appearance: 'light' }),
            },
          ],
        },
      ],
    },
    ...extra,
  })
  await context.addInitScript(() => {
    addEventListener(
      'pointerdown',
      (event) => {
        const dot = document.createElement('div')
        dot.style.cssText = `position:fixed;left:${event.clientX - 22}px;top:${event.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(30,90,60,.28);border:2px solid rgba(30,90,60,.55);pointer-events:none;z-index:2147483647;transition:transform .45s ease-out,opacity .45s ease-out`
        document.documentElement.appendChild(dot)
        requestAnimationFrame(() => {
          dot.style.transform = 'scale(1.6)'
          dot.style.opacity = '0'
        })
        setTimeout(() => dot.remove(), 600)
      },
      true,
    )
  })
  const page = await context.newPage()
  const clock = new SceneClock()
  const cast = new Screencast(name, clock)
  await cast.start(page)
  return { context, page, clock, cast }
}

/** Scene marks in seconds from the start of the recording. */
export class SceneClock {
  private t0 = Date.now()
  scenes: { name: string; start: number; end: number }[] = []
  private open: { name: string; start: number } | null = null
  now() {
    return (Date.now() - this.t0) / 1000
  }
  start(name: string) {
    this.open = { name, start: this.now() }
  }
  async end(page: Page, hold = 1.5) {
    await page.waitForTimeout(hold * 1000)
    if (this.open) this.scenes.push({ ...this.open, end: this.now() })
    this.open = null
  }
  save(file: string) {
    writeFileSync(`${RAW}/${file}`, JSON.stringify(this.scenes, null, 2))
  }
}

/** Only the local preview: nothing leaves the machine while recording. */
export async function localOnly(page: Page) {
  await page.route('**/*', (route) =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.fallback()
      : route.abort(),
  )
}

/**
 * Relabels every JSON API response (names, public origin) inside the page, before the app reads
 * it. Streams pass straight through.
 */
export async function relabelApi(page: Page, origin: string) {
  await page.addInitScript(
    ({ pairs, origin, publicOrigin }) => {
      const real = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const response = await real(input, init)
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const type = response.headers.get('content-type') ?? ''
        // Long-lived streams pass through; the customer ask (a short event stream) is buffered.
        const ask = url.includes('/discover/ask') && type.includes('event-stream')
        if (
          !url.includes('/api/v1/') ||
          url.split('?')[0]!.endsWith('/stream') ||
          (!type.includes('json') && !ask)
        )
          return response
        let text = (await response.text()).replaceAll(origin, publicOrigin)
        for (const [from, to] of pairs) text = text.replaceAll(from, to)
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }
    },
    { pairs: RENAME, origin, publicOrigin: PUBLIC_ORIGIN },
  )
}

/** Smoothly brings an element to the middle of whatever scrolls around it. */
export const glideTo = async (page: Page, locator: ReturnType<Page['locator']>) => {
  await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await page.waitForTimeout(900)
}

/** The dev server's first cold load can re-optimise and fail a lazy screen: reload until ready. */
export async function warm(page: Page, ready = 'Continue local preview', path = '/') {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto(path)
    const up = await page
      .getByRole('button', { name: ready })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (up) return
  }
  throw new Error('The local preview never loaded')
}

/**
 * A sharp phone recording: Chrome's screencast at device pixels (Playwright's own video records
 * CSS pixels). Frames arrive when the screen changes; `finish` turns them into a 30 fps MP4 whose
 * time zero matches the SceneClock.
 */
export class Screencast {
  private frames: { file: string; at: number }[] = []
  private dir: string
  private session: CDPSession | null = null
  constructor(
    private name: string,
    private clock: SceneClock,
  ) {
    this.dir = `${RAW}/${name}-frames`
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
  }
  async start(page: Page) {
    this.session = await page.context().newCDPSession(page)
    this.session.on('Page.screencastFrame', (frame) => {
      const file = `${this.dir}/${String(this.frames.length).padStart(5, '0')}.jpg`
      writeFileSync(file, Buffer.from(frame.data, 'base64'))
      this.frames.push({ file, at: this.clock.now() })
      void this.session?.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
    })
    await this.session.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: PHONE.width * 3,
      maxHeight: PHONE.height * 3,
    })
  }
  async finish() {
    await this.session?.send('Page.stopScreencast').catch(() => undefined)
    const end = this.clock.now()
    const lines = ['ffconcat version 1.0']
    this.frames.forEach((frame, index) => {
      const next = this.frames[index + 1]?.at ?? end
      lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.at).toFixed(3)}`)
    })
    lines.push(`file '${this.frames.at(-1)!.file}'`)
    const list = `${RAW}/${this.name}-frames.txt`
    writeFileSync(list, lines.join('\n'))
    // The first frame covers the time before it arrived, so the clock and the video agree.
    const lead = this.frames[0]!.at
    const run = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-vf',
        `tpad=start_duration=${lead.toFixed(3)}:start_mode=clone,fps=30,scale=${PHONE.width * 3}:${PHONE.height * 3}:flags=lanczos,format=yuv420p`,
        '-c:v',
        'libx264',
        '-crf',
        '16',
        '-preset',
        'medium',
        `${RAW}/${this.name}.mp4`,
      ],
      { stdio: 'inherit' },
    )
    if (run.status !== 0) throw new Error('ffmpeg could not assemble the recording')
  }
}
