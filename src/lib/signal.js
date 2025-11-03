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

export function computeWelchPSD(
  samples,
  sampleRate = SAMPLE_RATE,
  windowSec = 2,
  overlapSec = 1
) {
  // Returns { psd: Float32Array, freqRes: number }
  const Nw = Math.floor(windowSec * sampleRate);
  if (samples.length < Nw) {
    return { psd: new Float32Array(Math.floor(Nw / 2)), freqRes: sampleRate / Nw };
  }
  const step = Math.max(1, Math.floor((windowSec - overlapSec) * sampleRate));
  const window = hann(Nw);
  let count = 0;
  let acc;
  for (let start = samples.length - Nw; start >= 0; start -= step) {
    const seg = new Float32Array(Nw);
    for (let i = 0; i < Nw; i++) seg[i] = samples[start + i] * window[i];
    const p = periodogram(seg);
    if (!acc) {
      acc = new Float32Array(p.length);
    }
    for (let i = 0; i < p.length; i++) acc[i] += p[i];
    count++;
    // Only a few most recent segments needed; break after 3 averages to bound cost
    if (count >= 3) break;
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
    // skip DC bin (k=0) by starting at 1
    const i0 = Math.max(1, Math.floor(lo / freqRes));
    const i1 = Math.min(nBins - 1, Math.ceil(hi / freqRes));
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
