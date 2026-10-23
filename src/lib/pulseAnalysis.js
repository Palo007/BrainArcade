/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Beat-to-beat pulse analysis from the Muse S Athena optics (PPG): beats, inter-beat intervals (IBI),
// HRV (RMSSD, SDNN, pNN50, LF/HF) and breathing rate. Pure (no React, no DOM): used by the recording
// viewer worker now, and meant for live use later. ALL values are estimates from forehead PPG
// (pulse-rate variability, not ECG HRV) and have not been validated against a chest strap.
//
// Timing: beat times come from the SAMPLE INDEX divided by the measured optics rate, not from the CSV
// row timestamps. In BrainArcade CSV files optics arrive in BLE bursts of ~4 samples, so row times
// jitter by -121..+61 ms around the real sample clock; differencing such times would swamp RMSSD.
// Recordings made before the recorder fix keep only ~15-16 unique optics samples/s (the last sample
// of each burst): their sample clock is irregular, so HRV is reported as unavailable there
// (effective rate < HRV_MIN_FS). Breathing (0.1-0.6 Hz) still works from those files.
//
// Pipeline (validated offline on 3 recordings, see docs/SIGNAL-MECHANICS.md 8c):
//   pulse channels (heartRate.js) -> relative change vs a 2 s mean, inverted (systole = peak)
//   -> zero-phase band-pass 0.5-4 Hz (heartRate.js biquads, run forward + backward)
//   -> peaks: > 0.6 x 1.5 s envelope, 0.33 s refractory, parabolic sub-sample interpolation
//   -> IBI artifact filter: 0.33-1.5 s and within 20 % of the 11-interval median
//   -> time-domain HRV on clean (NN) intervals; Lomb-Scargle LF/HF only for >= 5 min.
// Breathing: RIFV (IBI series = respiratory sinus arrhythmia) and RIAV (beat amplitude) are the
// primary pair; RIIV (slow IR baseline) and head pitch (Gyro_X) only vote. 60 s windows every 15 s,
// Hann spectral peak 6-36 br/min. A window is accepted when RIFV and RIAV agree within 3 br/min, or
// when a third vote agrees within 2 br/min with one of them; otherwise it is rejected (NaN).
import { makeBandpass, pulseChannels } from './heartRate.js';

export const HRV_MIN_FS = 30; // effective unique optics rate needed for beat timing
const ARRIVAL_GRID_FS = 16; // low-rate files: resample arrival-time samples to this uniform grid
const SEG_GAP_S = 1; // a pause longer than this between optics samples starts a new segment
const MIN_SEG_S = 10; // shorter segments are ignored
const EDGE_S = 1; // beats this close to a segment edge are dropped (filter start-up)
const PPG_LO = 0.5, PPG_HI = 4;
const LEVEL_S = 2; // relative-change reference for the pulse
const BASE_LEVEL_S = 20; // relative-change reference for the slow baseline (RIIV)
const IBI_MIN = 0.33, IBI_MAX = 1.5, IBI_DEV = 0.2, IBI_MED_HALF = 5;
const HRV_WIN_S = 60, HRV_STEP_S = 30, HRV_MIN_PAIRS = 20, HRV_MAX_ART = 25;
export const LFHF_MIN_S = 300;
const RESP_FS = 4, RESP_LO = 0.1, RESP_HI = 0.7;
const RESP_WIN_S = 60, RESP_STEP_S = 15, RESP_FMIN = 0.1, RESP_FMAX = 0.6, RESP_DF = 0.0025;
const RESP_AGREE = 3, VOTE_AGREE = 2, RESP_MIN_VALID = 0.8;

/* ---------------- small helpers ---------------- */

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
function sdev(a) { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2; return Math.sqrt(s / (a.length - 1)); }
function quant(a, q) {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  const p = (s.length - 1) * q, i = Math.floor(p);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (p - i) : s[i];
}
const medianOf = (a) => quant(a, 0.5);

/** Centered moving average over w samples (prefix sums, shrinks at the edges) */
export function movingAverage(x, w) {
  const n = x.length, h = w >> 1, y = new Float64Array(n), P = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) P[i + 1] = P[i] + x[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); y[i] = (P[b] - P[a]) / (b - a); }
  return y;
}

