import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initDiag } from './lib/diagLog.js'

// Diagnostics log → logs/arcade-YYYY-MM-DD.log on the PC (see tools/relay-hub.mjs)
initDiag('page')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
