// Builds the How it works videos: a HyperFrames composition per flow and caption language
// around the real phone recordings (record-*.ts), renders it, and writes small web MP4s plus
// posters to public/how-it-works/. Foreground only:
//   node scripts/howitworks-videos/compose.mjs [vendor|customer] [en|hi]
// Captions and labels come from src/features/frontdoors/howItWorksCopy.ts (Node strips its types).
// Each scene lasts as long as its voiceover line (voice.mjs) needs; slower footage, never cut words.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagesEnglish, pagesHindi } from '../../src/features/frontdoors/howItWorksCopy.ts'
import { voiceover } from './voice.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const work = process.env.HIW_WORK ?? 'C:/Users/pshre/work/hiw-video'
const raw = join(work, 'raw')
const out = join(repo, 'public/how-it-works')
const W = 720
const H = 1280
// Chalkboard theme tokens (src/design/chalkboard.ts, light).
const C = {
  surface: '#FBF7EC',
  low: '#F5F0E2',
  high: '#E9E2D0',
  ink: '#1E1B13',
  muted: '#4D4639',
  primary: '#1F5C42',
  onPrimary: '#FFFFFF',
  primaryC: '#B7EBCF',
  onPrimaryC: '#0A3A27',
  secondaryC: '#FFE08A',
  whatsapp: '#DCF8C6',
}

// Scene order and the caption each one carries; `card` scenes are motion graphics, not footage.
const FLOWS = {
  vendor: {
    label: (t) => t.forShops,
    line: (t) => t.shopsLine,
    captions: (t) => t.vendorCaptions,
    scenes: ['talk', 'live', 'today', 'reorder', { card: 'channels', duration: 5.2 }, 'import'],
    rates: { import: 1.25 },
    poster: 'live',
  },
  customer: {
    label: (t) => t.forCustomers,
    line: (t) => t.customersLine,
    captions: (t) => t.customerCaptions,
    scenes: ['find', 'shop', 'scan', 'passport'],
    rates: {},
    poster: 'scan',
  },
}
const INTRO = 1.8
const END = 2.4
// Breath before each line starts, and after it ends before the next scene.
const LEAD = 0.25
const TAIL = 0.45
// Footage never plays slower than this to fit a line; the scene holds its last frame instead.
const SLOWEST = 0.6

const esc = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function orderMessage() {
  // The order text the app wrote for the wholesaler (record-vendor.ts saved it), with ₹.
  const file = join(raw, 'vendor-order.txt')
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return text
    .replace(/\*/g, '')
    .replace(
      /INR\s?([\d.,]+)/g,
      (_, n) => `₹${Number(n.replace(/,/g, '')).toLocaleString('en-IN')}`,
    )
    .trim()
    .split('\n')
}

