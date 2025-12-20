import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for Electron: use relative base so assets load over file://
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
