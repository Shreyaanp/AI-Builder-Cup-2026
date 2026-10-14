import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'))
const visited = new Set()
function visit(key) {
  if (visited.has(key)) return
  visited.add(key)
  for (const dependency of manifest[key].imports ?? []) visit(dependency)
}
// A returning visitor's feed: shared entry + shell + feed, including every static dependency.
for (const key of [
  'index.html',
  'src/features/frontdoors/CustomerApp.tsx',
  'src/features/discover/Discover.tsx',
])
  visit(key)
let total = 0
for (const key of visited) {
  const file = manifest[key].file
  if (file.endsWith('.js')) total += gzipSync(readFileSync('dist/' + file)).byteLength
}
console.log(
  `Initial customer feed JavaScript: ${(total / 1024).toFixed(1)} KiB gzip (budget <150 KiB).`,
)
if (total >= 150 * 1024) process.exitCode = 1
