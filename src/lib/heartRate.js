/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Streaming heart-rate (BPM) estimator from the Muse S Athena optics (PPG, photoplethysmography).
//
// Channel choice (see lib/fnirs.js layout): the INNER IR channels (6 LI_IR, 7 RI_IR) have the short
// source-detector path (scalp/skin), where the pulse wave is strongest, and 850 nm sits near the
// isosbestic point so the pulse is not eaten by oxygenation changes. With only 4 channels (p1035)
// the outer IR pair (2, 3) is the fallback. Both channels are summed after normalising each to its
// own slow level (relative change), which averages the noise and makes the amplitude gain-free.
//
// Pipeline: relative change -> band-pass 0.7-3.5 Hz (biquads) -> last ~10 s window ->
//   autocorrelation (BPM, sub-sample peak) cross-checked against peak detection (refractory period,
//   adaptive threshold, interval variability). Updated about once per second. null = poor signal.

export const HR_MIN_BPM = 40;
export const HR_MAX_BPM = 200;
const BAND_LO_HZ = 0.7;
const BAND_HI_HZ = 3.5;
const WINDOW_S = 10;
const MIN_WINDOW_S = 6; // first estimate after this much filtered signal
const SETTLE_S = 2; // filter start-up transient, not analysed
const UPDATE_S = 1;
const LEVEL_TAU_S = 2; // slow level used to normalise each channel
const MIN_RMS = 2e-5; // relative amplitude below this = flat / no skin contact
const MIN_AC_PEAK = 0.55; // normalised autocorrelation at the pulse lag
const MAX_IBI_CV = 0.25; // beat-interval variability above this = motion / noise
const AGREE = 0.12; // autocorrelation and peak-detection BPM must agree within 12 %
const HOLD_S = 3; // keep the last value this long through a bad stretch
const RATE_WINDOW_S = 4;
const RATE_CHANGE = 0.15;

// RBJ biquads (Q = Butterworth), direct form I
function biquad(type, f0, fs, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * f0) / fs;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  const a0 = 1 + al;
  const c = [b0 / a0, b1 / a0, b2 / a0, (-2 * cw) / a0, (1 - al) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** Band-pass chain for fs (two high-pass + two low-pass sections, steep enough to kill drift) */
export function makeBandpass(fs, lo = BAND_LO_HZ, hi = BAND_HI_HZ) {
  const hiHz = Math.min(hi, fs * 0.45);
  const stages = [biquad('hp', lo, fs), biquad('hp', lo, fs), biquad('lp', hiHz, fs), biquad('lp', hiHz, fs)];
  return (x) => stages.reduce((v, s) => s(v), x);
}

/** Pulse channels for an optics sample: inner IR (6, 7) when 8 channels, else outer IR (2, 3) */
export function pulseChannels(len) {
  return len >= 8 ? [6, 7] : [2, 3];
}

/**
 * Pure analysis of one filtered window.
 * @param {Float64Array|number[]} x band-passed samples, oldest first
 * @param {number} fs sample rate in Hz
 * @returns {{bpm:number|null, quality:number, reason?:string}}
 */
export function analyzeWindow(x, fs) {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let r0 = 0;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { y[i] = x[i] - mean; r0 += y[i] * y[i]; }
  const rms = Math.sqrt(r0 / n);
  if (!(rms > MIN_RMS)) return { bpm: null, quality: 0, reason: 'flat' };

  // Autocorrelation over lags for 200..40 BPM (normalised by overlap length)
  const lagMin = Math.max(2, Math.floor((fs * 60) / HR_MAX_BPM));
  const lagMax = Math.min(n - 4, Math.ceil((fs * 60) / HR_MIN_BPM));
  const ac = new Float64Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag];
    ac[lag] = (s / (n - lag)) / (r0 / n);
  }
  let best = -1, bestV = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > bestV) { best = lag; bestV = ac[lag]; }
  }
  // Multiples of the beat interval correlate as well: take the shortest lag that is nearly as good
  if (best >= 0) {
    for (let lag = lagMin; lag < best; lag++) {
      if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] >= 0.85 * bestV) { best = lag; break; }
    }
    bestV = ac[best];
  }
  if (best < 0 || bestV < MIN_AC_PEAK) return { bpm: null, quality: Math.max(0, bestV), reason: 'weak' };
  // parabolic interpolation of the peak
  const a = ac[best - 1], b = ac[best], c = ac[best + 1];
  const den = a - 2 * b + c;
  const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
  const bpmAc = (60 * fs) / (best + off);

  // Peak detection: adaptive threshold = fraction of the RMS, refractory period 0.3 s (max 200 BPM)
  const refractory = Math.floor(0.3 * fs);
  const thr = 0.4 * rms;
  const peaks = [];
  for (let i = 1; i < n - 1; i++) {
    if (y[i] > thr && y[i] > y[i - 1] && y[i] >= y[i + 1]) {
      const last = peaks.length - 1;
      if (last >= 0 && i - peaks[last] < refractory) { if (y[i] > y[peaks[last]]) peaks[last] = i; }
      else peaks.push(i);
    }
  }
  if (peaks.length < 4) return { bpm: null, quality: bestV, reason: 'few-peaks' };
  const ibi = [];
  for (let i = 1; i < peaks.length; i++) ibi.push((peaks[i] - peaks[i - 1]) / fs);
  const sorted = [...ibi].sort((p, q) => p - q);
  const med = sorted[sorted.length >> 1];
  const bpmPk = 60 / med;
  const m = ibi.reduce((s, v) => s + v, 0) / ibi.length;
  const sd = Math.sqrt(ibi.reduce((s, v) => s + (v - m) ** 2, 0) / ibi.length);
  if (sd / m > MAX_IBI_CV) return { bpm: null, quality: bestV, reason: 'irregular' };
  if (Math.abs(bpmPk - bpmAc) / bpmAc > AGREE) return { bpm: null, quality: bestV, reason: 'disagree' };
  if (bpmAc < HR_MIN_BPM || bpmAc > HR_MAX_BPM) return { bpm: null, quality: bestV, reason: 'range' };
  return { bpm: bpmAc, quality: bestV };
}