async function build(flowName, lang) {
  const flow = FLOWS[flowName]
  const t = lang === 'hi' ? pagesHindi : pagesEnglish
  // [intro, ...scenes, end]: one spoken line each.
  const voice = await voiceover(flowName, lang)
  if (voice.length !== flow.scenes.length + 2)
    throw new Error(
      `${flowName}-${lang}: ${voice.length} voice lines for ${flow.scenes.length} scenes`,
    )
  const needs = (clip) => LEAD + clip.seconds + TAIL
  const intro = Math.max(INTRO, needs(voice[0]))
  const endHold = Math.max(END, needs(voice.at(-1)) + 0.4)
  const marks = JSON.parse(readFileSync(join(raw, `${flowName}.json`), 'utf8'))
  const byName = Object.fromEntries(marks.map((m) => [m.name, m]))
  const captions = flow.captions(t)
  const dir = join(work, `${flowName}-${lang}`)
  mkdirSync(join(dir, 'assets'), { recursive: true })
  copyFileSync(join(raw, `${flowName}.mp4`), join(dir, 'assets', `${flowName}.mp4`))
  copyFileSync(join(repo, 'node_modules/gsap/dist/gsap.min.js'), join(dir, 'assets/gsap.min.js'))
  copyFileSync(
    join(
      repo,
      'node_modules/@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-wght-normal.woff2',
    ),
    join(dir, 'assets/google-sans-flex.woff2'),
  )

  let at = intro
  const shots = []
  const caps = []
  // When each voice line starts: [intro, ...scenes, end].
  const lines = [LEAD]
  const steps = flow.scenes.length
  flow.scenes.forEach((scene, index) => {
    const need = needs(voice[index + 1])
    lines.push(at + LEAD)
    if (typeof scene === 'object') {
      const duration = +Math.max(scene.duration, need).toFixed(3)
      shots.push({ card: scene.card, start: at, duration })
      caps.push({ index, start: at, duration })
      at += duration
      return
    }
    const mark = byName[scene]
    if (!mark) throw new Error(`No recording mark for ${flowName}/${scene}`)
    const footage = mark.end - mark.start
    // Slow the footage to fit the line (never below SLOWEST), then hold its last frame.
    const rate = +Math.max(SLOWEST, Math.min(flow.rates[scene] ?? 1, footage / need)).toFixed(3)
    const duration = +(footage / rate).toFixed(3)
    const length = +Math.max(duration, need).toFixed(3)
    shots.push({ scene, start: at, duration, media: mark.start, rate })
    if (length - duration > 0.05)
      shots.push({
        hold: scene,
        start: at + duration,
        duration: +(length - duration).toFixed(3),
        media: mark.end - 0.1,
      })
    caps.push({ index, start: at, duration: length })
    at += length
  })
  const endStart = +at.toFixed(3)
  lines.push(endStart + LEAD)
  const total = +(at + endHold).toFixed(3)
  const footageEnd = shots.filter((s) => s.scene).at(-1)

  const video = (s) =>
    s.hold
      ? `<video id="hold-${s.hold}" class="clip shot" src="assets/${flowName}.mp4" muted playsinline data-start="${s.start.toFixed(3)}" data-duration="${s.duration}" data-media-start="${s.media.toFixed(3)}" data-track-index="1"></video>`
      : `<video id="shot-${s.scene}" class="clip shot" src="assets/${flowName}.mp4" muted playsinline data-start="${s.start.toFixed(3)}" data-duration="${s.duration}" data-media-start="${s.media.toFixed(3)}"${s.rate !== 1 ? ` data-playback-rate="${s.rate}"` : ''} data-track-index="1"></video>`
  const message = orderMessage()
  const channels = (s) => `
      <section id="channels" class="clip card-scene" data-start="${s.start.toFixed(3)}" data-duration="${s.duration}" data-track-index="2">
        <div class="row big" id="ch-small">
          <div class="who"><span class="dot"></span>${esc(t.channelSmall)} · <b>Chai Corner</b></div>
          <div class="bubble">
            <div class="to">${esc(t.orderTo)}</div>
            ${message.map((line) => `<div class="msg">${esc(line)}</div>`).join('')}
            <div class="ticks">✓✓</div>
          </div>
          <div class="how">${esc(t.channelSmallHow)}</div>
        </div>
        <div class="row" id="ch-mid"><div class="who">${esc(t.channelMid)}</div><div class="how pill">${esc(t.channelMidHow)}</div></div>
        <div class="row" id="ch-big"><div class="who">${esc(t.channelBig)}</div><div class="how pill">${esc(t.channelBigHow)}</div></div>
      </section>`

  const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>Chalkboard · ${esc(flow.label(t))}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Google Sans Flex'; src: url('assets/google-sans-flex.woff2') format('woff2'); font-weight: 100 1000; }
      @font-face { font-family: 'Devanagari UI'; src: local('Nirmala UI'), local('Noto Sans Devanagari'); }
      body { margin: 0; background: ${C.surface}; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: ${C.surface};
        font-family: 'Google Sans Flex', 'Devanagari UI', sans-serif; color: ${C.ink}; }
      .blob { position: absolute; border-radius: 50%; background: ${C.primaryC}; opacity: 0.55; }
      .blob.a { width: 420px; height: 420px; right: -170px; top: -150px; }
      .blob.b { width: 300px; height: 300px; left: -150px; bottom: -120px; background: ${C.secondaryC}; opacity: 0.45; }
      .top { position: absolute; left: 40px; right: 40px; top: 40px; display: flex; align-items: center; justify-content: space-between; }
      .chip { display: inline-flex; align-items: center; gap: 10px; padding: 8px 18px; border-radius: 999px; background: ${C.primary}; color: ${C.onPrimary}; font-size: 24px; font-weight: 600; }
      .count { font-size: 24px; font-weight: 600; color: ${C.muted}; font-variant-numeric: tabular-nums; }
      .caption { position: absolute; left: 40px; right: 40px; top: 108px; height: 120px; display: flex; align-items: center; }
      .caption span { display: block; font-size: 46px; line-height: 1.18; font-weight: 700; letter-spacing: -0.01em; }
      #phone { position: absolute; left: ${(W - 468) / 2}px; top: 244px; width: 468px; height: 984px; border-radius: 60px; background: ${C.ink}; box-shadow: 0 30px 60px -30px rgba(30,27,19,.55); }
      #screen { position: absolute; inset: 12px; border-radius: 48px; overflow: hidden; background: ${C.low}; }
      .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .card-scene { position: absolute; inset: 0; padding: 36px 26px; display: flex; flex-direction: column; justify-content: center; gap: 22px; background: ${C.surface}; }
      .row { border-radius: 28px; background: ${C.low}; padding: 18px 20px; display: grid; gap: 10px; }
      .row.big { background: ${C.primaryC}; padding: 22px 20px 20px; }
      .who { font-size: 24px; font-weight: 600; color: ${C.onPrimaryC}; display: flex; align-items: center; gap: 10px; }
      .who b { font-weight: 800; }
      .dot { width: 12px; height: 12px; border-radius: 50%; background: ${C.primary}; display: inline-block; }
      .bubble { background: ${C.whatsapp}; border-radius: 18px 18px 18px 4px; padding: 14px 16px 10px; box-shadow: 0 2px 0 rgba(0,0,0,.06); }
      .to { font-size: 18px; font-weight: 700; color: ${C.primary}; margin-bottom: 6px; }
      .msg { font-size: 21px; line-height: 1.35; color: ${C.ink}; font-variant-numeric: tabular-nums; }
      .ticks { text-align: right; font-size: 18px; color: #217499; font-weight: 700; }
      .how { font-size: 22px; color: ${C.onPrimaryC}; font-weight: 600; }
      .pill { justify-self: start; padding: 8px 14px; border-radius: 999px; background: ${C.surface}; color: ${C.ink}; }
      .row:not(.big) .who { color: ${C.ink}; }
      .dots { position: absolute; left: 0; right: 0; bottom: 22px; display: flex; justify-content: center; gap: 10px; }
      .dots i { width: 10px; height: 10px; border-radius: 50%; background: ${C.high}; display: block; }
      .intro, .end { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 56px; gap: 26px; background: ${C.surface}; }
      .intro .chip { align-self: flex-start; }
      .intro h1 { margin: 0; font-size: 62px; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; }
      .intro p, .end p { margin: 0; font-size: 26px; color: ${C.muted}; }
      .end { align-items: center; text-align: center; }
      .mark { width: 96px; height: 96px; border-radius: 30px 30px 30px 8px; background: ${C.primary}; display: block; }
      .end h2 { margin: 0; font-size: 50px; line-height: 1.15; font-weight: 800; }
      .end .site { font-size: 28px; font-weight: 700; color: ${C.primary}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${W}" data-height="${H}" data-duration="${total}">
      <div class="blob a" data-layout-allow-overflow></div>
      <div class="blob b" data-layout-allow-overflow></div>
      <div class="top"><span class="chip" id="chip">${esc(flow.label(t))}</span></div>
      ${caps
        .map(
          (
            c,
          ) => `<div class="clip caption" id="cap-${c.index}" data-start="${c.start.toFixed(3)}" data-duration="${c.duration}" data-track-index="3"><span>${esc(captions[c.index])}</span></div>
      <div class="clip count-wrap" id="count-${c.index}" data-start="${c.start.toFixed(3)}" data-duration="${c.duration}" data-track-index="4" style="position:absolute;right:40px;top:48px"><span class="count">${c.index + 1} / ${steps}</span></div>`,
        )
        .join('\n      ')}
      <div id="phone">
        <div id="screen">
          ${shots.map((s) => (s.card ? channels(s) : video(s))).join('\n          ')}
          <video id="shot-hold" class="clip shot" src="assets/${flowName}.mp4" muted playsinline data-start="${endStart}" data-duration="${endHold.toFixed(3)}" data-media-start="${(footageEnd.media + footageEnd.duration * footageEnd.rate - 0.1).toFixed(3)}" data-track-index="1"></video>
        </div>
      </div>
      <div class="dots">${caps.map((c) => `<i id="dot-${c.index}"></i>`).join('')}</div>
      <section class="clip intro" id="intro" data-start="0" data-duration="${intro.toFixed(3)}" data-track-index="5">
        <span class="chip" id="intro-chip">${esc(flow.label(t))}</span>
        <h1 id="intro-line">${esc(flow.line(t))}</h1>
        <p id="intro-note">${esc(t.videoNote)}</p>
      </section>
      <section class="clip end" id="end" data-start="${endStart}" data-duration="${endHold.toFixed(3)}" data-track-index="5">
        <span class="mark" id="end-mark"></span>
        <h2 id="end-line">${esc(captions.at(-1))}</h2>
        <p class="site" id="end-site">${esc(t.site)}</p>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo('#intro-chip', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, 0.1);
      tl.fromTo('#intro-line', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.2);
      tl.fromTo('#intro-note', { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.45);
      tl.to('#intro-line', { opacity: 0, y: -16, duration: 0.2, ease: 'power2.in' }, ${(intro - 0.25).toFixed(3)});
      tl.fromTo('#phone', { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, ${(intro - 0.15).toFixed(3)});
      ${caps
        .map(
          (
            c,
          ) => `tl.fromTo('#cap-${c.index} span', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, ${c.start.toFixed(3)});
      tl.to('#dot-${c.index}', { backgroundColor: '${C.primary}', scale: 1.3, duration: 0.2 }, ${c.start.toFixed(3)});`,
        )
        .join('\n      ')}
      ${shots
        .filter((s) => s.card)
        .map(
          (
            s,
          ) => `tl.fromTo('#ch-small', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, ${(s.start + 0.15).toFixed(3)});
      tl.fromTo('#ch-small .msg', { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.15 }, ${(s.start + 0.45).toFixed(3)});
      tl.fromTo('#ch-mid', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, ${(s.start + s.duration * 0.5).toFixed(3)});
      tl.fromTo('#ch-big', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, ${(s.start + s.duration * 0.7).toFixed(3)});`,
        )
        .join('\n      ')}
      tl.fromTo('#end-mark', { scale: 0.6, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -8, duration: 0.3, ease: 'back.out(2)' }, ${(endStart + 0.1).toFixed(3)});
      tl.fromTo('#end-line', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, ${(endStart + 0.25).toFixed(3)});
      tl.fromTo('#end-site', { opacity: 0 }, { opacity: 1, duration: 0.25 }, ${(endStart + 0.5).toFixed(3)});
      window.__timelines['main'] = tl;
    </script>
  </body>
</html>
`
  writeFileSync(join(dir, 'index.html'), html)
  const posterShot = shots.find((s) => s.scene === flow.poster)
  return { dir, total, poster: posterShot.start + posterShot.duration * 0.7, voice, lines }
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    // npx is a .cmd shim on Windows; ffmpeg runs directly, so its filter graphs need no quoting.
    shell: process.platform === 'win32' && cmd === 'npx',
  })
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

const flows = process.argv[2] ? [process.argv[2]] : Object.keys(FLOWS)
const langs = process.argv[3] ? [process.argv[3]] : ['en', 'hi']
mkdirSync(out, { recursive: true })
for (const flow of flows)
  for (const lang of langs) {
    const { dir, total, poster, voice, lines } = await build(flow, lang)
    const name = `${flow}-${lang}`
    console.log(`\n▶ ${name}: ${total.toFixed(1)} s`)
    if (process.env.HIW_SKIP_RENDER) continue
    run('npx', ['-y', 'hyperframes@0.8.170', 'check'], dir)
    run(
      'npx',
      [
        '-y',
        'hyperframes@0.8.170',
        'render',
        '--quality',
        'delivery',
        '--fps',
        '30',
        '--output',
        'render.mp4',
      ],
      dir,
    )
    // Poster: a settled frame of the strongest beat, also baked in as frame 0 (BRAG's rule).
    const jpg = join(out, `${name}.jpg`)
    run(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        poster.toFixed(2),
        '-i',
        join(dir, 'render.mp4'),
        '-frames:v',
        '1',
        '-q:v',
        '4',
        jpg,
      ],
      dir,
    )
    run(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        join(dir, 'render.mp4'),
        '-i',
        jpg,
        ...voice.flatMap((clip) => ['-i', clip.file]),
        '-filter_complex',
        [
          "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]",
          // Each line starts on its scene; mixed, levelled, and padded to the video's length.
          ...voice.map(
            (_, index) =>
              `[${index + 2}:a]adelay=${Math.round(lines[index] * 1000)}:all=1[a${index}]`,
          ),
          `${voice.map((_, index) => `[a${index}]`).join('')}amix=inputs=${voice.length}:normalize=0,loudnorm=I=-16:TP=-1.5,apad,atrim=0:${total.toFixed(3)}[a]`,
        ].join(';'),
        '-map',
        '[v]',
        '-map',
        '[a]',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-ac',
        '1',
        '-ar',
        '44100',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '26',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        join(out, `${name}.mp4`),
      ],
      dir,
    )
    console.log(`  ${name}.mp4 ${(statSync(join(out, `${name}.mp4`)).size / 1e6).toFixed(2)} MB`)
  }
