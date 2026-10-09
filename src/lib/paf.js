/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Peak alpha frequency (PAF) calibration. Pure functions, no DOM, no React.
// Ported from Muse_Capture&Analysis (mind_monitor_viewer/app.js computePafWindows, hammingWindow,
// fftRadix2, buildPafMetrics) and extended: 1/f whitening, 6-13 Hz search (children ~7-9 Hz),
// prominence gate, alpha reactivity (eyes closed / eyes open) and personal bands (Klimesch).
//
// Input: channels = { TP9: number[], AF7: number[], AF8: number[], TP10: number[] } in µV at 256 Hz
// (or an array of 4 arrays in that order).

import { BANDS } from './signal.js';
import { getActiveProfileId } from './profiles.js';

export const PAF_FS = 256;
export const PAF_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'];
const POSTERIOR = ['TP9', 'TP10'];
export const PAF_SEARCH = [6, 13]; // Hz
const FIT_RANGES = [[2, 4.5], [14, 30]]; // aperiodic (1/f) fit, away from the alpha search band
const MIN_WINDOW_PROMINENCE = 0.1; // log10 units above the 1/f fit (~1 dB)
const MIN_MEAN_PROMINENCE = 0.25; // averaged spectrum must stand ~2.5 dB above 1/f
export const REACTIVITY_MIN = 1.2;
// Artifact rejection per analysis window (blinks, jaw/motion, dropouts)
export const MAX_PTP_UV = 150; // peak-to-peak (after linear detrend) above this = artifact
const MIN_PTP_UV = 1; // below this the channel is flat / zero-filled / disconnected
const RAIL_SHARE = 0.25; // this share of samples stuck at the window min or max = railed

export function hammingWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

export function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// In-place iterative radix-2 FFT (re/im length must be a power of two).
export function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenCos = Math.cos(ang);
    const wlenSin = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wCos = 1;
      let wSin = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vRe = re[b] * wCos - im[b] * wSin;
        const vIm = re[b] * wSin + im[b] * wCos;
        re[b] = re[a] - vRe;
        im[b] = im[a] - vIm;
        re[a] += vRe;
        im[a] += vIm;
        const nc = wCos * wlenCos - wSin * wlenSin;
        wSin = wCos * wlenSin + wSin * wlenCos;
        wCos = nc;
      }
    }
  }
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function normalizeChannels(channels) {
  if (Array.isArray(channels)) {
    const out = {};
    PAF_CHANNELS.forEach((name, i) => { out[name] = channels[i]; });
    return out;
  }
  return channels || {};
}

// Linear regression y = a + b x
function linFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return null;
  const b = (n * sxy - sx * sy) / d;
  return { a: (sy - b * sx) / n, b };
}

// True when a window looks like EEG: finite, not flat/zero-filled, not railed, peak-to-peak <= MAX_PTP_UV.
export function windowIsClean(sig, start, n) {
  let min = Infinity, max = -Infinity, sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const v = sig[start + i];
    if (!Number.isFinite(v)) return false;
    if (v < min) min = v;
    if (v > max) max = v;
    sx += i; sy += v; sxy += i * v; sxx += i * i;
  }
  if (max - min < MIN_PTP_UV) return false; // flat / zero-filled
  // railed: a large share of samples sitting exactly at the extreme (clipped ADC)
  let atMin = 0, atMax = 0;
  for (let i = 0; i < n; i++) { const v = sig[start + i]; if (v === min) atMin++; else if (v === max) atMax++; }
  if (atMin > RAIL_SHARE * n || atMax > RAIL_SHARE * n) return false;
  // peak-to-peak after removing the linear drift (raw Muse has slow DC wander)
  const den = n * sxx - sx * sx;
  const b = den ? (n * sxy - sx * sy) / den : 0;
  const a = (sy - b * sx) / n;
  let dMin = Infinity, dMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = sig[start + i] - (a + b * i);
    if (r < dMin) dMin = r;
    if (r > dMax) dMax = r;
  }
  return dMax - dMin <= MAX_PTP_UV;
}

