import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backend = fileURLToPath(new URL('../backend/', import.meta.url))
const portable = join(homedir(), 'AppData', 'Local', 'AIBuilderCupTools', 'uv', 'uv.exe')
const uv = process.env.UV_PATH || (existsSync(portable) ? portable : 'uv')
// Real Google places locally, opt-in only (PLACES_LIVE=true): keys come from the gitignored
// backend/.env.places.local, and the demo-only answer cache is on. Every other run stays offline.
const placesFile = join(backend, '.env.places.local')
const places = {}
if (process.env.PLACES_LIVE === 'true' && existsSync(placesFile))
  for (const line of readFileSync(placesFile, 'utf8').split(/\r?\n/)) {
    const match = /^(MAPS_SERVER_KEY|MAPS_BROWSER_KEY)=(.+)$/.exec(line.trim())
    if (match) places[match[1]] = match[2]
  }
const child = spawn(uv, ['run', '--locked', 'python', 'run.py'], {
  cwd: backend,
  stdio: 'inherit',
  // Review mode deliberately overrides provider modes; no paid inference.
  env: {
    ...process.env,
    COACH_MODE: 'offline',
    AUTH_MODE: 'local',
    APP_ENV: 'local',
    V1_ENABLED: 'true',
    MERCHANT_BACKEND: 'sqlite',
    MODERATION_MODE: 'fixture',
    // Face check: the real private worker when its token is set (see deployment/FACE_WORKER.md),
    // otherwise a labelled fixture. Every local owner is a trust reviewer.
    FACE_MODE: process.env.FACE_WORKER_TOKEN ? 'worker' : 'fixture',
    TRUST_ADMINS: process.env.TRUST_ADMINS ?? '["*"]',
    RATE_LIMITS_ENABLED: 'false',
    MEDIA_BUCKET: '',
    MAPS_SERVER_KEY: places.MAPS_SERVER_KEY ?? '',
    MAPS_BROWSER_KEY: places.MAPS_BROWSER_KEY ?? '',
    PLACES_DEMO_CACHE: places.MAPS_SERVER_KEY ? 'true' : 'false',
    // Labelled sample area answers offline; MAPS_GROUNDING=off shows the honest fallback.
    MAPS_GROUNDING: process.env.MAPS_GROUNDING ?? 'demo',
    // The dev web server's own origin (per-worktree WEB_PORT, default 3200).
    // Share links and QR codes point at this checkout's own web port.
    CUSTOMER_ORIGIN: `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`,
    ALLOWED_ORIGINS: JSON.stringify([
      `http://127.0.0.1:${process.env.WEB_PORT ?? 3200}`,
      `http://localhost:${process.env.WEB_PORT ?? 3200}`,
    ]),
  },
})
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
