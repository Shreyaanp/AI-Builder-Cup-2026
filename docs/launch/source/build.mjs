// Generates the two HyperFrames projects (dist/portrait, dist/landscape; one root index.html each,
// as HyperFrames expects) from one scene list, so both cuts share timing and copy. Run: node build.mjs
// Static HTML on purpose: every timed element carries data-start/data-duration in the markup.
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'

const S = (name) => `assets/screens/${name}.png`
// Each scene: seconds, caption, optional screens (crossfaded in order at `at` seconds),
// a demo label when a fictional shop is on screen, and an optional highlight ring.
const scenes = [
  { id: 'title', d: 4, kind: 'title' },
  {
    id: 'snap',
    d: 5,
    kind: 'board',
    title: 'Snap your menu board.',
    sub: 'Send a photo. The coach reads names and prices.',
    screens: [{ src: S('02-reading-photo'), at: 2.6 }],
  },
  {
    id: 'fill',
    d: 7,
    title: 'The coach fills in your shop.',
    sub: 'You check every detail. Nothing is saved until you confirm.',
    screens: [{ src: S('03-review-sheet') }],
    demo: true,
  },
  {
    id: 'ready',
    d: 5,
    title: 'Ready in minutes.',
    sub: 'Hours, area and menu: your shop card fills itself in.',
    screens: [{ src: S('04-coach-shop-card') }],
    demo: true,
  },
  {
    id: 'soldout',
    d: 7,
    title: 'Sold out? One tap.',
    sub: 'Customers see it straight away.',
    screens: [{ src: S('06-sold-out-before') }, { src: S('07-sold-out-after'), at: 2.8 }],
    ring: { x: 0.848, y: 0.262, at: 2.4 },
    demo: true,
  },
  {
    id: 'qr',
    d: 5,
    title: 'Print your QR code.',
    sub: 'One code for today’s menu.',
    screens: [{ src: S('08-qr-sheet') }],
    scan: true,
    demo: true,
  },
  {
    id: 'scan',
    d: 5,
    title: 'Customers scan…',
    sub: 'Live prices and sold-out items, in their own language.',
    screens: [{ src: S('11-customer-page') }],
    demo: true,
  },
  {
    id: 'halal',
    d: 7,
    title: '…and ask “halal?”',
    sub: 'An instant answer from the details you confirmed.',
    screens: [{ src: S('12-customer-halal') }],
    demo: true,
  },
  {
    id: 'recap',
    d: 6,
    title: 'Your week at a glance.',
    sub: 'Revenue, top sellers and slow movers.',
    screens: [{ src: S('09-weekly-recap') }],
    demo: true,
  },
  {
    id: 'google',
    d: 5,
    title: 'Ready for Google.',
    sub: 'Chalkboard prepares your details. Google verifies.',
    screens: [{ src: S('10-google') }, { src: S('10b-google-verifies'), at: 2.6 }],
    demo: true,
  },
  { id: 'end', d: 4, kind: 'end' },
]

const layouts = {
  portrait: {
    dir: 'portrait',
    id: 'main',
    w: 1080,
    h: 1920,
    // Phone screen 580 wide (screens are 1236x2745); caption above it.
    screenW: 580,
    phone: 'left:236px; top:520px;',
    cap: 'left:80px; right:80px; top:150px; text-align:center;',
    titleSize: 74,
    subSize: 36,
  },
  landscape: {
    dir: 'landscape',
    id: 'landscape',
    w: 1920,
    h: 1080,
    screenW: 405,
    phone: 'left:1290px; top:62px;',
    cap: 'left:170px; width:900px; top:50%; transform:translateY(-50%); text-align:left;',
    titleSize: 88,
    subSize: 40,
  },
}

const ratio = 2745 / 1236
const total = scenes.reduce((sum, scene) => sum + scene.d, 0)
if (total !== 60) throw new Error(`Scenes add up to ${total}s, not 60s`)

function phone(scene, L) {
  const screenH = Math.round(L.screenW * ratio)
  const images = scene.screens
    .map(
      (screen, i) =>
        `<img class="shot shot-${i}" src="${screen.src}" alt="" style="opacity:${i ? 0 : 1}" />`,
    )
    .join('')
  const ring = scene.ring
    ? `<div class="ring" style="left:${scene.ring.x * 100}%; top:${scene.ring.y * 100}%"></div>`
    : ''
  const scan = scene.scan ? '<div class="scanline"></div>' : ''
  const demo = scene.demo ? '<div class="demo">Demo shop · fictional</div>' : ''
  return `<div class="phone" style="${L.phone} width:${L.screenW + 28}px; height:${screenH + 28}px;">
        <div class="screen" style="width:${L.screenW}px; height:${screenH}px;">${images}${ring}${scan}</div>
        ${demo}
      </div>`
}