/** Zero-phase band-pass: the heartRate.js biquad chain run forward and backward, odd-reflection padded */
export function filtfilt(x, fs, lo, hi) {
  const n = x.length;
  if (n < 4) return Float64Array.from(x);
  const pad = Math.min(n - 1, Math.round((3 * fs) / lo));
  const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) { ext[i] = 2 * x[0] - x[pad - i]; ext[n + pad + i] = 2 * x[n - 1] - x[n - 2 - i]; }
  for (let i = 0; i < n; i++) ext[pad + i] = x[i];
  let f = makeBandpass(fs, lo, hi);
  for (let i = 0; i < ext.length; i++) ext[i] = f(ext[i]);
  f = makeBandpass(fs, lo, hi);
  for (let i = ext.length - 1; i >= 0; i--) ext[i] = f(ext[i]);
  return ext.slice(pad, pad + n);
}

/** Linear interpolation of (ts, xs) (ts ascending) onto t0 + k/fs, k < n; held at the ends */
function interpGrid(ts, xs, t0, fs, n) {
  const y = new Float64Array(n);
  if (!ts.length) return y.fill(NaN);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = t0 + k / fs;
    while (j < ts.length - 2 && ts[j + 1] < t) j++;
    if (ts.length === 1 || t <= ts[0]) { y[k] = xs[0]; continue; }
    if (t >= ts[ts.length - 1]) { y[k] = xs[ts.length - 1]; continue; }
    const d = ts[j + 1] - ts[j], u = d > 0 ? (t - ts[j]) / d : 0;
    y[k] = xs[j] + (xs[j + 1] - xs[j]) * Math.max(0, Math.min(1, u));
  }
  return y;
}

/** Mean of samples per 1/fs bin (anti-alias for fast streams), empty bins linearly filled; NaN when no data */
function binGrid(ts, xs, fs, n) {
  const s = new Float64Array(n), c = new Float64Array(n);
  for (let i = 0; i < ts.length; i++) {
    const k = Math.round(ts[i] * fs);
    if (k >= 0 && k < n && finite(xs[i])) { s[k] += xs[i]; c[k]++; }
  }
  const bt = [], bv = [];
  for (let k = 0; k < n; k++) if (c[k]) { bt.push(k / fs); bv.push(s[k] / c[k]); }
  return bt.length >= 2 ? interpGrid(bt, bv, 0, fs, n) : null;
}

/* ---------------- optics -> segments -> beats ---------------- */

function opticsChannels(cols) {
  const has = (c) => { if (!c) return false; for (let i = 0; i < c.length; i++) if (finite(c[i]) && c[i] !== 0) return true; return false; };
  const n = has(cols.Optics5) ? 8 : 4;
  return pulseChannels(n).map((k) => cols[`Optics${k + 1}`]);
}

/**
 * Split valid samples into continuous segments and fit one sample clock (pooled least squares of row
 * time against sample index). Returns the effective unique rate and each segment's index-clock origin.
 */
export function fitSampleClock(t, segments) {
  let sxy = 0, sxx = 0;
  for (const s of segments) {
    const m = s.length, ib = (m - 1) / 2;
    let tb = 0;
    for (let k = 0; k < m; k++) tb += t[s[k]];
    tb /= m;
    for (let k = 0; k < m; k++) { sxy += (k - ib) * (t[s[k]] - tb); sxx += (k - ib) ** 2; }
  }
  const fs = sxy > 0 ? sxx / sxy : NaN;
  let resMin = Infinity, resMax = -Infinity;
  const origins = segments.map((s) => {
    let a = 0;
    for (let k = 0; k < s.length; k++) a += t[s[k]] - k / fs;
    a /= s.length;
    for (let k = 0; k < s.length; k++) { const r = t[s[k]] - (a + k / fs); if (r < resMin) resMin = r; if (r > resMax) resMax = r; }
    return a;
  });
  return { fs, origins, residualMs: [resMin * 1e3, resMax * 1e3] };
}

/** Systolic peaks with parabolic sub-sample interpolation. x = band-passed pulse, fs = its rate. */
export function detectBeats(x, fs) {
  const n = x.length;
  const absx = new Float64Array(n);
  for (let i = 0; i < n; i++) absx[i] = Math.abs(x[i]);
  const env = movingAverage(absx, Math.round(fs * 1.5));
  const minD = Math.round(fs * 0.33);
  const pk = [];
  for (let i = 1; i < n - 1; i++) {
    if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 0.6 * env[i]) {
      const last = pk.length - 1;
      if (last >= 0 && i - pk[last] < minD) { if (x[i] > x[pk[last]]) pk[last] = i; } else pk.push(i);
    }
  }
  const pos = new Float64Array(pk.length), amp = new Float64Array(pk.length);
  pk.forEach((i, k) => {
    const a = x[i - 1], b = x[i], c = x[i + 1], den = a - 2 * b + c;
    const d = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    pos[k] = i + d;
    amp[k] = b - 0.25 * (a - c) * d;
  });
  return { pos, amp };
}

