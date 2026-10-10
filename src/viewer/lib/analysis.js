/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Offline analysis of a parsed recording (see csvParse.js). Pure, no DOM: runs in viewer/csvWorker.js
// and in node tests. Reuses lib/paf.js (FFT, artifact gate, whitened PAF), lib/signal.js (band edges)
// and lib/fnirs.js (HbO/HbR). lib/signal.js computeWelchPSD is not used for the spectrogram: it is an
// O(N^2) DFT over the last 3 segments only (meant for live 2 s windows), too slow for a whole session.
import { fftRadix2, nextPow2, hammingWindow, windowIsClean, channelPaf, computePaf, PAF_SEARCH, MAX_PTP_UV } from '../../lib/paf.js';
import { BANDS } from '../../lib/signal.js';
import { FnirsProcessor, OPTICS_FS } from '../../lib/fnirs.js';
import { SENSORS, BAND_NAMES } from './csvParse.js';
import { heldShare, rangeStats, median } from './series.js';

export { PAF_SEARCH, MAX_PTP_UV };
export const ALPHA_ZONES = { slow: [8, 9.5], fast: [11, 13] }; // PeakAlphaAnalyzer zones
export const SPEC_MAX_HZ = 45;
export const MOVE_ACC_STD_G = 0.05; // acc magnitude std within 1 s above this = moving
export const MOVE_GYRO_DPS = 15; // mean gyro magnitude within 1 s above this = moving
const LN10 = Math.LN10;
const MIN_DSP_FS = 100; // raw rows slower than this (Mind Monitor "constant" 1 Hz export) are not spectral-analysed

/* ---------------- raw EEG ---------------- */

/** Copies of the RAW channels with NaN at gap starts and while HeadBandOn = 0 (windows crossing them are rejected). */
export function dspChannels(rec) {
  const raw = rec.groups.raw;
  if (!raw) return null;
  const n = raw.n;
  const thr = rec.meta.gapThreshold;
  const out = SENSORS.map((s) => (raw.cols[`RAW_${s}`] ? Float32Array.from(raw.cols[`RAW_${s}`]) : null));
  for (let i = 1; i < n; i++) {
    if (raw.t[i] - raw.t[i - 1] > thr) for (const c of out) if (c) c[i] = NaN;
  }
  const hsi = rec.groups.hsi;
  const on = hsi?.cols.HeadBandOn;
  if (on) {
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j + 1 < hsi.n && hsi.t[j + 1] <= raw.t[i]) j++;
      if (on[j] === 0) for (const c of out) if (c) c[i] = NaN;
    }
  }
  return out;
}

// RBJ biquad, direct form II transposed, in place over buf
function biquadCoefs(type, f0, fs, q) {
  const w = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  const b = type === 'hp' ? [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2] : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
  return { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: (-2 * cw) / a0, a2: (1 - al) / a0 };
}
function runBiquad(c, buf, reverse) {
  let z1 = 0, z2 = 0;
  const n = buf.length;
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k;
    const x = buf[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    buf[i] = y;
  }
}

/**
 * Zero-phase band-pass (2nd-order Butterworth high-pass + low-pass, run forward and backward = 4th order
 * magnitude, no phase shift; like filtfilt in muse_capture analyze_session). Each run of finite samples is
 * filtered separately; NaN stays NaN.
 */
export function bandpassZeroPhase(sig, fs, lo = 1, hi = 45) {
  const out = new Float32Array(sig.length).fill(NaN);
  if (!(fs > 10)) return out;
  const hp = biquadCoefs('hp', lo, fs, Math.SQRT1_2);
  const lp = biquadCoefs('lp', Math.min(hi, fs * 0.45), fs, Math.SQRT1_2);
  let a = 0;
  const n = sig.length;
  while (a < n) {
    while (a < n && !(sig[a] === sig[a])) a++;
    let b = a;
    while (b < n && sig[b] === sig[b]) b++;
    if (b - a >= 8) {
      const buf = new Float64Array(b - a);
      const m = Math.min(buf.length, Math.round(fs));
      let mean = 0;
      for (let i = 0; i < m; i++) mean += sig[a + i];
      mean /= m;
      for (let i = 0; i < buf.length; i++) buf[i] = sig[a + i] - mean;
      runBiquad(hp, buf, false); runBiquad(lp, buf, false);
      runBiquad(hp, buf, true); runBiquad(lp, buf, true);
      for (let i = 0; i < buf.length; i++) out[a + i] = buf[i];
    }
    a = b;
  }
  return out;
}

