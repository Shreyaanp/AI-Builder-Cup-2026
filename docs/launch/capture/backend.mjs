// Launch capture backend: scripts/backend-dev.mjs on port 3310 with its own SQLite file, so the
// shared dev database (and other specs' discovery results) never see the demo shops.
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backend = fileURLToPath(new URL('../../../backend/', import.meta.url))
const database = 'data/launch-merchant.sqlite3'
for (const suffix of ['', '-wal', '-shm']) rmSync(join(backend, database + suffix), { force: true })
const portable = join(homedir(), 'AppData', 'Local', 'AIBuilderCupTools', 'uv', 'uv.exe')
const uv = process.env.UV_PATH || (existsSync(portable) ? portable : 'uv')
const code =
  "import uvicorn; uvicorn.run('app.main:app', host='127.0.0.1', port=3310, access_log=False," +
  ' ws_max_size=32768, ws_max_queue=8)'
const child = spawn(uv, ['run', '--locked', 'python', '-c', code], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    COACH_MODE: 'offline',
    AUTH_MODE: 'local',
    APP_ENV: 'local',
    V1_ENABLED: 'true',
    MERCHANT_BACKEND: 'sqlite',
    MERCHANT_DATABASE: database,
    MODERATION_MODE: 'fixture',
    MEDIA_BUCKET: '',
    ALLOWED_ORIGINS: '["http://127.0.0.1:3210"]',
    // Share links and the QR show the real customer domain, as in production.
    CUSTOMER_ORIGIN: 'https://chalkboard.shreyaan.work',
  },
})
child.on('exit', (exit) => {
  process.exitCode = exit ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
