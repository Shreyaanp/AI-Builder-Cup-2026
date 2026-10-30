import { realpathSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// Each worktree can run its own dev servers (WEB_PORT/API_PORT), so parallel workers never test
// each other's code through a reused server.
const web = Number(process.env.WEB_PORT ?? 3200)
const api = Number(process.env.API_PORT ?? 3300)

// https://vite.dev/config/
export default defineConfig({
  // Worktrees share node_modules here; port-scoped caches keep Vite workers isolated.
  cacheDir: `node_modules/.vite-${web}`,
  base: process.env.ASSET_BASE_URL || '/',
  // Hosting publishes hashed assets only. Public files (icon, manifest, models) stay
  // on Cloud Run and must not inherit the optional cross-origin asset base.
  experimental: {
    renderBuiltUrl(filename, { type }) {
      if (type === 'public') return `/${filename}`
    },
  },
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // OB-165: lazy screens split the icons into dozens of sub-kilobyte files, each its own
          // round trip on a phone. One small icon chunk replaces them.
          groups: [{ name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/ }],
        },
      },
    },
  },
  // Pre-bundled at start: found only when the face check opened, it reloaded the page mid-capture.
  optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  server: {
    host: '127.0.0.1',
    port: web,
    strictPort: true,
    // Linked dependencies can resolve outside this worktree; Vite must allow their real path.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] },
    proxy: { '/api': { target: `http://127.0.0.1:${api}`, ws: true } },
  },
  preview: { host: '127.0.0.1', port: web, strictPort: true },
})