/** Per-second artifact flags per channel (paf.js windowIsClean: not finite / flat / railed / > MAX_PTP_UV p-p). */
export function artifactSeries(dsp, t, fs) {
  const N = Math.max(1, Math.round(fs));
  const n = t.length;
  const nw = Math.floor(n / N);
  const tt = new Float64Array(nw);
  const ch = SENSORS.map(() => new Float32Array(nw));
  const any = new Float32Array(nw);
  for (let w = 0; w < nw; w++) {
    const s = w * N;
    tt[w] = t[s];
    let bad = 0;
    for (let c = 0; c < 4; c++) {
      const sig = dsp[c];
      const ok = sig ? windowIsClean(sig, s, N) : false;
      ch[c][w] = ok ? 0 : 1;
      if (!ok) bad = 1;
    }
    any[w] = bad;
  }
  return { t: tt, n: nw, cols: Object.fromEntries([...SENSORS.map((s, c) => [s, ch[c]]), ['any', any]]) };
}

/**
 * Spectrogram: 2 s Hann windows, 1 s step, PSD in µV²/Hz (one-sided) from the filtered signal, bins up to
 * SPEC_MAX_HZ. Frames whose raw window fails windowIsClean are flagged. Also TP9-TP10 alpha coherence
 * (magnitude-squared, 8-13 Hz mean) over a sliding 10-frame (~10 s) Welch average of clean frames.
 */
export function spectrogram(filtered, dsp, t, fs, onProgress) {
  const nWin = Math.round(2 * fs);
  const step = Math.max(1, Math.round(fs));
  const nfft = nextPow2(nWin);
  const df = fs / nfft;
  const kHi = Math.min(nfft / 2, Math.floor(SPEC_MAX_HZ / df));
  const nBins = kHi; // bins 1..kHi
  const n = t.length;
  const frames = n >= nWin ? Math.floor((n - nWin) / step) + 1 : 0;
  const ft = new Float64Array(frames);
  const pw = SENSORS.map(() => new Float32Array(frames * nBins));
  const clean = SENSORS.map(() => new Uint8Array(frames));
  const win = new Float64Array(nWin);
  let wss = 0;
  for (let i = 0; i < nWin; i++) { win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nWin - 1))); wss += win[i] * win[i]; }
  const scale = 2 / (fs * wss);
  const aLo = Math.ceil(8 / df), aHi = Math.floor(13 / df);
  const nA = Math.max(0, aHi - aLo + 1);
  const cxr = new Float32Array(frames * nA), cxi = new Float32Array(frames * nA);
  const cxx = new Float32Array(frames * nA), cyy = new Float32Array(frames * nA);
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const keepRe = [new Float64Array(nA), new Float64Array(nA)];
  const keepIm = [new Float64Array(nA), new Float64Array(nA)];
  for (let f = 0; f < frames; f++) {
    const s = f * step;
    ft[f] = t[s + (nWin >> 1)];
    for (let c = 0; c < 4; c++) {
      const sig = filtered[c];
      if (!sig || !dsp[c] || !windowIsClean(dsp[c], s, nWin)) {
        for (let k = 0; k < nBins; k++) pw[c][f * nBins + k] = NaN;
        continue;
      }
      clean[c][f] = 1;
      let mean = 0;
      for (let i = 0; i < nWin; i++) mean += sig[s + i];
      mean /= nWin;
      re.fill(0); im.fill(0);
      for (let i = 0; i < nWin; i++) re[i] = (sig[s + i] - mean) * win[i];
      fftRadix2(re, im);
      for (let k = 0; k < nBins; k++) {
        const kk = k + 1;
        pw[c][f * nBins + k] = (re[kk] * re[kk] + im[kk] * im[kk]) * scale;
      }
      const side = c === 0 ? 0 : c === 3 ? 1 : -1;
      if (side >= 0) for (let k = 0; k < nA; k++) { keepRe[side][k] = re[aLo + k]; keepIm[side][k] = im[aLo + k]; }
    }
    if (clean[0][f] && clean[3][f]) {
      for (let k = 0; k < nA; k++) {
        const xr = keepRe[0][k], xi = keepIm[0][k], yr = keepRe[1][k], yi = keepIm[1][k];
        cxr[f * nA + k] = xr * yr + xi * yi; // X * conj(Y)
        cxi[f * nA + k] = xi * yr - xr * yi;
        cxx[f * nA + k] = xr * xr + xi * xi;
        cyy[f * nA + k] = yr * yr + yi * yi;
      }
    }
    if (onProgress && f % 200 === 0) onProgress(f / Math.max(1, frames));
  }
  // coherence over a centred 10-frame window
  const coh = new Float32Array(frames).fill(NaN);
  const H = 5;
  for (let f = 0; f < frames; f++) {
    let used = 0;
    let acc = 0;
    const sr = new Float64Array(nA), si = new Float64Array(nA), sx = new Float64Array(nA), sy = new Float64Array(nA);
    for (let g = Math.max(0, f - H); g < Math.min(frames, f + H); g++) {
      if (!(clean[0][g] && clean[3][g])) continue;
      used++;
      for (let k = 0; k < nA; k++) { sr[k] += cxr[g * nA + k]; si[k] += cxi[g * nA + k]; sx[k] += cxx[g * nA + k]; sy[k] += cyy[g * nA + k]; }
    }
    if (used < 5) continue;
    for (let k = 0; k < nA; k++) acc += (sr[k] * sr[k] + si[k] * si[k]) / Math.max(1e-30, sx[k] * sy[k]);
    coh[f] = acc / nA;
  }
  return {
    t: ft, n: frames, df, nBins, fLo: df,
    power: Object.fromEntries(SENSORS.map((s, c) => [s, pw[c]])),
    clean: Object.fromEntries(SENSORS.map((s, c) => [s, clean[c]])),
    coherence: { t: ft, n: frames, cols: { coherence: coh } },
  };
}