function board() {
  const rows = [
    ['Nasi lemak (ikan bilis)', '3.50'],
    ['… with chicken wing', '5.50'],
    ['… with rendang', '6.50'],
    ['Otah', '1.50'],
    ['Teh tarik', '1.60'],
  ]
  return `<div class="board">
        <div class="board-title">Serai Sunrise<br />Nasi Lemak</div>
        ${rows.map(([name, price]) => `<div class="board-row"><span>${name}</span><span>$${price}</span></div>`).join('')}
        <div class="board-foot">7am – 2pm daily</div>
      </div>
      <div class="demo">Demo shop · fictional</div>
      <div class="flash"></div>`
}

function scene(scene, start, L) {
  const attrs = `id="${scene.id}" class="clip scene" data-start="${start}" data-duration="${scene.d}" data-track-index="0"`
  if (scene.kind === 'title')
    return `<section ${attrs}>
      <div class="center">
        <div class="mark">${leaf}</div>
        <div class="brand">Chalkboard</div>
        <div class="tag">Your shop, online in one conversation.</div>
      </div>
    </section>`
  if (scene.kind === 'end')
    return `<section ${attrs}>
      <div class="center">
        <div class="mark">${leaf}</div>
        <div class="url">chalkboard.shreyaan.work</div>
        <div class="tag">Bring your shop online today.</div>
        <div class="fine">Independent prototype · not a Google product.<br />Shops and data shown are fictional demo content.</div>
      </div>
    </section>`
  return `<section ${attrs}>
      <div class="cap" style="${L.cap}">
        <h1>${scene.title}</h1>
        <p>${scene.sub}</p>
      </div>
      ${scene.kind === 'board' ? `<div class="boardwrap" style="${L.phone} width:${L.screenW + 28}px;">${board()}</div>` : ''}
      ${phone(scene, L)}
    </section>`
}