/**
 * IBIs from beat times. ok = within 0.33-1.5 s and within 20 % of the median of the surrounding 11
 * intervals. Intervals never span two segments.
 */
export function cleanIbis(beatT, beatSeg) {
  const t = [], v = [], seg = [];
  for (let k = 1; k < beatT.length; k++) {
    if (beatSeg[k] !== beatSeg[k - 1]) continue;
    t.push(beatT[k]); v.push(beatT[k] - beatT[k - 1]); seg.push(beatSeg[k]);
  }
  const n = t.length, ok = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (v[k] < IBI_MIN || v[k] > IBI_MAX) continue;
    const w = [];
    for (let j = Math.max(0, k - IBI_MED_HALF); j <= Math.min(n - 1, k + IBI_MED_HALF); j++) if (seg[j] === seg[k]) w.push(v[j]);
    const m = medianOf(w);
    ok[k] = Math.abs(v[k] - m) / m < IBI_DEV ? 1 : 0;
  }
  return { t: Float64Array.from(t), v: Float32Array.from(v), ok, seg: Uint16Array.from(seg), n };
}

function lomb(ts, vs, lo, hi, df = 0.005) {
  const m = mean(vs);
  let s = 0;
  for (let fq = lo; fq < hi; fq += df) {
    const w = 2 * Math.PI * fq;
    let s2 = 0, c2 = 0;
    for (const t of ts) { s2 += Math.sin(2 * w * t); c2 += Math.cos(2 * w * t); }
    const tau = Math.atan2(s2, c2) / (2 * w);
    let cs = 0, ss = 0, cc = 0, sn = 0;
    for (let k = 0; k < ts.length; k++) {
      const a = w * (ts[k] - tau), d = vs[k] - m, ca = Math.cos(a), sa = Math.sin(a);
      cs += d * ca; cc += ca * ca; ss += d * sa; sn += sa * sa;
    }
    s += 0.5 * ((cs * cs) / cc + (ss * ss) / sn);
  }
  return s;
}

/**
 * Time-domain HRV over the IBIs whose end beat lies in [a, b]. LF/HF (Lomb-Scargle 0.04-0.15 /
 * 0.15-0.4 Hz) only with opts.lfhf and a span >= 5 min; it is meaningful at rest only.
 * @returns {{ibis:number, nn:number, pairs:number, artifactPct:number, meanHR:number, rmssd:number, sdnn:number, pnn50:number, lfhf?:number}}
 */
export function hrvMetrics(ibi, a = -Infinity, b = Infinity, opts = {}) {
  const nnT = [], nnV = [], dif = [];
  let total = 0, tFirst = Infinity, tLast = -Infinity;
  for (let k = 0; k < ibi.n; k++) {
    const t = ibi.t[k];
    if (t < a || t > b) continue;
    total++;
    if (t < tFirst) tFirst = t;
    tLast = t;
    if (!ibi.ok[k]) continue;
    nnT.push(t); nnV.push(ibi.v[k]);
    if (k > 0 && ibi.ok[k - 1] && ibi.seg[k - 1] === ibi.seg[k] && ibi.t[k - 1] >= a) dif.push(ibi.v[k] - ibi.v[k - 1]);
  }
  const out = {
    ibis: total, nn: nnV.length, pairs: dif.length,
    artifactPct: total ? 100 * (1 - nnV.length / total) : NaN,
    meanHR: nnV.length ? 60 / mean(nnV) : NaN,
    rmssd: dif.length ? 1e3 * Math.sqrt(mean(dif.map((d) => d * d))) : NaN,
    sdnn: nnV.length > 2 ? 1e3 * sdev(nnV) : NaN,
    pnn50: dif.length ? (100 * dif.filter((d) => Math.abs(d) > 0.05).length) / dif.length : NaN,
  };
  if (opts.lfhf && tLast - tFirst >= LFHF_MIN_S && nnV.length > 100) {
    const lf = lomb(nnT, nnV, 0.04, 0.15), hf = lomb(nnT, nnV, 0.15, 0.4);
    out.lfhf = hf > 0 ? lf / hf : NaN;
  }
  return out;
}