/** Mean PSD per channel over clean frames with t in [a, b] -> { freqs, ch: { TP9: Float64Array }, frames } */
export function rangePsd(spec, a, b) {
  if (!spec || !spec.n) return null;
  const freqs = Float64Array.from({ length: spec.nBins }, (_, k) => (k + 1) * spec.df);
  const ch = {};
  let frames = 0;
  for (const s of SENSORS) {
    const acc = new Float64Array(spec.nBins);
    let cnt = 0;
    for (let f = 0; f < spec.n; f++) {
      if (spec.t[f] < a || spec.t[f] > b || !spec.clean[s][f]) continue;
      cnt++;
      for (let k = 0; k < spec.nBins; k++) acc[k] += spec.power[s][f * spec.nBins + k];
    }
    if (cnt) { for (let k = 0; k < spec.nBins; k++) acc[k] /= cnt; ch[s] = acc; }
    frames = Math.max(frames, cnt);
  }
  return { freqs, ch, frames };
}

/** Band columns (Bels) from the spectrogram, for files without Delta_TP9... (log10 of band power in µV²). */
export function bandsFromSpectrogram(spec) {
  const cols = {};
  const edges = Object.entries(BANDS);
  BAND_NAMES.forEach((b, bi) => {
    const [lo, hi] = edges[bi][1];
    for (const s of SENSORS) {
      const y = new Float32Array(spec.n);
      for (let f = 0; f < spec.n; f++) {
        let sum = 0;
        for (let k = 0; k < spec.nBins; k++) {
          const fr = (k + 1) * spec.df;
          if (fr >= lo && fr < hi) sum += spec.power[s][f * spec.nBins + k] * spec.df;
        }
        y[f] = spec.clean[s][f] && sum > 0 ? Math.log10(sum) : NaN;
      }
      cols[`${b}_${s}`] = y;
    }
  });
  return { t: spec.t, n: spec.n, cols, derived: true };
}

