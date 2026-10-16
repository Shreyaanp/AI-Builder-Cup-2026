import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

mkdirSync('.cache/qa', { recursive: true })
const env = {
  ...process.env,
  API_PORT: process.env.API_PORT ?? '3537',
  COACH_MODE: 'offline',
  AUTH_MODE: 'local',
  APP_ENV: 'test',
  V1_ENABLED: 'true',
  MERCHANT_BACKEND: 'sqlite',
  SESSION_BACKEND: 'sqlite',
  MODERATION_MODE: 'fixture',
  FACE_MODE: 'fixture',
  TRUST_ADMINS: '["*"]',
  RATE_LIMITS_ENABLED: 'false',
  MERCHANT_DATABASE: '../.cache/qa/merchant.sqlite3',
  SESSION_DATABASE_URL: 'sqlite+aiosqlite:///../.cache/qa/sessions.sqlite3',
  RECALL_PATH: '../.cache/qa/recall',
  MEDIA_DIR: '../.cache/qa/media',
  MEDIA_BUCKET: '',
  MAPS_SERVER_KEY: '',
  MAPS_BROWSER_KEY: '',
  GOOGLE_API_KEY: '',
  CUSTOMER_ORIGIN: `http://127.0.0.1:${process.env.WEB_PORT ?? '3437'}`,
  ALLOWED_ORIGINS: JSON.stringify([`http://127.0.0.1:${process.env.WEB_PORT ?? '3437'}`]),
}
delete env.FIRESTORE_EMULATOR_HOST
const child = process.env.QA_PYTHON
  ? spawn(process.env.QA_PYTHON, ['run.py'], { cwd: 'backend', env, stdio: 'inherit' })
  : spawn('uv', ['run', '--locked', '--offline', 'python', 'run.py'], {
      cwd: 'backend',
      env,
      stdio: 'inherit',
    })
child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
