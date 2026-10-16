import assert from 'node:assert/strict'

const origin = process.env.SMOKE_ORIGIN || 'http://127.0.0.1:8080'
const request = (path, init = {}) =>
  fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15_000), ...init })
const healthResponse = await request('/api/v1/health')
assert.ok(healthResponse.ok)
const health = await healthResponse.json()
assert.equal(health.status, 'ok')
assert.equal(health.product, 'oGoogle AI')
assert.equal(health.coach_mode, process.env.SMOKE_COACH_MODE || 'offline')
const authMode = process.env.SMOKE_AUTH_MODE || 'firebase'
assert.equal(health.auth_mode, authMode)
assert.equal(health.session_backend, authMode === 'firebase' ? 'firestore' : 'sqlite')
if (process.env.RELEASE_SHA) assert.equal(health.release_commit, process.env.RELEASE_SHA)
const home = await request('/')
assert.ok(home.ok && (await home.text()).includes('<div id="root">'))
assert.equal((await request('/api/missing')).status, 404)
assert.equal((await request('/.env')).status, 404)
assert.equal(
  (
    await request('/api/v1/coach/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    })
  ).status,
  401,
)
console.log('Hosting smoke passed: frontend/API, revision and unauthenticated stream rejection.')
