import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { attachRelay, createLogger } from './tools/relay-hub.mjs'

// Dev-only: phone → PC EEG relay + diagnostics log on ws://<host>/relay (same as tools/arcade-server.mjs).
// Client side lives in src/lib/relaySocket.js. For real play use `npm run arcade` (no HMR auto-reload).
const athenaRelay = () => ({
  name: 'athena-relay',
  apply: 'serve',
  configureServer(server) {
    if (server.httpServer) attachRelay(server.httpServer, createLogger(path.resolve('logs')))
  },
})

// Build-only: GitHub Pages serves 404.html for unknown paths, so a copy of index.html makes deep links (SPA routes) work;
// and the service worker gets a per-build cache name so stale hashed assets are dropped on activate.
const spaFallbackAndSwStamp = () => {
  let outDir = 'dist'
  return {
    name: 'spa-404-sw-stamp',
    apply: 'build',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir) },
    closeBundle() {
      const idx = path.join(outDir, 'index.html')
      if (fs.existsSync(idx)) fs.copyFileSync(idx, path.join(outDir, '404.html'))
      const sw = path.join(outDir, 'sw.js')
      if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace("'brain-arcade-v2'", `'brain-arcade-${Date.now().toString(36)}'`))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // VITE_BASE=/BrainArcade/ for GitHub Pages / Android TWA builds; default '/' keeps dev and `npm run arcade` unchanged
  base: process.env.VITE_BASE || '/',
  plugins: [react(), athenaRelay(), spaFallbackAndSwStamp()],
})
