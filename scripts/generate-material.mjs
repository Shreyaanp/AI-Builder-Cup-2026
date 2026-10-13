import { writeFile } from 'node:fs/promises'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

// Google's generator runs in tooling, keeping the color engine out of the browser bundle.
// MCU 0.4.0 contains extensionless ESM imports; use Vite's supported bundler
// resolution rather than patching node_modules or relying on a Node loader workaround.
const result = await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./material-source.mjs', import.meta.url)),
      formats: ['es'],
    },
  },
})
const outputs = Array.isArray(result) ? result : [result]
const entry = outputs
  .flatMap((output) => output.output)
  .find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
if (!entry) throw new Error('Material token bundle was not generated.')
const { default: roles } = await import(
  `data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`
)
await writeFile(
  new URL('../src/design/material-roles.generated.json', import.meta.url),
  JSON.stringify(roles, null, 2) + '\n',
)
console.log('Generated light/dark semantic roles with Google Material Color Utilities.')