/* ---------------- band powers ---------------- */

/**
 * From the absolute band columns (Bels): per-sensor relative power, sensor means and ratios.
 * Mean absolute = arithmetic mean of Bels (= geometric mean of power); mean relative = summed linear
 * power over sensors, normalised. FAA = ln(alpha AF8) - ln(alpha AF7).
 */
export function bandDerived(bands) {
  const n = bands.n;
  const c = bands.cols;
  const abs = {}, rel = {}, ratio = {};
  const lin = (b, s, i) => { const v = c[`${b}_${s}`]?.[i]; return v === v && v !== undefined ? 10 ** v : NaN; };
  for (const b of BAND_NAMES) {
    abs[`${b}_mean`] = new Float32Array(n);
    rel[`${b}_mean`] = new Float32Array(n);
    for (const s of SENSORS) rel[`${b}_${s}`] = new Float32Array(n);
  }
  for (const k of ['faa', 'thetaBeta', 'thetaAlpha', 'focus', 'alphaRel']) ratio[k] = new Float32Array(n);
  const L = new Float64Array(5);
  for (let i = 0; i < n; i++) {
    const sumB = new Float64Array(5);
    let total = 0, nsOk = 0;
    for (const s of SENSORS) {
      let tot = 0, ok = true;
      for (let k = 0; k < 5; k++) { L[k] = lin(BAND_NAMES[k], s, i); if (!(L[k] === L[k])) ok = false; tot += L[k]; }
      for (let k = 0; k < 5; k++) rel[`${BAND_NAMES[k]}_${s}`][i] = ok && tot > 0 ? L[k] / tot : NaN;
      if (ok) { nsOk++; total += tot; for (let k = 0; k < 5; k++) sumB[k] += L[k]; }
    }
    for (let k = 0; k < 5; k++) {
      const b = BAND_NAMES[k];
      let s = 0, cnt = 0;
      for (const sn of SENSORS) { const v = c[`${b}_${sn}`]?.[i]; if (v === v && v !== undefined) { s += v; cnt++; } }
      abs[`${b}_mean`][i] = cnt ? s / cnt : NaN;
      rel[`${b}_mean`][i] = nsOk && total > 0 ? sumB[k] / total : NaN;
    }
    const [, th, al, be] = nsOk ? sumB : [NaN, NaN, NaN, NaN];
    const a7 = c.Alpha_AF7?.[i], a8 = c.Alpha_AF8?.[i];
    ratio.faa[i] = a7 === a7 && a8 === a8 && a7 !== undefined && a8 !== undefined ? (a8 - a7) * LN10 : NaN;
    ratio.thetaBeta[i] = nsOk && be > 0 ? th / be : NaN;
    ratio.thetaAlpha[i] = nsOk && al > 0 ? th / al : NaN;
    ratio.focus[i] = nsOk && th + al > 0 ? be / (th + al) : NaN;
    ratio.alphaRel[i] = rel.Alpha_mean[i];
  }
  return {
    abs: { t: bands.t, n, cols: abs },
    rel: { t: bands.t, n, cols: rel },
    ratios: { t: bands.t, n, cols: ratio },
  };
}

/* ---------------- PAF ---------------- */

/** Whitened PAF per 4 s window (step 2 s), per channel, via paf.js channelPaf (6-13 Hz, 1/f removed, artifact gate). */
export function pafSeries(dsp, t, fs, onProgress, windowS = 4, stepS = 2) {
  const nWin = Math.round(windowS * fs);
  const step = Math.max(1, Math.round(stepS * fs));
  const n = t.length;
  const nw = n >= nWin ? Math.floor((n - nWin) / step) + 1 : 0;
  const tt = new Float64Array(nw);
  const cols = Object.fromEntries(SENSORS.map((s) => [s, new Float32Array(nw).fill(NaN)]));
  for (let w = 0; w < nw; w++) {
    const s = w * step;
    tt[w] = t[s + (nWin >> 1)];
    SENSORS.forEach((name, c) => {
      if (!dsp[c]) return;
      const r = channelPaf(dsp[c].subarray(s, s + nWin), fs, { windowS: nWin / fs, stepS: nWin / fs });
      if (r && r.peaks.length) cols[name][w] = r.peaks[0];
    });
    if (onProgress && w % 50 === 0) onProgress(w / Math.max(1, nw));
  }
  return { t: tt, n: nw, cols, method: 'whitened', range: PAF_SEARCH };
}

