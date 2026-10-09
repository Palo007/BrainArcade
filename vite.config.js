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

// https://vite.dev/config/
export default defineConfig({
  // VITE_BASE=/BrainArcade/ for GitHub Pages / Android TWA builds; default '/' keeps dev and `npm run arcade` unchanged
  base: process.env.VITE_BASE || '/',
  plugins: [react(), athenaRelay()],
})
