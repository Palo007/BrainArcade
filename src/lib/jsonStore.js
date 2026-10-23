/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Small localStorage helpers shared by the settings stores (settings.js, playSetup.js).
// Every call survives private mode, blocked storage and bad JSON.

/** Parsed value of key, or null when missing, unreadable or not JSON. */
export function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

/** Save value as JSON under key; silently does nothing when storage is unavailable. */
export function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Fire a window event so open screens can follow the change. */
export function emitChange(eventName, detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(eventName, { detail }));
}
