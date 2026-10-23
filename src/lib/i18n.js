/* SPDX-License-Identifier: AGPL-3.0-or-later */
// On-screen text in every app language. Spoken game lines stay in phrases.js.
// t('key', vars) gives the text in the app language (falls back to English, then to the key).
// {name} in a text is filled from vars. A text can be a plural object:
//   en { one, other }, sk { one, few, other } (1 / 2-4 / 0 and 5+), picked by vars.n.
// Components use useT() so they re-render when the language changes. Never call t() at
// module top level: the text would stay in the language of the first load.
import { useCallback } from 'react';
import { getSetting, useSetting } from './settings.js';
import { MESSAGES } from '../locales/index.js';

function pluralForm(n, lang) {
  if (lang === 'sk') return n === 1 ? 'one' : n >= 2 && n <= 4 ? 'few' : 'other';
  return n === 1 ? 'one' : 'other';
}

const warned = new Set();
function lookup(key, lang) {
  const own = MESSAGES[lang]?.[key];
  if (own != null) return own;
  if (lang !== 'en' && import.meta.env?.DEV && !warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] no ${lang} text for "${key}"`);
  }
  return MESSAGES.en[key] ?? key;
}

/** The text for a key in the app language (or in lang). */
export function t(key, vars = {}, lang = getSetting('language')) {
  let msg = lookup(key, lang);
  if (msg && typeof msg === 'object') {
    const n = Number(vars.n);
    msg = msg[pluralForm(Number.isFinite(n) ? Math.abs(n) : 0, lang)] ?? msg.other ?? '';
  }
  return String(msg).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/** BCP 47 locale for numbers and dates (toLocaleString). */
export function locale(lang = getSetting('language')) {
  return lang === 'sk' ? 'sk-SK' : 'en-US';
}

/** React hook: a t() bound to the current language. The component re-renders on a switch. */
export function useT() {
  const [lang] = useSetting('language');
  return useCallback((key, vars) => t(key, vars, lang), [lang]);
}

/** React hook: the current language id ('en' | 'sk'), for useMemo deps and locale(). */
export function useLang() {
  return useSetting('language')[0];
}
