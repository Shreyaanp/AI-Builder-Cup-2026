// Local-only director server. Never load dotenv or inherit application credentials.
import { spawn } from 'node:child_process'
import { mkdirSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const host = process.env.DIRECTOR_HOST || '127.0.0.1'
if (!['127.0.0.1', '127.0.0.2'].includes(host))
  throw new Error('Director host must be an approved loopback address')
const webOrigin = `http://${host}:3537`
const runDir = resolve(root, '.cache', 'director', `${Date.now()}`)
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
mkdirSync(resolve(runDir, 'data'), { recursive: true })
const env = Object.fromEntries(
  ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA'].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
)
Object.assign(env, {
  PYTHONPATH: resolve(root, 'backend'),
  WEB_PORT: '3537',
  API_PORT: '3637',
  APP_ENV: 'test',
  COACH_MODE: 'offline',
  AUTH_MODE: 'local',
  V1_ENABLED: 'true',
  MERCHANT_BACKEND: 'sqlite',
  SESSION_BACKEND: 'sqlite',
  MODERATION_MODE: 'fixture',
  RATE_LIMITS_ENABLED: 'false',
  FORECAST_BACKEND: 'weekday_average',
  WEATHER_BACKEND: 'offline',
  RECALL_PATH: 'data/test-vectors',
  MERCHANT_DATABASE: 'data/merchant.sqlite3',
  SESSION_DATABASE_URL: 'sqlite+aiosqlite:///./data/sessions.sqlite3',
  MEDIA_DIR: 'data/media',
  DEMO_WORLD_ENABLED: 'false',
  FACE_WORKER_URL: 'http://127.0.0.1:3638',
  // Empty origin uses the app's same-origin fallback; Settings allows HTTP only for .1/localhost.
  CUSTOMER_ORIGIN: host === '127.0.0.1' ? webOrigin : '',
  RELEASE_COMMIT: sha,
  ALLOWED_ORIGINS: JSON.stringify([webOrigin]),
})
if (!process.env.DIRECTOR_PYTHON)
  throw new Error('Set DIRECTOR_PYTHON to an installed Python with backend dependencies.')
// Python audit hooks reject outbound sockets, including accidental SDK traffic.
const python = `
import sys, ipaddress
def local_only(event, args):
    if event == 'socket.connect':
        address = args[1]
        host = address[0] if isinstance(address, tuple) else ''
        try: allowed = ipaddress.ip_address(host).is_loopback
        except ValueError: allowed = host == 'localhost'
        if not allowed: raise PermissionError('Director blocks external sockets')
    if event == 'socket.getaddrinfo' and args[0] not in ('localhost', '127.0.0.1', '::1', None):
        raise PermissionError('Director blocks external DNS')
sys.addaudithook(local_only)
import uvicorn
uvicorn.run('app.main:app', host='127.0.0.1', port=3637, access_log=False)
`
const backend = spawn(process.env.DIRECTOR_PYTHON, ['-c', python], {
  cwd: runDir,
  env,
  stdio: 'inherit',
})
const { createServer } = await import('vite')
// Vite normally reads .env; point envDir at the new empty run directory instead.
const web = await createServer({
  root,
  configFile: false,
  envDir: runDir,
  cacheDir: resolve(root, 'output', 'director-cache', runDir.split(/[\\/]/).at(-1)),
  plugins: [
    (await import('@vitejs/plugin-react')).default(),
    {
      name: 'director-identity',
      configureServer(server) {
        server.middlewares.use('/__director', (_request, response) => {
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({ kind: 'track-r-director', sha, run: runDir.split(/[\\/]/).at(-1) }),
          )
        })
      },
    },
  ],
  server: {
    host,
    port: 3537,
    strictPort: true,
    fs: { allow: [root, realpathSync(resolve(root, 'node_modules'))] },
    watch: { ignored: ['**/docs/stories/director/**', '**/.cache/**'] },
    proxy: { '/api': { target: 'http://127.0.0.1:3637', ws: true } },
  },
})
try {
  await web.listen()
} catch (error) {
  backend.kill()
  throw error
}
console.log(
  'Director: web 3537 / API 3637; fresh isolated SQLite; recall data/test-vectors; external sockets blocked.',
)
async function stop() {
  await web.close()
  backend.kill()
  process.exit()
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
backend.on('error', () => {
  console.error('Director Python could not start.')
  void stop()
})
backend.on('exit', (code) => {
  if (code) {
    console.error('Director backend stopped.')
    void stop()
  }
})
