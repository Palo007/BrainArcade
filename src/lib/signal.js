// Lightweight signal processing utilities for EEG
// Implements Welch PSD with Hann window and band power helpers

export const SAMPLE_RATE = 256; // Hz

export const BANDS = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

// Hann window cached by size
const hannCache = new Map();
function hann(N) {
  if (hannCache.has(N)) return hannCache.get(N);
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }
  hannCache.set(N, w);
  return w;
}

// Remove the least-squares line (DC offset + slow drift) in place. Without this the Hann window
// leaks the offset into the lowest bins: a 20 µV offset made delta power 3.7x too big (classic Muse).
function detrend(seg) {
  const N = seg.length;
  const xm = (N - 1) / 2;
  let ym = 0;
  for (let i = 0; i < N; i++) ym += seg[i];
  ym /= N;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < N; i++) { const dx = i - xm; sxy += dx * (seg[i] - ym); sxx += dx * dx; }
  const b = sxy / sxx;
  for (let i = 0; i < N; i++) seg[i] -= ym + b * (i - xm);
}

// Naive DFT magnitude squared (sufficient for small windows like 512)
function periodogram(samples) {
  const N = samples.length;
  const half = Math.floor(N / 2);
  const out = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    let real = 0;
    let imag = 0;
    const ang = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const s = samples[n];
      const phase = ang * n;
      real += s * Math.cos(phase);
      imag -= s * Math.sin(phase);
    }
    out[k] = (real * real + imag * imag) / N;
  }
  return out;
}

// isBad(start, end): optional; true when samples[start..end) hold an artifact (e.g. a blink).
// Such segments are skipped and older clean ones used instead (the buffer holds up to 8 s).
export function computeWelchPSD(
  samples,
  sampleRate = SAMPLE_RATE,
  windowSec = 2,
  overlapSec = 1,
  isBad = null
) {
  // Returns { psd: Float32Array, freqRes: number }
  const Nw = Math.floor(windowSec * sampleRate);
  if (samples.length < Nw) {
    return { psd: new Float32Array(Math.floor(Nw / 2)), freqRes: sampleRate / Nw };
  }
  const step = Math.max(1, Math.floor((windowSec - overlapSec) * sampleRate));
  const window = hann(Nw);
  // Up to 3 most recent segments (bounds the cost); clean ones first
  const starts = [];
  for (let start = samples.length - Nw; start >= 0 && starts.length < 3; start -= step) {
    if (!isBad || !isBad(start, start + Nw)) starts.push(start);
  }
  // Every segment has an artifact: use the newest ones anyway rather than no spectrum
  if (starts.length === 0) {
    for (let start = samples.length - Nw; start >= 0 && starts.length < 3; start -= step) starts.push(start);
  }
  let count = 0;
  let acc;
  for (const start of starts) {
    const seg = new Float32Array(Nw);
    for (let i = 0; i < Nw; i++) seg[i] = samples[start + i];
    detrend(seg);
    for (let i = 0; i < Nw; i++) seg[i] *= window[i];
    const p = periodogram(seg);
    if (!acc) {
      acc = new Float32Array(p.length);
    }
    for (let i = 0; i < p.length; i++) acc[i] += p[i];
    count++;
  }
  if (!acc) {
    acc = new Float32Array(Math.floor(Nw / 2));
  } else {
    for (let i = 0; i < acc.length; i++) acc[i] /= count;
  }
  return { psd: acc, freqRes: sampleRate / Nw };
}

export function bandPowersFromPSD(psd, freqRes, bands = BANDS) {
  const powers = {};
  const nBins = psd.length;
  for (const [name, [lo, hi]] of Object.entries(bands)) {
    // Half-open [lo, hi): a bin on a shared edge belongs to the upper band only, so no bin is
    // counted twice (an 8 Hz bin used to count fully as theta AND alpha). DC bin (k=0) skipped.
    const i0 = Math.max(1, Math.ceil(lo / freqRes - 1e-9));
    const i1 = Math.min(nBins - 1, Math.ceil(hi / freqRes - 1e-9) - 1);
    let sum = 0;
    for (let i = i0; i <= i1; i++) sum += psd[i];
    powers[name] = sum;
  }
  return powers;
}

export function averageChannels(values) {
  if (!values || values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
