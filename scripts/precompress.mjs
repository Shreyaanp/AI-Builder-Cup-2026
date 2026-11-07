// OB-78: the server compressed every script on every request, so the first visitors of a new
// instance (all files new to their browsers after a deploy) waited on its CPU. Hashed assets are
// compressed once here, at build time; backend/app/frontend.py serves the .br/.gz copy.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dir = process.argv[2] ?? 'dist/assets'
const TYPES = /\.(js|css|svg|json|wasm)$/
// Small files gain nothing; the server sends them as they are (GZipMiddleware's own floor).
const MIN_BYTES = 1024
let files = 0
let raw = 0
let brotli = 0
for (const name of readdirSync(dir)) {
  const path = join(dir, name)
  if (!TYPES.test(name) || !statSync(path).isFile()) continue
  const data = readFileSync(path)
  if (data.length < MIN_BYTES) continue
  const br = brotliCompressSync(data, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
    },
  })
  writeFileSync(`${path}.br`, br)
  writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }))
  files += 1
  raw += data.length
  brotli += br.length
}
console.log(
  `Precompressed ${files} assets: ${(raw / 1024).toFixed(0)} KiB -> ${(brotli / 1024).toFixed(0)} KiB brotli.`,
)
