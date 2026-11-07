// OB-165 / OB-78: the owner app's first screens stay small. Run after `npm run build`.
// Each figure is the screen's JavaScript with every static dependency, gzip, as a phone fetches it.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
function closure(...keys) {
  const seen = new Set()
  const visit = (key) => {
    if (seen.has(key)) return
    seen.add(key)
    for (const dependency of manifest[key].imports ?? []) visit(dependency)
  }
  keys.forEach(visit)
  return [...seen].map((key) => manifest[key].file).filter((file) => file.endsWith('.js'))
}
const gzip = (files) =>
  files.reduce((sum, file) => sum + gzipSync(readFileSync(`dist/${file}`)).byteLength, 0)
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

const landing = closure('index.html', 'src/features/v1/V1App.tsx')
const owner = closure(
  'index.html',
  'src/features/v1/V1App.tsx',
  'src/features/v1/OwnerWorkspace.tsx',
)
const checks = [
  // Before OB-165 the welcome page loaded the whole owner app: 864 KiB.
  ['Business welcome / sign-in', gzip(landing), 300 * 1024],
  // Before OB-165 the first owner screen (Today) needed 836 KiB.
  ['Owner first screen (Today)', gzip(owner), 550 * 1024],
]
let failed = false
for (const [name, bytes, budget] of checks) {
  const over = bytes >= budget
  failed ||= over
  console.log(`${over ? 'OVER ' : 'ok   '} ${name}: ${kib(bytes)} gzip (budget < ${kib(budget)})`)
}
// The welcome must not carry the workspace (shell, coach, new-shop flow).
const leaked = landing.filter((file) =>
  /\/(AppShell|CoachScreen|NewShopFlow|WorkspaceProvider)-/.test(file),
)
if (leaked.length) {
  failed = true
  console.log(`OVER  Business welcome loads the workspace: ${leaked.join(', ')}`)
}
// Vite's own warning threshold: no single chunk above 500 kB minified.
for (const { file } of Object.values(manifest)) {
  const size = readFileSync(`dist/${file}`).byteLength
  if (file.endsWith('.js') && size > 500 * 1000) {
    failed = true
    console.log(`OVER  ${file}: ${(size / 1000).toFixed(1)} kB minified (limit 500 kB)`)
  }
}
if (failed) process.exitCode = 1
