/* SPDX-License-Identifier: AGPL-3.0-or-later */
// App settings for this device (all children share them), one place for every device-wide choice.
// localStorage "brainarcade.settings" = { language: 'en' | 'sk' }. Per-child choices (play setup,
// calibration) stay in their own stores. Add a new setting: one entry in DEFAULTS (+ a check in VALID).
import { useSyncExternalStore } from 'react';
import { readJson, writeJson, emitChange } from './jsonStore.js';

export const SETTINGS_KEY = 'brainarcade.settings';
// Fired on window when a setting changes (detail: { key, value })
export const SETTINGS_CHANGED_EVENT = 'brainarcade:settings-changed';

export const LANGUAGES = [
  { id: 'en', label: 'ENGLISH', speech: 'en-US' },
  { id: 'sk', label: 'SLOVENČINA', speech: 'sk-SK' },
];

// First guess before anyone picks: Slovak when the phone or browser is set to Slovak (or Czech).
function defaultLanguage() {
  try {
    const l = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase();
    return l.startsWith('sk') || l.startsWith('cs') ? 'sk' : 'en';
  } catch {
    return 'en';
  }
}

const DEFAULTS = { language: defaultLanguage() };
const VALID = { language: (v) => LANGUAGES.some((l) => l.id === v) };

let cache = null;
function read() {
  if (cache) return cache;
  const o = readJson(SETTINGS_KEY) || {};
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (VALID[k]?.(o[k])) out[k] = o[k];
  cache = out;
  return out;
}

export function getSetting(key) {
  return read()[key];
}

export function setSetting(key, value) {
  if (!(key in DEFAULTS) || !VALID[key]?.(value)) return;
  const cur = read();
  if (cur[key] === value) return;
  cache = { ...cur, [key]: value };
  writeJson(SETTINGS_KEY, cache);
  emitChange(SETTINGS_CHANGED_EVENT, { key, value });
}

function subscribe(cb) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (e.key === SETTINGS_KEY) { cache = null; cb(); } }; // another tab changed it
  window.addEventListener(SETTINGS_CHANGED_EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(SETTINGS_CHANGED_EVENT, cb); window.removeEventListener('storage', onStorage); };
}

/** React hook: [value, setValue] for one setting, re-renders when it changes anywhere. */
export function useSetting(key) {
  const value = useSyncExternalStore(subscribe, () => read()[key], () => DEFAULTS[key]);
  return [value, (v) => setSetting(key, v)];
}