const leaf = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`

function timeline(L) {
  const lines = []
  let t = 0
  for (const s of scenes) {
    const at = (offset) => (t + offset).toFixed(2)
    lines.push(
      `tl.fromTo('#${s.id}', { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, ${at(0)})`,
    )
    lines.push(
      `tl.to('#${s.id}', { opacity: 0, duration: 0.3, ease: 'power1.in' }, ${at(s.d - 0.3)})`,
    )
    if (s.kind === 'title' || s.kind === 'end') {
      lines.push(
        `tl.from('#${s.id} .center > *', { opacity: 0, y: 40, duration: 0.8, stagger: 0.18, ease: 'power3.out' }, ${at(0.15)})`,
      )
    } else {
      lines.push(
        `tl.from('#${s.id} .cap > *', { opacity: 0, y: 34, duration: 0.7, stagger: 0.14, ease: 'power3.out' }, ${at(0.1)})`,
      )
      const phoneAt = s.kind === 'board' ? s.screens[0].at : 0.2
      lines.push(
        `tl.from('#${s.id} .phone', { opacity: 0, y: 90, duration: 0.8, ease: 'power3.out' }, ${at(phoneAt)})`,
      )
      // A slow push-in keeps still screens alive.
      lines.push(
        `tl.fromTo('#${s.id} .screen', { scale: 1 }, { scale: 1.035, duration: ${s.d}, ease: 'none' }, ${at(0)})`,
      )
      s.screens.forEach((screen, i) => {
        if (i && screen.at != null)
          lines.push(
            `tl.to('#${s.id} .shot-${i}', { opacity: 1, duration: 0.45, ease: 'power1.inOut' }, ${at(screen.at)})`,
          )
      })
      if (s.demo)
        lines.push(`tl.from('#${s.id} .demo', { opacity: 0, x: 20, duration: 0.5 }, ${at(0.7)})`)
      if (s.ring)
        lines.push(
          `tl.fromTo('#${s.id} .ring', { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, ${at(s.ring.at)})`,
          `tl.to('#${s.id} .ring', { opacity: 0, duration: 0.6 }, ${at(s.d - 1.2)})`,
        )
      if (s.scan)
        lines.push(
          // Transform only: layout properties stutter under frame-by-frame capture.
          `tl.fromTo('#${s.id} .scanline', { y: 0, opacity: 0 }, { y: ${Math.round(0.28 * L.screenW * ratio)}, opacity: 1, duration: 1.4, ease: 'sine.inOut', repeat: 1, yoyo: true }, ${at(1.2)})`,
          `tl.to('#${s.id} .scanline', { opacity: 0, duration: 0.3 }, ${at(4.1)})`,
        )
      if (s.kind === 'board')
        lines.push(
          `tl.from('#${s.id} .boardwrap', { opacity: 0, scale: 0.92, duration: 0.6, ease: 'power3.out' }, ${at(0.2)})`,
          `tl.fromTo('#${s.id} .flash', { opacity: 0 }, { opacity: 0.95, duration: 0.08, yoyo: true, repeat: 1 }, ${at(2.1)})`,
          `tl.to('#${s.id} .boardwrap', { opacity: 0, scale: 0.9, duration: 0.4 }, ${at(2.4)})`,
        )
    }
    t += s.d
  }
  return lines.join('\n      ')
}

function page(L) {
  let start = 0
  const body = scenes
    .map((s) => {
      const html = scene(s, start, L)
      start += s.d
      return html
    })
    .join('\n    ')
  return `<!doctype html>
<!-- Generated by build.mjs; edit the scene list there, not this file. -->
<html lang="en" data-resolution="${L.w > L.h ? 'landscape' : 'portrait'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${L.w}, height=${L.h}" />
    <script src="assets/vendor/gsap-3.14.2.min.js"></script>
    <style>
      @font-face {
        font-family: 'Google Sans Flex';
        src: url('assets/fonts/google-sans-flex-latin-wght-normal.woff2') format('woff2');
        font-weight: 100 1000;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${L.w}px; height: ${L.h}px; overflow: hidden; background: #f3f6ef; }
      #root {
        position: relative; width: 100%; height: 100%; color: #1a1c19;
        font-family: 'Google Sans Flex', Roboto, system-ui, sans-serif;
        background: radial-gradient(120% 80% at 50% 0%, #e3efe2 0%, #f3f6ef 55%, #eef3e8 100%);
      }
      .scene { position: absolute; inset: 0; }
      .cap { position: absolute; }
      .cap h1 { font-size: ${L.titleSize}px; line-height: 1.08; font-weight: 600; letter-spacing: -0.02em; }
      .cap p { margin-top: 22px; font-size: ${L.subSize}px; line-height: 1.3; color: #41493f; }
      .phone {
        position: absolute; padding: 14px; border-radius: 64px; background: #111511;
        box-shadow: 0 40px 80px rgba(20, 40, 25, 0.28), 0 6px 18px rgba(0, 0, 0, 0.18);
      }
      .screen { position: relative; overflow: hidden; border-radius: 50px; background: #f6f8f2; transform-origin: 50% 30%; }
      .shot { position: absolute; inset: 0; width: 100%; height: 100%; }
      .demo {
        position: absolute; top: -22px; right: -18px; padding: 12px 22px; border-radius: 999px;
        background: #dcedb8; color: #253610; font-size: 24px; font-weight: 600;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
      }
      .ring {
        position: absolute; width: 150px; height: 150px; margin: -75px 0 0 -75px; border-radius: 50%;
        border: 6px solid #2f6b4a; box-shadow: 0 0 0 10px rgba(47, 107, 74, 0.18);
      }
      .scanline {
        position: absolute; left: 14%; right: 14%; top: 30%; height: 6px; border-radius: 3px;
        background: #3fb26f; box-shadow: 0 0 24px 6px rgba(63, 178, 111, 0.55);
      }
      .boardwrap { position: absolute; }
      .board {
        border-radius: 36px; padding: 52px 46px; background: #23352c; color: #f4f1e6;
        border: 16px solid #8a6a43; box-shadow: 0 30px 70px rgba(0, 0, 0, 0.3);
      }
      .board-title { font-size: 46px; line-height: 1.1; font-weight: 700; text-align: center; margin-bottom: 38px; }
      .board-row { display: flex; justify-content: space-between; gap: 18px; font-size: 30px; padding: 14px 0; border-bottom: 2px dashed rgba(244, 241, 230, 0.25); }
      .board-foot { margin-top: 30px; text-align: center; font-size: 26px; opacity: 0.8; }
      .flash { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
      .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 90px; }
      .mark { width: 150px; height: 150px; padding: 30px; border-radius: 44px; background: #b9f0c9; color: #1f5137; margin-bottom: 44px; }
      .brand { font-size: ${Math.round(L.titleSize * 1.5)}px; font-weight: 600; letter-spacing: -0.03em; }
      .url { font-size: ${Math.round(L.titleSize * 0.95)}px; font-weight: 600; letter-spacing: -0.02em; color: #1f5137; }
      .tag { margin-top: 24px; font-size: ${L.subSize + 6}px; color: #41493f; }
      .fine { margin-top: 56px; font-size: 26px; line-height: 1.45; color: #5d665a; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${L.id}" data-start="0" data-duration="${total}" data-width="${L.w}" data-height="${L.h}">
    ${body}
    </div>
    <script>
      window.__timelines = window.__timelines || {}
      const tl = gsap.timeline({ paused: true })
      ${timeline(L)}
      window.__timelines['${L.id}'] = tl
      tl.seek(0)
    </script>
  </body>
</html>
`
}

for (const layout of Object.values(layouts)) {
  const dir = new URL(`dist/${layout.dir}/`, import.meta.url)
  mkdirSync(dir, { recursive: true })
  cpSync(new URL('assets/', import.meta.url), new URL('assets/', dir), { recursive: true })
  for (const file of ['hyperframes.json', 'meta.json'])
    cpSync(new URL(file, import.meta.url), new URL(file, dir))
  writeFileSync(new URL('index.html', dir), page(layout))
  console.log(`Wrote dist/${layout.dir}/index.html (${layout.w}x${layout.h}, ${total}s)`)
}
