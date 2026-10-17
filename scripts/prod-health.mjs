#!/usr/bin/env node
// Production health report from Cloud Logging (read-only).
// Usage: node scripts/prod-health.mjs [minutes=60]
// Exit 1 when the window has any traceback or any 5xx response.
import { execFileSync } from 'node:child_process'

const PROJECT = 'ichiropractic'
const AI = 'ogoogle-ai'
const FACE = 'ogoogle-face'
// A voice close counts as "after a traceback" when the same instance logged one this recently.
const TRACEBACK_TO_CLOSE_MS = 10_000

const minutes = Number(process.argv[2] ?? 60)
if (!Number.isFinite(minutes) || minutes <= 0) {
  console.error('usage: node scripts/prod-health.mjs [minutes]')
  process.exit(2)
}
const since = new Date(Date.now() - minutes * 60_000).toISOString()

function readLogs(service, extra) {
  const filter =
    `resource.type="cloud_run_revision" AND resource.labels.service_name="${service}" ` +
    `AND timestamp>="${since}" AND (${extra})`
  const args = [
    'logging',
    'read',
    filter,
    `--project=${PROJECT}`,
    '--format=json',
    '--order=asc',
    '--limit=20000',
  ]
  const win = process.platform === 'win32'
  // gcloud is a .cmd on Windows, which needs a shell; double-quote every argument there.
  const out = win
    ? execFileSync(
        'gcloud',
        args.map((a) => `"${a.replaceAll('"', '\\"')}"`),
        {
          shell: true,
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
        },
      )
    : execFileSync('gcloud', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return JSON.parse(out || '[]')
}

const at = (e) => Date.parse(e.timestamp)
const text = (e) => e.textPayload ?? ''
const instance = (e) => e.labels?.instanceId ?? ''
const count = (items, key) => {
  const map = new Map()
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}
const percentile = (sorted, p) =>
  sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
    : null
const pathOf = (url) => {
  try {
    return new URL(url).pathname
  } catch {
    return url ?? '(unknown)'
  }
}
// Cloud Run splits a traceback into one entry per line; the exception line is the first
// unindented "pkg.Name: message" / "NameError" line logged after the "Traceback" entry.
const EXCEPTION_LINE =
  /^[A-Za-z_][\w.]*(Error|Exception|Exit|Cancelled|Interrupt|Warning)\b|^[A-Za-z_][\w.]*\.[A-Za-z_]\w*: /
const EXCEPTION_WINDOW_MS = 3000
function exceptionLine(trace, stderr) {
  const line = stderr.find(
    (e) =>
      instance(e) === instance(trace) &&
      at(e) >= at(trace) &&
      at(e) - at(trace) <= EXCEPTION_WINDOW_MS &&
      EXCEPTION_LINE.test(text(e)),
  )
  return line ? text(line).split('\n')[0].slice(0, 200) : '(exception line not found)'
}

let ai
let face
try {
  ai = readLogs(
    AI,
    'httpRequest.status>=500 OR severity>=ERROR OR logName:"stderr" OR textPayload:"voice_" ' +
      'OR textPayload:"coach_latency" OR textPayload:"Application startup complete"',
  )
  face = readLogs(
    FACE,
    'httpRequest.status>=500 OR severity>=ERROR OR logName:"stderr" OR textPayload:"face_worker_" ' +
      'OR textPayload:"Application startup complete"',
  )
} catch (error) {
  console.error(`gcloud logging read failed: ${String(error.message ?? error).split('\n')[0]}`)
  process.exit(2)
}
const all = [...ai.map((e) => ['ai', e]), ...face.map((e) => ['face', e])]

const fivexx = all.filter(([, e]) => (e.httpRequest?.status ?? 0) >= 500)
const tracebacks = all.filter(([, e]) => text(e).includes('Traceback (most recent call last)'))
const errors = all.filter(([, e]) => e.severity === 'ERROR' || e.severity === 'CRITICAL')
const tracebackAi = ai.filter((e) => text(e).includes('Traceback (most recent call last)'))

const opened = ai.filter((e) => /\bvoice_ready\b/.test(text(e)))
const closes = ai.filter((e) => /\bvoice_(closed|disconnected|failed)\b/.test(text(e)))
const rejected = ai.filter((e) => /\bvoice_rejected\b/.test(text(e)))
const closesAfterTraceback = closes.filter((close) =>
  tracebackAi.some(
    (t) =>
      instance(t) === instance(close) &&
      at(close) - at(t) >= 0 &&
      at(close) - at(t) <= TRACEBACK_TO_CLOSE_MS,
  ),
)
const firstAudio = ai
  .map((e) => /flow=voice_first_audio\s+ms=([\d.]+)/.exec(text(e)))
  .filter(Boolean)
  .map((m) => Number(m[1]))
  .sort((a, b) => a - b)

const faceEvents = face.filter((e) =>
  /face_worker_(verdict|rejected|exception|models_unavailable)/.test(text(e)),
)
const faceOutcome = (e) => {
  const t = text(e)
  const kind = /face_worker_(\w+)/.exec(t)[1]
  const detail = /(?:status|reason|error)=(\S+)/.exec(t)?.[1]
  return detail ? `${kind}:${detail}` : kind
}
const coldStarts = (list) =>
  list.filter((e) => text(e).includes('Application startup complete')).length

const lines = []
lines.push(`Production health, last ${minutes} min (since ${since})`)
lines.push(`project ${PROJECT}; services ${AI}, ${FACE}`)
lines.push('')
lines.push(`5xx responses: ${fivexx.length}`)
for (const [path, n] of count(
  fivexx,
  ([svc, e]) =>
    `${svc} ${e.httpRequest.requestMethod} ${pathOf(e.httpRequest.requestUrl)} (${e.httpRequest.status})`,
))
  lines.push(`  ${n} x ${path}`)
lines.push(`ERROR entries: ${errors.length}; tracebacks: ${tracebacks.length}`)
for (const [line, n] of count(tracebacks, ([svc, e]) =>
  exceptionLine(e, svc === 'ai' ? ai : face),
).slice(0, 3))
  lines.push(`  ${n} x ${line}`)
lines.push(
  `voice sessions: ${opened.length} opened, ${closes.length} closed, ${rejected.length} rejected; ` +
    `${closesAfterTraceback.length} closes followed a traceback (same instance, within ${TRACEBACK_TO_CLOSE_MS / 1000}s)`,
)
lines.push(
  firstAudio.length
    ? `voice_first_audio: n=${firstAudio.length} p50=${percentile(firstAudio, 50)} ms p90=${percentile(firstAudio, 90)} ms`
    : 'voice_first_audio: no samples',
)
lines.push(`face captures: ${faceEvents.length}`)
for (const [outcome, n] of count(faceEvents, faceOutcome)) lines.push(`  ${n} x ${outcome}`)
lines.push(`cold starts: ${AI} ${coldStarts(ai)}, ${FACE} ${coldStarts(face)}`)
const bad = tracebacks.length > 0 || fivexx.length > 0
lines.push('')
lines.push(bad ? 'RESULT: UNHEALTHY (tracebacks or 5xx present)' : 'RESULT: healthy')
console.log(lines.join('\n'))
process.exit(bad ? 1 : 0)