// Spectrum of one channel: Hamming-windowed, zero-padded FFT per window; windows with artifacts are
// dropped and the per-bin MEDIAN over the remaining windows is the reference spectrum (robust to what
// slips through). `mean` is kept as the field name used by callers and holds that median.
// Returns null if the signal is too short or no clean window is left.
export function channelSpectrum(signal, fs = PAF_FS, opts = {}) {
  const windowS = opts.windowS || 4;
  const stepS = opts.stepS || 1;
  const padFactor = opts.padFactor || 4;
  const nWin = Math.max(8, Math.round(windowS * fs));
  const nStep = Math.max(1, Math.round(stepS * fs));
  if (!signal || signal.length < nWin) return null;
  const nfft = nextPow2(nWin * padFactor);
  const win = hammingWindow(nWin);
  const df = fs / nfft;
  const kLo = Math.max(1, Math.floor(1.5 / df));
  const kHi = Math.min(nfft / 2, Math.ceil(32 / df));
  const nBins = kHi - kLo + 1;
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const spectra = []; // linear power per window, bins kLo..kHi
  let rejected = 0;
  for (let s = 0; s + nWin <= signal.length; s += nStep) {
    if (!windowIsClean(signal, s, nWin)) { rejected++; continue; }
    let mean = 0;
    for (let i = 0; i < nWin; i++) mean += signal[s + i];
    mean /= nWin;
    re.fill(0); im.fill(0);
    for (let i = 0; i < nWin; i++) re[i] = (signal[s + i] - mean) * win[i];
    fftRadix2(re, im);
    const p = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) {
      const kk = kLo + k;
      p[k] = (re[kk] * re[kk] + im[kk] * im[kk]) / nfft;
    }
    spectra.push(p);
  }
  if (!spectra.length) return null;
  const mean = new Float64Array(nBins); // per-bin median across clean windows
  const col = new Float64Array(spectra.length);
  const mid = spectra.length >> 1;
  for (let k = 0; k < nBins; k++) {
    for (let w = 0; w < spectra.length; w++) col[w] = spectra[w][k];
    col.sort();
    mean[k] = spectra.length % 2 ? col[mid] : 0.5 * (col[mid - 1] + col[mid]);
  }
  const freqs = new Float64Array(nBins);
  for (let k = 0; k < nBins; k++) freqs[k] = (kLo + k) * df;
  return { freqs, mean, spectra, df, rejected };
}

// 1/f fit on the averaged spectrum (log10 power vs log10 f) outside the alpha search band.
function aperiodicFit(spec) {
  const xs = [], ys = [];
  for (let k = 0; k < spec.freqs.length; k++) {
    const f = spec.freqs[k];
    if (FIT_RANGES.some(([lo, hi]) => f >= lo && f <= hi) && spec.mean[k] > 0) {
      xs.push(Math.log10(f)); ys.push(Math.log10(spec.mean[k]));
    }
  }
  return linFit(xs, ys);
}

// Peak (interior local maximum, parabolic interpolation) of a residual curve within [lo, hi].
function findPeak(freqs, resid, lo, hi, df) {
  let best = -1, bestVal = -Infinity;
  for (let k = 1; k < freqs.length - 1; k++) {
    const f = freqs[k];
    if (f < lo || f > hi) continue;
    if (resid[k] > bestVal && resid[k] >= resid[k - 1] && resid[k] >= resid[k + 1]) { bestVal = resid[k]; best = k; }
  }
  if (best < 0) return null;
  const y0 = resid[best - 1], y1 = resid[best], y2 = resid[best + 1];
  const den = y0 - 2 * y1 + y2;
  const shift = Math.abs(den) > 1e-12 ? 0.5 * (y0 - y2) / den : 0;
  return { freq: freqs[best] + Math.max(-1, Math.min(1, shift)) * df, prominence: bestVal };
}

// Per-channel PAF: median of per-window peaks + prominence of the averaged spectrum.
export function channelPaf(signal, fs = PAF_FS, opts = {}) {
  const spec = channelSpectrum(signal, fs, opts);
  if (!spec) return null;
  const fit = aperiodicFit(spec);
  if (!fit) return null;
  const n = spec.freqs.length;
  const lf = Array.from(spec.freqs, (f) => Math.log10(f));
  const base = lf.map((x) => fit.a + fit.b * x);
  const [lo, hi] = opts.search || PAF_SEARCH;
  const meanResid = new Float64Array(n);
  for (let k = 0; k < n; k++) meanResid[k] = Math.log10(Math.max(spec.mean[k], 1e-30)) - base[k];
  const meanPeak = findPeak(spec.freqs, meanResid, lo, hi, spec.df);
  const peaks = [];
  const resid = new Float64Array(n);
  for (const p of spec.spectra) {
    for (let k = 0; k < n; k++) resid[k] = Math.log10(Math.max(p[k], 1e-30)) - base[k];
    const pk = findPeak(spec.freqs, resid, lo, hi, spec.df);
    if (pk && pk.prominence >= MIN_WINDOW_PROMINENCE) peaks.push(pk.freq);
  }
  return { spec, peaks, nWindows: spec.spectra.length, meanPeak };
}

