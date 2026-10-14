// Launch capture dev server: the real app on port 3210, API proxied to the capture backend.
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3210,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3310', ws: true } },
  },
})
