/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Diagnostics log. Every event goes to:
//   - the console
//   - window.__diag.events (last 500, in-page)
//   - the relay server → logs/arcade-YYYY-MM-DD.log on the PC (queued while the socket is down)
// Also logs page life-cycle events that explain lost connections
// (reload, tab hidden, page frozen by Android, network change, JS errors).
import { startRelay, relaySend, onRelayStatus } from './relaySocket.js';

const MAX_KEEP = 500;
const MAX_QUEUE = 2000;
const FLUSH_MS = 1000;

const events = [];
let queue = [];
let installed = false;

export function diag(ev, d) {
  const e = { ts: Date.now(), ev, d };
  events.push(e);
  if (events.length > MAX_KEEP) events.shift();
  queue.push(e);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  console.log('[diag]', ev, d ?? '');
}

function flush() {
  if (!queue.length) return;
  if (relaySend({ t: 'log', events: queue })) queue = [];
}

// role: 'phone' (Muse is paired here) or 'pc' (gets data via relay). Can be called again to change role.
export function initDiag(role) {
  startRelay({ role, page: location.pathname + location.search, nav: navType() });
  if (installed) return;
  installed = true;
  if (typeof window !== 'undefined') window.__diag = { events, log: diag };

  diag('page-load', {
    nav: navType(),
    ua: navigator.userAgent.slice(0, 120),
    visible: document.visibilityState,
  });
  setInterval(flush, FLUSH_MS);

  onRelayStatus((s) => {
    diag(s.open ? 'relay-open' : 'relay-closed', s);
    if (s.open) flush();
  });
  document.addEventListener('visibilitychange', () => diag('visibility', { state: document.visibilityState }));
  // Chrome on Android freezes background pages; 'resume' tells us the page was frozen
  document.addEventListener('freeze', () => diag('page-freeze'));
  document.addEventListener('resume', () => diag('page-resume'));
  window.addEventListener('pagehide', (e) => {
    diag('page-hide', { persisted: e.persisted });
    flush();
  });
  window.addEventListener('online', () => diag('net-online'));
  window.addEventListener('offline', () => diag('net-offline'));
  window.addEventListener('error', (e) => diag('js-error', { msg: e.message, src: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => diag('js-rejection', { msg: String(e.reason?.message || e.reason) }));
  navigator.getBattery?.().then((b) => {
    diag('battery', { level: b.level, charging: b.charging });
    b.addEventListener('chargingchange', () => diag('battery', { level: b.level, charging: b.charging }));
  });
}

function navType() {
  return performance.getEntriesByType?.('navigation')?.[0]?.type || 'unknown'; // 'reload' = page was reloaded
}
