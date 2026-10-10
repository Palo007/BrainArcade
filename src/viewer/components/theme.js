/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Colours and small hooks shared by the recording viewer components (NES palette from index.css).
import { useEffect, useState } from 'react';

export const THEME = {
  bg: '#101010',
  grid: '#2a2a2a',
  frame: '#505050',
  axis: '#9a9a9a',
  text: '#d8d8d8',
  cursor: '#ffffff',
  shade: 'rgba(120,120,120,0.22)',
  gap: 'rgba(160,160,160,0.28)',
  off: 'rgba(252,128,128,0.16)',
  bad: 'rgba(252,128,128,0.28)',
  move: 'rgba(252,192,96,0.22)',
};

export const BAND_COLORS = { Delta: '#A070FF', Theta: '#40C0FF', Alpha: '#00C020', Beta: '#FCC060', Gamma: '#FC8080' };
export const SENSOR_COLORS = { TP9: '#40C0FF', AF7: '#00C020', AF8: '#FCC060', TP10: '#FC8080' };

export const EVENT_STYLE = {
  marker: { color: '#FCC060', line: true, dash: [4, 3] },
  connect: { color: '#808080', line: true, dash: [2, 3] },
  blink: { color: '#40C0FF', line: false },
  jaw: { color: '#FC8080', line: false },
  forehead: { color: '#A070FF', line: false },
  other: { color: '#c0c0c0', line: false },
};

export const SMOOTH_OPTS = [[0, 'RAW'], [5, '5S'], [10, '10S'], [30, '30S'], [60, '60S']];
export const bandsGroupOf = (rec, ana) => rec.groups.bands || ana.bandsDerived || null;

export const padLeft = (w) => (w < 480 ? 40 : 52);

export function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Save a Blob as a local file (nothing leaves the device). */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const PREFS_KEY = 'brainarcade.viewerPrefs';
export function loadPrefs(defaults) {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { ...defaults, ...v, open: { ...defaults.open, ...(v.open || {}) } };
  } catch {
    return defaults;
  }
}
export function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
