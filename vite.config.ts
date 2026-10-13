import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3200,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3300', ws: true } },
  },
  preview: { host: '127.0.0.1', port: 3200, strictPort: true },
})
