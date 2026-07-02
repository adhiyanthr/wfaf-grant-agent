import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'postbuild-rename',
      apply: 'build',
      enforce: 'post',
      closeBundle: async () => {
        const _appDir = resolve(__dirname, '_app')
        if (fs.existsSync(_appDir)) {
          const appEntryHtml = path.join(_appDir, 'app-entry.html')
          const indexHtml = path.join(_appDir, 'index.html')
          if (fs.existsSync(appEntryHtml) && !fs.existsSync(indexHtml)) {
            fs.renameSync(appEntryHtml, indexHtml)
          }
        }
      },
    },
  ],
  base: '/_app/',
  build: {
    outDir: '_app',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'app-entry.html'),
    }
  },
  server: {
    middlewareMode: true,
  },
})
