/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Small pure helpers for time series stored as (t: Float64Array, y: Float32Array). No DOM.

/** First index with t[i] >= x */
export function lowerBound(t, x, n = t.length) {
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

/** Last index with t[i] <= x (-1 if none) = the held value at time x */
export function heldIndex(t, x, n = t.length) {
  return lowerBound(t, x + 1e-9, n) - 1;
}

export function valueAt(t, y, x) {
  const i = heldIndex(t, x);
  return i >= 0 ? y[i] : NaN;
}

/** Mean of finite y with t in [a, b] */
export function rangeMean(t, y, a, b) {
  if (!t || !y) return NaN;
  const i0 = lowerBound(t, a);
  const i1 = lowerBound(t, b + 1e-9);
  let s = 0, c = 0;
  for (let i = i0; i < i1; i++) { const v = y[i]; if (v === v) { s += v; c++; } }
  return c ? s / c : NaN;
}

export function rangeStats(t, y, a, b) {
  const i0 = lowerBound(t, a);
  const i1 = lowerBound(t, b + 1e-9);
  let s = 0, c = 0, mn = Infinity, mx = -Infinity;
  for (let i = i0; i < i1; i++) {
    const v = y[i];
    if (v !== v) continue;
    s += v; c++;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return c ? { mean: s / c, min: mn, max: mx, n: c } : { mean: NaN, min: NaN, max: NaN, n: 0 };
}

export function median(values) {
  const a = Array.from(values).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function quantiles(values, qs) {
  const a = Array.from(values).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return qs.map(() => NaN);
  return qs.map((q) => a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]);
}

/** Centred moving average over +-win/2 seconds (NaN ignored). Returns a new Float32Array. */
export function smoothSeries(t, y, win) {
  const n = y.length;
  if (!win || win <= 0 || n < 2) return y;
  const ps = new Float64Array(n + 1);
  const pc = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = y[i];
    const ok = v === v;
    ps[i + 1] = ps[i] + (ok ? v : 0);
    pc[i + 1] = pc[i] + (ok ? 1 : 0);
  }
  const out = new Float32Array(n);
  const h = win / 2;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    while (t[a] < t[i] - h) a++;
    while (b < n && t[b] <= t[i] + h) b++;
    const c = pc[b] - pc[a];
    out[i] = c && y[i] === y[i] ? (ps[b] - ps[a]) / c : NaN;
  }
  return out;
}

const STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
/** Tick positions for [t0, t1] at least minPx apart over widthPx */
export function timeTicks(t0, t1, widthPx, minPx = 70) {
  const span = Math.max(1e-6, t1 - t0);
  const want = (span * minPx) / Math.max(1, widthPx);
  const step = STEPS.find((s) => s >= want) || STEPS[STEPS.length - 1];
  const out = [];
  for (let v = Math.ceil(t0 / step) * step; v <= t1 + 1e-9; v += step) out.push(+v.toFixed(3));
  return { ticks: out, step };
}

export function niceTicks(lo, hi, count = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(10));
  return out;
}

/** Elapsed seconds -> "m:ss" (or "h:mm:ss"; with tenths when step < 1 s) */
export function fmtElapsed(s, step = 1) {
  if (!Number.isFinite(s)) return '';
  const neg = s < 0;
  const a = Math.abs(s);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const sec = a % 60;
  const ss = step < 1 ? sec.toFixed(step < 0.1 ? 2 : 1).padStart(step < 0.1 ? 5 : 4, '0') : String(Math.floor(sec)).padStart(2, '0');
  return `${neg ? '-' : ''}${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${ss}`;
}

export const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
export const pct = (v, d = 0) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '–');

/** Share of time [a, b] where a held series satisfies pred (time-weighted). */
export function heldShare(t, y, pred, a, b) {
  if (!t || !t.length || !(b > a)) return NaN;
  let good = 0, known = 0;
  let i = Math.max(0, heldIndex(t, a));
  for (; i < t.length && t[i] < b; i++) {
    const s = Math.max(a, t[i]);
    const e = Math.min(b, i + 1 < t.length ? t[i + 1] : b);
    if (e <= s) continue;
    const v = y[i];
    if (v !== v) continue;
    known += e - s;
    if (pred(v)) good += e - s;
  }
  return known ? good / known : NaN;
}