/**
 * The old viewer's PAF (app.js computePafWindows): Hamming window, zero-pad, argmax of |X|²/nfft in
 * 7.5-12.5 Hz. Kept for comparison; unlike the original, windows failing windowIsClean are skipped.
 * Returns frequency and peak power (dB, relative units).
 */
export function classicPafSeries(dsp, t, fs, { windowS = 1, stepS = 0.1, pad = 4, lo = 7.5, hi = 12.5 } = {}, onProgress) {
  const nWin = Math.max(8, Math.round(windowS * fs));
  const step = Math.max(1, Math.round(stepS * fs));
  const nfft = nextPow2(nWin * pad);
  const win = hammingWindow(nWin);
  const kLo = Math.max(1, Math.ceil((lo * nfft) / fs));
  const kHi = Math.min(nfft / 2 - 1, Math.floor((hi * nfft) / fs));
  const n = t.length;
  const nw = n >= nWin ? Math.floor((n - nWin) / step) + 1 : 0;
  const tt = new Float64Array(nw);
  const cols = {};
  for (const s of SENSORS) { cols[s] = new Float32Array(nw).fill(NaN); cols[`${s}_db`] = new Float32Array(nw).fill(NaN); }
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let w = 0; w < nw; w++) {
    const s = w * step;
    tt[w] = t[s + (nWin >> 1)];
    for (let c = 0; c < 4; c++) {
      const sig = dsp[c];
      if (!sig || !windowIsClean(sig, s, nWin)) continue;
      re.fill(0); im.fill(0);
      for (let i = 0; i < nWin; i++) re[i] = sig[s + i] * win[i];
      fftRadix2(re, im);
      let best = -1, bp = -Infinity;
      for (let k = kLo; k <= kHi; k++) { const p = (re[k] * re[k] + im[k] * im[k]) / nfft; if (p > bp) { bp = p; best = k; } }
      if (best > 0) { cols[SENSORS[c]][w] = (best * fs) / nfft; cols[`${SENSORS[c]}_db`][w] = 10 * Math.log10(bp + 1e-12); }
    }
    if (onProgress && w % 500 === 0) onProgress(w / Math.max(1, nw));
  }
  return { t: tt, n: nw, cols, method: `classic ${windowS}s/${stepS}s x${pad}`, range: [lo, hi] };
}

/** Session PAF via paf.js computePaf (window step widened on long files to bound memory). */
export function overallPaf(dsp, fs, duration) {
  const ch = {};
  SENSORS.forEach((s, c) => { if (dsp[c]) ch[s] = dsp[c]; });
  const stepS = Math.max(1, duration / 1200);
  const r = computePaf(ch, fs, { stepS });
  return r;
}

/** Metrics like the old viewer (buildPafMetrics) from a PAF series within [a, b]. */
export function pafMetrics(series, a = -Infinity, b = Infinity) {
  if (!series) return null;
  const post = [], front = [];
  for (let i = 0; i < series.n; i++) {
    if (series.t[i] < a || series.t[i] > b) continue;
    for (const s of ['TP9', 'TP10']) { const v = series.cols[s][i]; if (v === v) post.push(v); }
    for (const s of ['AF7', 'AF8']) { const v = series.cols[s][i]; if (v === v) front.push(v); }
  }
  const mean = (x) => (x.length ? x.reduce((p, q) => p + q, 0) / x.length : NaN);
  const m = mean(post);
  const std = post.length > 1 ? Math.sqrt(post.reduce((p, v) => p + (v - m) ** 2, 0) / (post.length - 1)) : NaN;
  return { posteriorMean: m, posteriorStd: std, posteriorMedian: median(post), frontalMean: mean(front), globalMean: mean([...post, ...front]), nPosterior: post.length, nFrontal: front.length };
}