/** Windowed RMSSD (60 s windows every 30 s); NaN where too few clean pairs or too many artifacts */
export function rmssdTrack(ibi, duration) {
  const t = [], v = [], art = [];
  for (let a = 0; a + HRV_WIN_S <= duration + 1e-6; a += HRV_STEP_S) {
    const m = hrvMetrics(ibi, a, a + HRV_WIN_S);
    t.push(a + HRV_WIN_S / 2);
    art.push(m.artifactPct);
    v.push(m.pairs >= HRV_MIN_PAIRS && m.artifactPct <= HRV_MAX_ART ? m.rmssd : NaN);
  }
  return { t: Float64Array.from(t), v: Float32Array.from(v), art: Float32Array.from(art), n: t.length };
}

/* ---------------- breathing ---------------- */

function makeSpectrum(W, fs) {
  const K = Math.round((RESP_FMAX - RESP_FMIN) / RESP_DF) + 1;
  const cos = new Float64Array(K * W), sin = new Float64Array(K * W), han = new Float64Array(W);
  for (let i = 0; i < W; i++) han[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
  for (let k = 0; k < K; k++) {
    const w = (2 * Math.PI * (RESP_FMIN + k * RESP_DF)) / fs;
    for (let i = 0; i < W; i++) { cos[k * W + i] = Math.cos(w * i) * han[i]; sin[k * W + i] = Math.sin(w * i) * han[i]; }
  }
  return (x, s) => {
    let m = 0;
    for (let i = 0; i < W; i++) m += x[s + i];
    m /= W;
    let best = -1, bk = 0, tot = 0;
    const P = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < W; i++) { const d = x[s + i] - m; re += d * cos[k * W + i]; im += d * sin[k * W + i]; }
      P[k] = re * re + im * im; tot += P[k];
      if (P[k] > best) { best = P[k]; bk = k; }
    }
    if (!(tot > 0)) return { f: NaN, conc: 0 };
    let near = 0;
    for (let k = Math.max(0, bk - 8); k <= Math.min(K - 1, bk + 8); k++) near += P[k];
    return { f: 60 * (RESP_FMIN + bk * RESP_DF), conc: near / tot };
  };
}

function prepSource(x, valid) {
  if (!x) return null;
  let s = 0, c = 0;
  for (let i = 0; i < x.length; i++) if (valid[i] && finite(x[i])) { s += x[i]; c++; }
  if (c < 8) return null;
  const m = s / c, y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = finite(x[i]) ? x[i] - m : 0;
  return filtfilt(y, RESP_FS, RESP_LO, RESP_HI);
}

/** Fuse one window's estimates (br/min). Returns { v, votes } with v = NaN when the window is rejected. */
export function fuseRespiration({ rifv, riav, riiv, gyro }) {
  const thirds = [riiv, gyro].filter(finite);
  if (finite(rifv) && finite(riav) && Math.abs(rifv - riav) <= RESP_AGREE) {
    const m = (rifv + riav) / 2;
    return { v: m, votes: 2 + thirds.filter((x) => Math.abs(x - m) <= VOTE_AGREE).length, confirmed: finite(gyro) && Math.abs(gyro - m) <= VOTE_AGREE };
  }
  // Primary pair disagrees: head pitch (an independent modality) close to one of them picks it.
  // RIIV alone cannot rescue a window - on the forehead it often locks to slow vasomotion (6-10 /min).
  let best = null;
  if (finite(gyro)) {
    for (const p of [rifv, riav].filter(finite)) {
      const d = Math.abs(gyro - p);
      if (d <= VOTE_AGREE && (!best || d < best.d)) best = { d, v: (p + gyro) / 2 };
    }
  }
  if (best) return { v: best.v, votes: 2 + (finite(riiv) && Math.abs(riiv - best.v) <= VOTE_AGREE ? 1 : 0), confirmed: true };
  return { v: NaN, votes: 0, confirmed: false };
}

/**
 * Breathing-rate track from beats, IBIs, the slow IR baseline and (optional) head pitch.
 * All times in seconds on the recording axis. valid = Uint8Array on the 4 Hz grid (inside optics data).
 */
