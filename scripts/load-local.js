// k6 run scripts/load-local.js --summary-export=artifacts/k6-local.json
// Fixed loopback fixture only: no target override, redirects, auth keys or production URL.
import http from 'k6/http'
import { check, fail, sleep } from 'k6'
/* global __ITER */

const origin = 'http://127.0.0.1:3398'
let sessionId = null
export const options = {
  scenarios: {
    reads: { executor: 'constant-vus', vus: 16, duration: '30s', exec: 'reads' },
    coach: { executor: 'constant-vus', vus: 4, duration: '30s', exec: 'coach' },
  },
  maxRedirects: 0,
  // Keep each virtual user's bootstrap cookie with its owned conversation across turns.
  noCookiesReset: true,
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] },
}

export function setup() {
  const health = http.get(`${origin}/api/v1/health`).json()
  if (
    health.release_commit !== 'local-load-fixture' ||
    health.coach_mode !== 'offline' ||
    health.auth_mode !== 'local'
  )
    fail('Requires the isolated offline fixture')
  return http.get(`${origin}/load-fixture`).json()
}

export function reads(data) {
  const response = http.get(
    __ITER % 2
      ? `${origin}/api/v1/discover?lat=1.28&lng=103.84`
      : `${origin}/api/v1/public/shops/${data.shops[__ITER % 10]}`,
  )
  check(response, {
    'read returned data': (r) =>
      r.status === 200 && (__ITER % 2 ? r.json().places.length > 0 : !!r.json().name),
  })
  sleep(0.1)
}

export function coach() {
  if (__ITER === 0) http.get(`${origin}/api/v1/bootstrap`)
  const response = http.post(
    `${origin}/api/v1/coach/stream`,
    JSON.stringify({ message: 'Hello', language: 'en', session_id: sessionId }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '10s' },
  )
  const events =
    response.status === 200
      ? response.body
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => JSON.parse(line.slice(6)))
      : []
  check(response, {
    'stream completed without error': () =>
      response.status === 200 &&
      events.at(-1)?.kind === 'turn_complete' &&
      events.some((event) => event.kind === 'reply') &&
      !events.some((event) => event.kind === 'error'),
  })
  if (response.status === 200) {
    const ready = events.find((event) => event.kind === 'ready')
    if (ready) sessionId = ready.session_id
  }
  sleep(0.1)
}
