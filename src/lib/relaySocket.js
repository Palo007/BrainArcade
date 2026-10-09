/* SPDX-License-Identifier: AGPL-3.0-or-later */
// One shared WebSocket to the relay server (tools/relay-hub.mjs, path /relay).
// Reconnects by itself with back-off. It never reloads the page (the Vite HMR socket did,
// and a page reload on the phone drops the Bluetooth link).
const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 5000;

export const relayAvailable =
  typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

const listeners = new Map(); // type → Set(fn)
const statusListeners = new Set();
let ws = null;
let retryMs = RETRY_MIN_MS;
let hello = null;
let started = false;
let openedAt = 0;

const emitStatus = (s) => statusListeners.forEach((fn) => fn(s));

function open() {
  try {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay`);
  } catch (e) {
    emitStatus({ open: false, err: String(e) });
    setTimeout(open, retryMs);
    return;
  }
  ws.onopen = () => {
    retryMs = RETRY_MIN_MS;
    openedAt = Date.now();
    if (hello) ws.send(JSON.stringify({ t: 'hello', ...hello }));
    emitStatus({ open: true });
  };
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    listeners.get(msg.t)?.forEach((fn) => fn(msg));
  };
  ws.onclose = (e) => {
    ws = null;
    emitStatus({ open: false, code: e.code, upMs: openedAt ? Date.now() - openedAt : 0, retryMs });
    openedAt = 0;
    setTimeout(open, retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  };
}

export function startRelay(info) {
  if (info) hello = { ...hello, ...info };
  if (!relayAvailable) return;
  if (!started) {
    started = true;
    open();
  } else if (info && ws?.readyState === 1) {
    ws.send(JSON.stringify({ t: 'hello', ...hello }));
  }
}

export const relayOpen = () => ws?.readyState === 1;

// Returns false when the socket is down (caller decides whether to queue)
export function relaySend(msg) {
  if (ws?.readyState !== 1) return false;
  // Don't let a stuck socket grow an unbounded send buffer
  if (ws.bufferedAmount > 1_000_000) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

export function onRelay(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

export function onRelayStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
