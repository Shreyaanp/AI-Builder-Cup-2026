import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Each worktree can run its own dev servers (WEB_PORT/API_PORT), so parallel workers never test
// each other's code through a reused server.
const web = Number(process.env.WEB_PORT ?? 3200)
const api = Number(process.env.API_PORT ?? 3300)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: { manifest: true },
  server: {
    host: '127.0.0.1',
    port: web,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${api}`, ws: true } },
  },
  preview: { host: '127.0.0.1', port: web, strictPort: true },
})
