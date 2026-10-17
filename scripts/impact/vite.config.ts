import { defineConfig, mergeConfig } from 'vite'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import base from '../../vite.config.ts'

// Do not read any checkout's .env files, including during a production build.
export default mergeConfig(
  base,
  defineConfig({
    envDir: false,
    cacheDir: resolve('output/impact/vite-cache'),
    server: { fs: { allow: [resolve('.'), realpathSync('node_modules')] } },
  }),
)
