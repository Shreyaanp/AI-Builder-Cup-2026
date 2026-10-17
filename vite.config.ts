import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// Each worktree can run its own dev servers (WEB_PORT/API_PORT), so parallel workers never test
// each other's code through a reused server.
const web = Number(process.env.WEB_PORT ?? 3200)
const api = Number(process.env.API_PORT ?? 3300)
const workspace = searchForWorkspaceRoot(process.cwd())
const linkedDependencies = realpathSync('node_modules')

// https://vite.dev/config/
export default defineConfig({
  base: process.env.ASSET_BASE_URL || '/',
  // Hosting publishes hashed assets only. Public files (icon, manifest, models) stay
  // on Cloud Run and must not inherit the optional cross-origin asset base.
  experimental: {
    renderBuiltUrl(filename, { type }) {
      if (type === 'public') return `/${filename}`
    },
  },
  plugins: [react()],
  build: { manifest: true },
  // Pre-bundled at start: found only when the face check opened, it reloaded the page mid-capture.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  server: {
    host: '127.0.0.1',
    port: web,
    strictPort: true,
    // In linked worktrees node_modules can resolve outside this checkout. Keep Vite's
    // filesystem guard while allowing that exact dependency directory.
    fs: { allow: [workspace, linkedDependencies] },
    proxy: { '/api': { target: `http://127.0.0.1:${api}`, ws: true } },
  },
  preview: { host: '127.0.0.1', port: web, strictPort: true },
})
