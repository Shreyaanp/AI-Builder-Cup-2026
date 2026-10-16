// Axe opens temporary pages; preserve their blank videos outside review artifacts.
import { mkdir, readdir, realpath, rename } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { stories } from './catalog.mjs'
const root = await realpath('.')
const output = await realpath('docs/stories/director')
const archive = resolve(root, '.cache/director-auxiliary-videos', String(Date.now()))
if (!output.startsWith(root + sep) || !archive.startsWith(root + sep))
  throw new Error('Video paths must remain in workspace')
let moved = 0
for (const story of stories)
  for (const variant of ['phone-light', 'phone-dark', 'desktop-light', 'desktop-dark']) {
    const directory = resolve(output, story.id, variant)
    let files = []
    try {
      files = await readdir(directory)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    for (const file of files) {
      if (!/^(?:page@)?[a-f0-9]{32}\.webm$/.test(file)) continue
      const source = await realpath(resolve(directory, file))
      const destination = resolve(archive, story.id, variant, file)
      if (!source.startsWith(output + sep) || !destination.startsWith(archive + sep))
        throw new Error('Unexpected auxiliary video target')
      await mkdir(resolve(archive, story.id, variant), { recursive: true })
      await rename(source, destination)
      moved++
    }
  }
console.log(
  `Preserved ${moved} auxiliary page videos under ignored .cache; review videos remain beside each run.`,
)
// Earlier harness versions put Vite JS under .cache, which ESLint legitimately scans.
// Run --cache only after stopping the server. Preserve it under the existing ignored output tree.
if (process.argv.includes('--cache')) {
  const cacheRoot = resolve(root, '.cache', 'director')
  for (const entry of await readdir(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue
    const source = resolve(cacheRoot, entry.name, 'vite')
    const destination = resolve(root, 'output', 'director-cache-archived', entry.name)
    if (!source.startsWith(cacheRoot + sep) || !destination.startsWith(root + sep))
      throw new Error('Unexpected Vite cache path')
    try {
      const physical = await realpath(source)
      if (!physical.startsWith(cacheRoot + sep))
        throw new Error('Cache cannot follow external links')
      await mkdir(resolve(root, 'output', 'director-cache-archived'), { recursive: true })
      await rename(source, destination)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  console.log('Preserved earlier Vite caches under ignored output for clean source linting.')
}
