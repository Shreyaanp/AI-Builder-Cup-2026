// Prints the demo's recordable lines as JSON ({ lang: [{ key, text }] }) for record-demo-voice.py.
import { createServer } from 'vite'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})
try {
  const lines = await server.ssrLoadModule('/src/features/tour/demoLines.ts')
  const out = {}
  for (const lang of lines.DEMO_VOICE_LANGUAGES) out[lang] = lines.demoLines(lang)
  process.stdout.write(JSON.stringify(out))
} finally {
  await server.close()
}
