// Preserve superseded recordings locally without including them in current evidence.
import { mkdir, realpath, rename } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { stories } from './catalog.mjs'
const workspace = await realpath('.')
const sourceRoot = await realpath('docs/stories/director')
const destination = resolve(workspace, '.cache', 'director-discarded', String(Date.now()))
if (!sourceRoot.startsWith(workspace + sep) || !destination.startsWith(workspace + sep))
  throw new Error('Archive paths must remain inside workspace')
await mkdir(destination, { recursive: true })
for (const name of [...stories.map((s) => s.id), 'results.json']) {
  const source = resolve(sourceRoot, name),
    target = resolve(destination, name)
  if (!source.startsWith(sourceRoot + sep) || !target.startsWith(destination + sep))
    throw new Error('Archive target escaped its root')
  try {
    const physical = await realpath(source)
    if (!physical.startsWith(sourceRoot + sep))
      throw new Error('Archive cannot follow an external link')
    await rename(source, target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
console.log(
  'Superseded director evidence preserved under ignored .cache/director-discarded; current story directories cleared by moving, without deletion.',
)
