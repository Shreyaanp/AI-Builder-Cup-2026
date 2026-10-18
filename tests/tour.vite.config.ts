import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { realpathSync } from 'node:fs'

// This isolated, fully mocked check must never load local secrets or start the backend.
export default defineConfig({
  envDir: false,
  plugins: [react()],
  preview: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 4231), strictPort: true },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 4231),
    strictPort: true,
    fs: { allow: [process.cwd(), realpathSync('node_modules')] },
  },
})
