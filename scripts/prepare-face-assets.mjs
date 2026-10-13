import { cp, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

await mkdir('public/mediapipe', { recursive: true })
await cp('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe', { recursive: true })
const path = 'face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const metadataResponse = await fetch(
  `https://storage.googleapis.com/storage/v1/b/mediapipe-models/o/${encodeURIComponent(path)}`,
)
if (!metadataResponse.ok) throw new Error('MediaPipe publisher metadata unavailable')
const metadata = await metadataResponse.json()
const response = await fetch(
  `https://storage.googleapis.com/mediapipe-models/${path}?generation=${metadata.generation}`,
)
if (!response.ok) throw new Error('MediaPipe model unavailable')
const data = Buffer.from(await response.arrayBuffer())
if (
  data.length !== Number(metadata.size) ||
  createHash('md5').update(data).digest('base64') !== metadata.md5Hash
)
  throw new Error('MediaPipe model integrity check failed')
await mkdir('public/models', { recursive: true })
await writeFile('public/models/face_landmarker.task', data)
await writeFile(
  'public/models/face_landmarker.receipt.json',
  JSON.stringify({
    source: response.url,
    generation: metadata.generation,
    sha256: createHash('sha256').update(data).digest('hex'),
  }),
)
console.log('MediaPipe local guidance assets verified and prepared.')