export function respirationTrack({ duration, valid, nn, beats, base, gyro }) {
  const n = valid.length;
  const W = RESP_WIN_S * RESP_FS, S = RESP_STEP_S * RESP_FS;
  const src = {
    rifv: nn.t.length > 10 ? prepSource(interpGrid(nn.t, nn.v, 0, RESP_FS, n), valid) : null,
    riav: beats.t.length > 10 ? prepSource(interpGrid(beats.t, beats.amp, 0, RESP_FS, n), valid) : null,
    riiv: base ? prepSource(base, valid) : null,
    gyro: gyro ? prepSource(gyro, valid) : null,
  };
  const peak = makeSpectrum(W, RESP_FS);
  const out = { t: [], v: [], votes: [], rifv: [], riav: [], riiv: [], gyro: [] };
  let confirmed = 0;
  for (let s = 0; s + W <= n; s += S) {
    let ok = 0;
    for (let i = s; i < s + W; i++) ok += valid[i];
    const est = {};
    for (const k of ['rifv', 'riav', 'riiv', 'gyro']) est[k] = src[k] && ok >= RESP_MIN_VALID * W ? peak(src[k], s).f : NaN;
    const r = fuseRespiration(est);
    if (r.confirmed) confirmed++;
    out.t.push((s + W / 2) / RESP_FS);
    out.v.push(r.v); out.votes.push(r.votes);
    for (const k of ['rifv', 'riav', 'riiv', 'gyro']) out[k].push(est[k]);
  }
  const acc = out.v.filter(finite);
  return {
    t: Float64Array.from(out.t), v: Float32Array.from(out.v), votes: Uint8Array.from(out.votes),
    rifv: Float32Array.from(out.rifv), riav: Float32Array.from(out.riav), riiv: Float32Array.from(out.riiv), gyro: Float32Array.from(out.gyro),
    n: out.t.length,
    summary: { median: medianOf(acc), q1: quant(acc, 0.25), q3: quant(acc, 0.75), accepted: acc.length, windows: out.t.length, gyroConfirmed: confirmed, gyro: !!src.gyro },
    duration,
  };
}

/** Median breathing rate of the accepted windows centred in [a, b] */
export function respirationInRange(resp, a = -Infinity, b = Infinity) {
  if (!resp) return null;
  const v = [];
  let windows = 0;
  for (let i = 0; i < resp.n; i++) if (resp.t[i] >= a && resp.t[i] <= b) { windows++; if (finite(resp.v[i])) v.push(resp.v[i]); }
  return { median: medianOf(v), accepted: v.length, windows };
}

/* ---------------- whole recording ---------------- */

/**
 * Full analysis of a recording's optics.
 * @param {{t: Float64Array, n: number, cols: Object<string, Float32Array>}} optics unique optics samples (row time in s)
 * @param {{gyro?: {t: Float64Array, cols: {Gyro_X?: Float32Array}}, duration?: number}} [opts]
 * @returns {object|null} null when there are no usable optics
 */