/* ---------------- fNIRS ---------------- */

export const FNIRS_QUALITY = ['good', 'calibrating', 'motion', 'no-light', 'saturated'];

/** Replay the optics rows through lib/fnirs.js FnirsProcessor (baseline = first ~35 s after baselineAt). 4 Hz output. */
export function fnirsReplay(optics, baselineAt = -Infinity) {
  if (!optics) return null;
  const names = Object.keys(optics.cols).sort((a, b) => +a.slice(6) - +b.slice(6));
  const k = names.length >= 8 ? 8 : names.length >= 4 ? 4 : 0;
  if (!k) return null;
  const src = names.slice(0, k).map((nm) => optics.cols[nm]);
  const p = new FnirsProcessor({ fs: OPTICS_FS });
  const T = [], LO = [], LR = [], RO = [], RR = [], LQ = [], RQ = [];
  let next = -Infinity;
  let first = NaN, ready = NaN;
  const sample = new Array(k);
  for (let i = 0; i < optics.n; i++) {
    const t = optics.t[i];
    if (t < baselineAt) continue;
    let ok = true;
    for (let c = 0; c < k; c++) { sample[c] = src[c][i]; if (!(sample[c] === sample[c])) ok = false; }
    if (!ok) continue;
    if (!(first === first)) first = t;
    p.push(sample, t * 1000);
    if (t < next) continue;
    next = t + 0.25;
    const { left, right } = p.current;
    const r = p.baselineReady;
    if (r && !(ready === ready)) ready = t;
    T.push(t);
    LO.push(r ? left.hbo : NaN); LR.push(r ? left.hbr : NaN);
    RO.push(r ? right.hbo : NaN); RR.push(r ? right.hbr : NaN);
    LQ.push(Math.max(0, FNIRS_QUALITY.indexOf(left.quality)));
    RQ.push(Math.max(0, FNIRS_QUALITY.indexOf(right.quality)));
  }
  if (!T.length) return null;
  return {
    t: Float64Array.from(T), n: T.length, channels: k, baselineFrom: first, baselineReadyAt: ready,
    cols: {
      hboL: Float32Array.from(LO), hbrL: Float32Array.from(LR), hboR: Float32Array.from(RO), hbrR: Float32Array.from(RR),
      qualL: Float32Array.from(LQ), qualR: Float32Array.from(RQ),
    },
  };
}

/* ---------------- motion ---------------- */

/** Per-second accelerometer magnitude std (g), mean gyro magnitude (deg/s) and a moving flag. */
export function motionSeries(acc, gyro, duration) {
  if (!acc && !gyro) return null;
  const nw = Math.max(1, Math.ceil(duration));
  const tt = Float64Array.from({ length: nw }, (_, i) => i);
  const accStd = new Float32Array(nw).fill(NaN);
  const gyroMag = new Float32Array(nw).fill(NaN);
  const moving = new Float32Array(nw).fill(NaN);
  const bin = (g, fn) => {
    if (!g) return;
    const [x, y, z] = Object.values(g.cols);
    if (!x || !y || !z) return;
    let i = 0;
    for (let w = 0; w < nw; w++) {
      const vals = [];
      while (i < g.n && g.t[i] < w + 1) {
        const m = Math.hypot(x[i], y[i], z[i]);
        if (m === m) vals.push(m);
        i++;
      }
      if (vals.length) fn(w, vals);
    }
  };
  bin(acc, (w, v) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    accStd[w] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  });
  bin(gyro, (w, v) => { gyroMag[w] = v.reduce((a, b) => a + b, 0) / v.length; });
  for (let w = 0; w < nw; w++) {
    const a = accStd[w], g = gyroMag[w];
    if (a === a || g === g) moving[w] = (a === a && a > MOVE_ACC_STD_G) || (g === g && g > MOVE_GYRO_DPS) ? 1 : 0;
  }
  return { t: tt, n: nw, cols: { accStd, gyroMag, moving } };
}

/* ---------------- summary ---------------- */

