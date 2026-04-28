import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Marketing site bundle. Mirrors vite.config.admin.ts pattern but outputs
// to the existing /website/ directory alongside Nookra.dmg. emptyOutDir
// is false so the installer binary is preserved across builds.
//
// Hosting hygiene: Vite normally writes the entry as `<sourcename>.html`,
// so this build emits `website.html`. Cloudflare Workers Static Assets
// (and most static hosts) serve `/` from `index.html`, not `website.html`,
// so we rename the file on `closeBundle`. Without this rename the deployed
// site loads as a blank page.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'rename-website-html-to-index',
      closeBundle() {
        const src = path.resolve(__dirname, 'website/website.html')
        const dest = path.resolve(__dirname, 'website/index.html')
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest)
        }
      },
    },
  ],
  server: { port: 5175 },
  build: {
    outDir: 'website',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'website.html'),
    },
  },
})