export class HeartRateEstimator {
  constructor({ fs = 64 } = {}) {
    this.fs = fs;
    this._rateT0 = null;
    this._rateN = 0;
    this._rateLast = 0;
    this._rateGap = false;
    this._lvl = [0, 0];
    this.bpm = null; // latest estimate (median of the last 3), null = no reliable pulse
    this.quality = 0;
    this._rebuild();
  }

  _rebuild() {
    this._bp = makeBandpass(this.fs);
    this._cap = Math.round(WINDOW_S * this.fs);
    this._buf = new Float64Array(this._cap);
    this._n = 0; // samples since (re)start
    this._sinceUpdate = 0;
    this._recent = [];
    this._badTicks = 0;
    this._lvl = [0, 0];
  }

  reset() {
    this._rebuild();
    this.bpm = null;
    this.quality = 0;
  }

  // Samples are counted against wall time; the measured rate replaces the nominal one if it differs
  _measureRate(nowMs) {
    if (this._rateT0 === null) { this._rateT0 = this._rateLast = nowMs; return; }
    if (nowMs - this._rateLast > 1500) this._rateGap = true;
    this._rateLast = nowMs;
    this._rateN++;
    const el = (nowMs - this._rateT0) / 1000;
    if (el < RATE_WINDOW_S) return;
    const est = this._rateN / el;
    if (!this._rateGap && est > 4 && Math.abs(est - this.fs) / this.fs > RATE_CHANGE) {
      this.fs = Math.round(est * 10) / 10;
      this._rebuild();
      this.bpm = null;
    }
    this._rateT0 = nowMs; this._rateN = 0; this._rateGap = false;
  }

  /**
   * One optics sample (4 or 8 values). Returns the current BPM (or null).
   * @param {number[]} v
   * @param {number} [nowMs] wall clock, used only to measure the real sample rate
   */
  push(v, nowMs = Date.now()) {
    if (!v || v.length < 4) return this.bpm;
    this._measureRate(nowMs);
    const ch = pulseChannels(v.length);
    let sum = 0;
    for (let k = 0; k < 2; k++) {
      const x = v[ch[k]];
      if (!(x > 0) || !Number.isFinite(x)) { this._lvl[k] = 0; return this.bpm; } // dark / invalid: skip sample
      if (!this._lvl[k]) this._lvl[k] = x;
      sum += x / this._lvl[k] - 1;
      this._lvl[k] += (x - this._lvl[k]) * (1 - Math.exp(-1 / (LEVEL_TAU_S * this.fs)));
    }
    const f = this._bp(sum);
    this._n++;
    const settle = Math.round(SETTLE_S * this.fs);
    if (this._n <= settle) return this.bpm;
    this._buf[(this._n - 1) % this._cap] = f;
    if (++this._sinceUpdate >= UPDATE_S * this.fs) {
      this._sinceUpdate = 0;
      this._update(settle);
    }
    return this.bpm;
  }

  _update(settle) {
    const filled = Math.min(this._cap, this._n - settle);
    if (filled < MIN_WINDOW_S * this.fs) return;
    const x = new Float64Array(filled);
    const start = this._n - filled;
    for (let i = 0; i < filled; i++) x[i] = this._buf[(start + i) % this._cap];
    const r = analyzeWindow(x, this.fs);
    this.quality = r.quality;
    if (r.bpm === null) {
      if (++this._badTicks * UPDATE_S > HOLD_S) { this.bpm = null; this._recent = []; }
      return;
    }
    this._badTicks = 0;
    this._recent.push(r.bpm);
    if (this._recent.length > 3) this._recent.shift();
    const s = [...this._recent].sort((p, q) => p - q);
    this.bpm = s[s.length >> 1];
  }

  /** Current BPM rounded to an integer, or null */
  get value() {
    return this.bpm === null ? null : Math.round(this.bpm);
  }
}
