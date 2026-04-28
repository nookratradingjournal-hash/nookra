import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Marketing site bundle. Mirrors vite.config.admin.ts pattern but outputs
// to the existing /website/ directory alongside Nookra.dmg. emptyOutDir
// is false so the installer binary is preserved across builds.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5175 },
  build: {
    outDir: 'website',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'website.html'),
    },
  },
})