export function analyzePulse(optics, { gyro = null, duration } = {}) {
  if (!optics?.n || !optics.t) return null;
  const chans = opticsChannels(optics.cols);
  if (chans.some((c) => !c)) return null;
  const T = optics.t;
  const dur = finite(duration) ? duration : T[optics.n - 1];

  // valid samples -> continuous segments
  const segments = [];
  let cur = [];
  for (let i = 0; i < optics.n; i++) {
    if (!chans.every((c) => c[i] > 0 && Number.isFinite(c[i]))) continue;
    if (cur.length && T[i] - T[cur[cur.length - 1]] > SEG_GAP_S) { segments.push(cur); cur = []; }
    cur.push(i);
  }
  if (cur.length) segments.push(cur);
  const segs = segments.filter((s) => T[s[s.length - 1]] - T[s[0]] >= MIN_SEG_S);
  if (!segs.length) return null;
  let samples = 0, covered = 0;
  for (const s of segs) { samples += s.length; covered += T[s[s.length - 1]] - T[s[0]]; }
  const clock = fitSampleClock(T, segs);
  const effFs = samples / covered;
  const indexClock = effFs >= HRV_MIN_FS && finite(clock.fs);

  const beatT = [], beatAmp = [], beatSeg = [];
  const baseT = [], baseV = [];
  const valid = new Uint8Array(Math.floor(dur * RESP_FS) + 1);
  segs.forEach((s, si) => {
    const m = s.length;
    const segFs = indexClock ? clock.fs : m / Math.max(1e-6, T[s[m - 1]] - T[s[0]]);
    const tOf = indexClock ? (k) => clock.origins[si] + k / clock.fs : (k) => T[s[k]];
    const ppg = new Float64Array(m), base = new Float64Array(m);
    for (const c of chans) {
      const x = Float64Array.from(s, (i) => c[i]);
      const lv = movingAverage(x, Math.max(3, Math.round(segFs * LEVEL_S)));
      const bl = movingAverage(x, Math.max(3, Math.round(segFs * BASE_LEVEL_S)));
      for (let k = 0; k < m; k++) { ppg[k] -= x[k] / lv[k] - 1; base[k] -= x[k] / bl[k] - 1; }
    }
    for (let k = 0; k < m; k++) { baseT.push(tOf(k)); baseV.push(base[k]); }
    const t0 = tOf(0), t1 = tOf(m - 1);
    for (let g = Math.ceil(t0 * RESP_FS); g <= Math.floor(t1 * RESP_FS) && g < valid.length; g++) if (g >= 0) valid[g] = 1;
    // pulse on a uniform grid: the index clock itself, or arrival times resampled to 16 Hz
    let x = ppg, F = clock.fs, g0 = t0;
    if (!indexClock) {
      F = ARRIVAL_GRID_FS;
      x = interpGrid(Array.from({ length: m }, (_, k) => T[s[k]]), ppg, t0, F, Math.floor((t1 - t0) * F) + 1);
    }
    const bp = filtfilt(x, F, PPG_LO, PPG_HI);
    const { pos, amp } = detectBeats(bp, F);
    for (let k = 0; k < pos.length; k++) {
      const bt = g0 + pos[k] / F;
      if (bt - t0 < EDGE_S || t1 - bt < EDGE_S) continue;
      beatT.push(bt); beatAmp.push(amp[k]); beatSeg.push(si);
    }
  });

  const ibi = cleanIbis(beatT, beatSeg);
  const nn = { t: [], v: [] };
  for (let k = 0; k < ibi.n; k++) if (ibi.ok[k]) { nn.t.push(ibi.t[k]); nn.v.push(ibi.v[k]); }

  let hrvReason = null;
  let hrvReasonCode = null; // stable code for translated UI: 'coarse' | 'fewBeats'
  if (!indexClock) hrvReason = `optics only ${effFs.toFixed(1)} unique samples/s (needs ≥ ${HRV_MIN_FS}; recorded before the recorder fix) - beat timing too coarse`;
  if (hrvReason) hrvReasonCode = 'coarse';
  const session = hrvMetrics(ibi, -Infinity, Infinity, { lfhf: true });
  if (!hrvReason && session.pairs < HRV_MIN_PAIRS) { hrvReason = 'too few clean beats'; hrvReasonCode = 'fewBeats'; }
  const hrvAvailable = !hrvReason;

  const resp = respirationTrack({
    duration: dur, valid,
    nn, beats: { t: beatT, amp: beatAmp },
    base: baseT.length ? binGrid(baseT, baseV, RESP_FS, valid.length) : null,
    gyro: gyro?.cols?.Gyro_X && gyro.t.length > 20 ? binGrid(gyro.t, gyro.cols.Gyro_X, RESP_FS, valid.length) : null,
  });

  return {
    effFs, clockFs: clock.fs, clockResidualMs: clock.residualMs, timebase: indexClock ? 'sample index' : 'arrival time',
    segments: segs.length, covered, duration: dur, beats: beatT.length,
    ibi,
    hrvAvailable, hrvReason, hrvReasonCode,
    hrv: hrvAvailable ? session : null,
    rmssd: hrvAvailable ? rmssdTrack(ibi, dur) : null,
    resp,
  };
}

/** HRV for a time range of an analyzePulse() result (whole session = the precomputed value incl. LF/HF) */
export function hrvInRange(pulse, a, b) {
  if (!pulse) return null;
  const base = { effFs: pulse.effFs, available: pulse.hrvAvailable, reason: pulse.hrvReason };
  if (!pulse.hrvAvailable) return base;
  const whole = a <= 0.5 && b >= pulse.duration - 0.5;
  const m = whole ? pulse.hrv : hrvMetrics(pulse.ibi, a, b);
  if (m.pairs < HRV_MIN_PAIRS) return { ...base, ...m, rmssd: NaN, sdnn: NaN, pnn50: NaN, note: 'too few clean beats in range' };
  return { ...base, ...m };
}