/** Heart-rate series: Heart_Rate column (0 / empty = no pulse), else the optics estimate (HR-FALLBACK-HOOK, lib/hrFallback.js) */
export function heartSeries(rec, ana) {
  const g = rec.groups.hr;
  if (g?.cols.Heart_Rate) return { t: g.t, y: g.cols.Heart_Rate.map((v) => (v > 0 ? v : NaN)), estimated: false };
  if (ana?.hrEstimate) return { t: ana.hrEstimate.t, y: ana.hrEstimate.v, estimated: true };
  return null;
}

const shareOf = (g, col, pred, a, b) => (g?.cols[col] ? heldShare(g.t, g.cols[col], pred, a, b) : NaN);
const meanIn = (g, col, a, b) => (g?.cols[col] ? rangeStats(g.t, g.cols[col], a, b).mean : NaN);

/** Session / range summary (main thread; cheap). ana may be partial while the worker is still busy. */
export function computeSummary(rec, ana, a = 0, b = rec.meta.duration) {
  const g = rec.groups;
  const hsi = g.hsi;
  const out = {
    range: [a, b],
    duration: b - a,
    headbandOn: shareOf(hsi, 'HeadBandOn', (v) => v >= 1, a, b),
    hsiGood: Object.fromEntries(SENSORS.map((s) => [s, shareOf(hsi, `HSI_${s}`, (v) => v <= 1, a, b)])),
    bandsAbs: {}, bandsRel: {},
  };
  if (ana?.bandAbs) for (const bn of BAND_NAMES) {
    out.bandsAbs[bn] = meanIn(ana.bandAbs, `${bn}_mean`, a, b);
    out.bandsRel[bn] = meanIn(ana.bandRel, `${bn}_mean`, a, b);
  }
  if (ana?.ratios) {
    out.faa = meanIn(ana.ratios, 'faa', a, b);
    out.thetaBeta = meanIn(ana.ratios, 'thetaBeta', a, b);
    out.thetaAlpha = meanIn(ana.ratios, 'thetaAlpha', a, b);
    out.focus = meanIn(ana.ratios, 'focus', a, b);
  }
  const hr = heartSeries(rec, ana || {});
  if (hr) out.hr = { ...rangeStats(hr.t, hr.y, a, b), estimated: hr.estimated };
  if (g.battery?.cols.Battery) {
    const st = rangeStats(g.battery.t, g.battery.cols.Battery, a, b);
    const bt = g.battery.t, bv = g.battery.cols.Battery;
    let first = NaN, last = NaN;
    for (let i = 0; i < g.battery.n; i++) if (bt[i] >= a && bt[i] <= b && bv[i] === bv[i]) { if (!(first === first)) first = bv[i]; last = bv[i]; }
    out.battery = { start: first, end: last, min: st.min };
  }
  if (ana?.artifacts) {
    out.artifact = Object.fromEntries([...SENSORS, 'any'].map((s) => [s, meanIn(ana.artifacts, s, a, b)]));
  }
  if (ana?.motion) out.moving = meanIn(ana.motion, 'moving', a, b);
  if (ana?.paf) out.pafMetrics = pafMetrics(ana.paf, a, b);
  if (ana?.coherence) out.coherence = meanIn(ana.coherence, 'coherence', a, b);
  if (ana?.fnirs) {
    out.fnirs = Object.fromEntries(['hboL', 'hbrL', 'hboR', 'hbrR'].map((k) => [k, meanIn(ana.fnirs, k, a, b)]));
  }
  const ev = {};
  for (const e of rec.events) if (e.t >= a && e.t <= b) ev[e.kind] = (ev[e.kind] || 0) + 1;
  out.events = ev;
  return out;
}

/** Segments between consecutive /Marker events (plus start / end). */
export function markerSegments(rec) {
  const marks = rec.events.filter((e) => e.kind === 'marker');
  if (!marks.length) return [];
  const pts = [{ t: 0, text: 'start' }, ...marks, { t: rec.meta.duration, text: 'end' }];
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (pts[i + 1].t - pts[i].t < 1) continue;
    out.push({ a: pts[i].t, b: pts[i + 1].t, from: pts[i].text, to: pts[i + 1].text });
  }
  return out;
}
