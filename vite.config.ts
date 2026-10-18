import { realpathSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import type { Plugin } from 'vite'

// Each worktree can run its own dev servers (WEB_PORT/API_PORT), so parallel workers never test
// each other's code through a reused server.
const web = Number(process.env.WEB_PORT ?? 3200)
const api = Number(process.env.API_PORT ?? 3300)

// The entry stylesheet is only @font-face rules (~22 KB, ~5 KB gzip) yet blocked first paint on
// every page. Inline it into index.html: the same rules, one round trip less before the first frame.
function inlineEntryCss(): Plugin {
  return {
    name: 'chalkboard:inline-entry-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return html
        return html.replace(
          /<link rel="stylesheet" crossorigin href="[^"]*?(assets\/index-[\w-]+\.css)">/g,
          (tag, file: string) => {
            const asset = bundle[file]
            if (asset?.type !== 'asset') return tag
            return `<style>${String(asset.source)}</style>`
          },
        )
      },
    },
  }
}

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
  plugins: [react(), inlineEntryCss()],
  build: { manifest: true },
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