// Robust PAF from the eyes-closed (or any resting) recording.
// Returns { found, paf, confidence, prominenceDb, source, channelPaf, nWindows } - paf is null when no clear peak.
export function computePaf(channelsIn, fs = PAF_FS, opts = {}) {
  const channels = normalizeChannels(channelsIn);
  const per = {};
  for (const name of PAF_CHANNELS) per[name] = channels[name] ? channelPaf(channels[name], fs, opts) : null;

  const attempt = (names, source) => {
    const peaks = [];
    let nWindows = 0;
    const promin = [];
    const chPaf = {};
    for (const name of names) {
      const r = per[name];
      if (!r) continue;
      peaks.push(...r.peaks);
      nWindows += r.nWindows;
      if (r.meanPeak) promin.push(r.meanPeak.prominence);
      chPaf[name] = r.peaks.length ? median(r.peaks) : null;
    }
    if (!nWindows || peaks.length < 8) return null;
    const paf = median(peaks);
    const near = peaks.filter((f) => Math.abs(f - paf) <= 0.75).length;
    const confidence = near / nWindows; // share of all windows agreeing on the peak
    const prominence = promin.length ? promin.reduce((a, b) => a + b, 0) / promin.length : 0;
    if (confidence < 0.45 || prominence < MIN_MEAN_PROMINENCE) return null;
    // Refine with the interior-peak median of agreeing windows only
    const refined = median(peaks.filter((f) => Math.abs(f - paf) <= 0.75));
    return { found: true, paf: refined, confidence, prominenceDb: prominence * 10, source, channelPaf: chPaf, nWindows };
  };

  return attempt(POSTERIOR, 'posterior')
    || attempt(PAF_CHANNELS, 'all')
    || { found: false, paf: null, confidence: 0, prominenceDb: 0, source: null, channelPaf: {}, nWindows: per.TP9?.nWindows || per.AF7?.nWindows || 0 };
}

// Mean linear power in [lo, hi] Hz of the averaged spectra of the given channels (posterior by default).
export function alphaPower(channelsIn, fs = PAF_FS, lo = 8, hi = 13, names = POSTERIOR) {
  const channels = normalizeChannels(channelsIn);
  const vals = [];
  for (const name of names) {
    const spec = channels[name] ? channelSpectrum(channels[name], fs) : null;
    if (!spec) continue;
    let sum = 0, cnt = 0;
    for (let k = 0; k < spec.freqs.length; k++) {
      if (spec.freqs[k] >= lo && spec.freqs[k] <= hi) { sum += spec.mean[k]; cnt++; }
    }
    if (cnt) vals.push(sum / cnt);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
}

// Eyes-closed alpha / eyes-open alpha around the PAF (PAF-1..PAF+1; 8-13 Hz if no PAF).
export function alphaReactivity(closed, open, paf, fs = PAF_FS) {
  const lo = Number.isFinite(paf) ? paf - 1 : 8;
  const hi = Number.isFinite(paf) ? paf + 1 : 13;
  const c = alphaPower(closed, fs, lo, hi);
  const o = alphaPower(open, fs, lo, hi);
  if (!(c > 0) || !(o > 0)) return null;
  return c / o;
}

export function fitLooksPoor(reactivity) {
  return reactivity != null && reactivity < REACTIVITY_MIN;
}

// Klimesch personal bands. Falls back to the standard bands when paf is not a number.
// alpha = PAF-2..PAF+2, theta = PAF-6..PAF-2 (clamped so children's ~7-9 Hz PAF stays sensible).
export function personalBands(paf) {
  if (!Number.isFinite(paf)) return { ...BANDS };
  const aLo = Math.max(5, paf - 2);
  const aHi = Math.min(14, paf + 2);
  const tLo = Math.max(3, Math.min(paf - 6, aLo - 1));
  return {
    delta: [BANDS.delta[0], Math.min(BANDS.delta[1], tLo)],
    theta: [tLo, aLo],
    alpha: [aLo, aHi],
    beta: [Math.max(BANDS.beta[0], aHi), BANDS.beta[1]],
    gamma: [...BANDS.gamma],
  };
}

// Full calibration from the two phases. closed/open: channel dicts (µV).
export function calibrate(closed, open, fs = PAF_FS) {
  const r = computePaf(closed, fs);
  const paf = r.found ? r.paf : null;
  const reactivity = open ? alphaReactivity(closed, open, paf, fs) : null;
  return { ...r, reactivity, fitWarning: fitLooksPoor(reactivity), bands: personalBands(paf) };
}

// Persistence of the last calibration (contract with session history).
// localStorage "brainarcade.paf" = {byChild: {[childId]: {paf, alphaReactivity, bands:{theta,alpha}, posterior, date, device?, childId}}}
// (the old flat object is migrated to the active child on first read).
export const PAF_STORE_KEY = 'brainarcade.paf';
function readPafStore() {
  try {
    const o = JSON.parse(localStorage.getItem(PAF_STORE_KEY) || 'null');
    if (!o || typeof o !== 'object') return { byChild: {} };
    if (o.byChild && typeof o.byChild === 'object') return { byChild: o.byChild };
    const store = { byChild: { [getActiveProfileId()]: { ...o, childId: getActiveProfileId() } } };
    try { localStorage.setItem(PAF_STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
    return store;
  } catch { return { byChild: {} }; }
}
export function loadCalibration() {
  const c = readPafStore().byChild[getActiveProfileId()];
  return c && typeof c === 'object' ? c : null;
}
export function saveCalibration(obj) {
  const childId = getActiveProfileId();
  const store = readPafStore();
  store.byChild[childId] = { ...obj, childId, date: obj?.date || new Date().toISOString() };
  try { localStorage.setItem(PAF_STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}
