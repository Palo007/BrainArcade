/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Shared fast signal for the brain games (Train of Thoughts, Bubble Hippo, Turbo Rex).
// Made from raw EEG, so the shared ProcessingContext stays as it is.
// Sliding 1 s window, a frame every 125 ms (8/s), no extra smoothing (about 0.5 s delay).
// A frame has band powers per sensor plus the forehead average; each game makes its own number from it.
// Flags (createChecks): stale, blink, eye move, muscle (forehead / ears), tense, sleepy, eyes closed.
// None of the flags may reward or punish: the game (or the signal gate) decides hold, hint or freeze.
import { useEffect, useRef } from 'react';
import { SAMPLE_RATE, BANDS, bandPowersFromPSD } from './signal.js';
import { fftRadix2, median } from './paf.js';

export const WINDOW_SAMPLES = SAMPLE_RATE; // 1 s (a power of two, for the FFT)
export const TICK_MS = 125; // 8 updates/s
export const MIN_NEW_SAMPLES = 16; // fewer new samples since the last frame = the stream stalled: no frame
export const STALE_MS = 400; // a frame older than this is not used (the game holds the value)
export const BLINK_HOLD_MS = 1400; // a blink is inside the 1 s window for about this long after detection
export const THETA_MIN_HZ = 4;
export const BETA_MAX_HZ = 25; // above this, muscle noise is bigger than brain signal
export const MUSCLE_BAND = [30, 45];
export const EYE_BAND = [1, 4]; // slow AF7 - AF8: a sideways look moves the two sensors in opposite ways
export const MUSCLE_FACTOR = 2; // 30-45 Hz above 2x the slow reference = muscle
export const MUSCLE_REF_TAU_S = 20;
export const MUSCLE_RUN_FRAMES = 4; // 0.5 s in a row
export const MUSCLE_HOLD_MS = 500; // hold a little after the burst
export const EYE_FACTOR = 3; // slow AF7 - AF8 power above 3x its quiet level = eye move
export const EYE_REF_TAU_S = 20;
export const EYE_HOLD_MS = 500;
export const SLEEPY_FACTOR = 1.6; // theta AND delta 60% above baseline
export const SLEEPY_AFTER_S = 5;
export const EYES_AFTER_S = 2;
export const EYES_NO_BLINK_MS = 4000;
export const FRONTAL = [1, 2]; // AF7, AF8
export const EARS = [0, 3]; // TP9, TP10
const MAD_TO_SD = 1.4826;

// Personal bands from the PAF calibration (or the standard ones):
// theta 4...IAPF-2, alpha IAPF+-2, beta IAPF+2...25 Hz, plus the muscle band
export function fastBands(bands = BANDS) {
  const b = bands || BANDS;
  return {
    delta: b.delta,
    theta: [Math.max(THETA_MIN_HZ, b.theta[0]), b.theta[1]],
    alpha: b.alpha,
    beta: [b.beta[0], Math.min(b.beta[1], BETA_MAX_HZ)],
    muscle: MUSCLE_BAND,
  };
}

// Blink hold for a headband profile (deviceProfile.js), or the default
export const blinkHoldMs = (profile) => profile?.blink?.holdMs ?? BLINK_HOLD_MS;

// Robust scale: z = (value - median) / spread, spread = MAD scaled to match an SD (floored)
export function robustStats(values, minSpread = 1e-6) {
  const v = (values || []).filter(Number.isFinite);
  if (!v.length) return null;
  const m = median(v);
  const mad = median(v.map((x) => Math.abs(x - m))) * MAD_TO_SD;
  return { median: m, mad: Math.max(mad, minSpread), n: v.length };
}
export const robustZ = (value, stats) => (stats && Number.isFinite(value) ? (value - stats.median) / stats.mad : null);

const hann = Array.from({ length: WINDOW_SAMPLES }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (WINDOW_SAMPLES - 1))));

// Detrended, Hann-windowed power spectrum of the last 1 s (same scaling as signal.js periodogram)
function spectrum(arr) {
  const N = WINDOW_SAMPLES;
  const off = arr.length - N;
  const xm = (N - 1) / 2;
  let ym = 0;
  for (let i = 0; i < N; i++) ym += arr[off + i];
  ym /= N;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < N; i++) { const dx = i - xm; sxy += dx * (arr[off + i] - ym); sxx += dx * dx; }
  const slope = sxy / sxx;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (arr[off + i] - ym - slope * (i - xm)) * hann[i];
  fftRadix2(re, im);
  const psd = new Float32Array(N / 2);
  for (let k = 0; k < N / 2; k++) psd[k] = (re[k] * re[k] + im[k] * im[k]) / N;
  return psd;
}

// One frame from the last 1 s of the 4 channels, or null when the window is not full yet
// (or the forehead has no power: railed or open input).
// { sensors: [{delta, theta, alpha, beta, muscle}] x4, frontal: {delta, theta, alpha, beta}, muscle: [x4], eyeMove }
export function measure(bufs, bands) {
  if (!bufs || bufs.length < 4 || bufs[0].length < WINDOW_SAMPLES) return null;
  const N = WINDOW_SAMPLES;
  const freqRes = SAMPLE_RATE / N;
  const sensors = bufs.map((arr) => bandPowersFromPSD(spectrum(arr), freqRes, bands));
  const f = (k) => FRONTAL.reduce((s, ch) => s + (sensors[ch][k] || 0), 0) / FRONTAL.length;
  const frontal = { delta: f('delta'), theta: f('theta'), alpha: f('alpha'), beta: f('beta') };
  if (!(frontal.alpha > 0) || !(frontal.beta > 0)) return null;
  const a = bufs[FRONTAL[0]], b = bufs[FRONTAL[1]];
  const diff = new Float64Array(N);
  for (let i = 0; i < N; i++) diff[i] = a[a.length - N + i] - b[b.length - N + i];
  const eyeMove = bandPowersFromPSD(spectrum(diff), freqRes, { eye: EYE_BAND }).eye;
  return { sensors, frontal, muscle: sensors.map((p) => p.muscle || 0), eyeMove };
}

// The 8/s tick: a new frame, or null when the stream stalled (too few new samples)
export function makeFrame(bufs, freshSamples, bands, nowMs, { lastBlinkMs = 0, holdMs = BLINK_HOLD_MS } = {}) {
  if (freshSamples < MIN_NEW_SAMPLES) return null;
  const f = measure(bufs, bands);
  if (!f) return null;
  return { ...f, at: nowMs, blink: lastBlinkMs > 0 && nowMs - lastBlinkMs < holdMs };
}

// The frame if it is fresh, else null (stale: never score a frozen signal)
export const freshFrame = (frame, nowMs) => (frame && nowMs - frame.at < STALE_MS ? frame : null);

// Quiet levels from the warm-up frames (eyes open, play pose, blink frames left out by the caller)
export function signalBaseline(frames) {
  if (!frames.length) return null;
  const med = (pick) => median(frames.map(pick));
  return {
    alpha: med((f) => f.frontal.alpha),
    theta: med((f) => f.frontal.theta),
    delta: med((f) => f.frontal.delta),
    muscle: [0, 1, 2, 3].map((ch) => med((f) => f.muscle[ch])),
    eyeMove: med((f) => f.eyeMove || 0),
  };
}

// Forehead alpha level that counts as "eyes closed". reactivity is the POSTERIOR eyes-closed / eyes-open
// alpha ratio from the PAF calibration; the forehead jump is much smaller (often 1.3-1.8x), so only a
// quarter of the posterior jump is used, kept in 1.3-2.0x. No calibration: 1.5x.
export function eyesFactor(reactivity) {
  if (!(Number.isFinite(reactivity) && reactivity > 1)) return 1.5;
  return Math.min(2, Math.max(1.3, 1 + 0.25 * (reactivity - 1)));
}

// Stateful flag checks. update() returns {muscle, muscleSite, tense, eyeMove, eyes, sleepy}.
// muscle  = a burst (0.5 s in a row above 2x a slow 20 s reference) -> 'forehead' | 'ears' | 'both'.
// tense   = the slow reference itself above 2x the warm-up baseline (steady tension): a hint only.
//           On the demo recording a plain 2x-baseline hold rule held 57% of the time; the burst rule about 8%.
// eyeMove = slow AF7 - AF8 power jumps above 3x its quiet level (blink frames skipped), held 0.5 s.
// eyes    = forehead alpha up and no blink for 4 s, for 2 s.  sleepy = theta and delta up for 5 s.
const SITES = (ch) => (FRONTAL.includes(ch) ? 'forehead' : 'ears');
export function createChecks() {
  let eyesFor = 0, sleepyFor = 0, lastFrame = null, ref = null, eyeRef = null, runs = [0, 0, 0, 0];
  let until = { forehead: 0, ears: 0 }, eyeUntil = 0;
  const off = { muscle: false, muscleSite: null, tense: false, eyeMove: false, eyes: false, sleepy: false };
  return {
    reset() {
      eyesFor = 0; sleepyFor = 0; lastFrame = null; ref = null; eyeRef = null; runs = [0, 0, 0, 0];
      until = { forehead: 0, ears: 0 }; eyeUntil = 0;
    },
    update(frame, base, dt, nowMs, { lastBlinkMs = 0, reactivity } = {}) {
      if (!frame || !base) return off;
      if (!ref) ref = [...base.muscle];
      if (eyeRef == null) eyeRef = base.eyeMove > 0 ? base.eyeMove : (frame.eyeMove || 0);
      if (frame !== lastFrame) {
        lastFrame = frame;
        const a = (TICK_MS / 1000) / MUSCLE_REF_TAU_S;
        frame.muscle.forEach((p, ch) => {
          runs[ch] = ref[ch] > 0 && p > MUSCLE_FACTOR * ref[ch] ? runs[ch] + 1 : 0;
          ref[ch] += (Math.min(p, 3 * ref[ch]) - ref[ch]) * a; // bursts barely move the reference
          if (runs[ch] >= MUSCLE_RUN_FRAMES) until[SITES(ch)] = nowMs + MUSCLE_HOLD_MS;
        });
        if (!frame.blink && Number.isFinite(frame.eyeMove)) {
          if (eyeRef > 0 && frame.eyeMove > EYE_FACTOR * eyeRef) eyeUntil = nowMs + EYE_HOLD_MS;
          const e = (TICK_MS / 1000) / EYE_REF_TAU_S;
          eyeRef += (Math.min(frame.eyeMove, 3 * eyeRef || frame.eyeMove) - eyeRef) * e;
        }
      }
      const fore = nowMs < until.forehead, ears = nowMs < until.ears;
      const tense = ref.some((r, ch) => base.muscle[ch] > 0 && r > MUSCLE_FACTOR * base.muscle[ch]);
      const fr = frame.frontal;
      const alphaUp = base.alpha > 0 && fr.alpha > eyesFactor(reactivity) * base.alpha;
      const noBlink = nowMs - lastBlinkMs > EYES_NO_BLINK_MS;
      eyesFor = alphaUp && noBlink ? eyesFor + dt : 0;
      // A blink adds slow waves (delta, theta) to the forehead: blink frames neither grow nor reset the timer
      if (!frame.blink) {
        const slow = base.theta > 0 && base.delta > 0
          && fr.theta > SLEEPY_FACTOR * base.theta && fr.delta > SLEEPY_FACTOR * base.delta;
        sleepyFor = slow ? sleepyFor + dt : 0;
      }
      return {
        muscle: fore || ears,
        muscleSite: fore && ears ? 'both' : fore ? 'forehead' : ears ? 'ears' : null,
        tense,
        eyeMove: nowMs < eyeUntil,
        eyes: eyesFor >= EYES_AFTER_S,
        sleepy: sleepyFor >= SLEEPY_AFTER_S,
      };
    },
  };
}

// Raw EEG -> latest frame in a ref, 8x/s, only while enabled. No React state.
// frame.at = when it was made; frame.blink = a blink is inside its window (the game keeps the last value).
// No frame is made when the stream stalls, so a frozen signal goes stale instead of looking fresh.
export function useFastSignal(subscribeEEG, isConnected, bands, { enabled = true, blinkRef = null, holdMs = BLINK_HOLD_MS } = {}) {
  const frameRef = useRef(null);
  const bufsRef = useRef([[], [], [], []]);
  const bandsRef = useRef(fastBands(bands));
  useEffect(() => { bandsRef.current = fastBands(bands); }, [bands]);

  useEffect(() => {
    if (!enabled || !isConnected || !subscribeEEG) return undefined;
    bufsRef.current = [[], [], [], []];
    let fresh = 0;
    const keep = WINDOW_SAMPLES * 2;
    const unsub = subscribeEEG((sample) => {
      const bufs = bufsRef.current;
      for (let ch = 0; ch < 4; ch++) {
        bufs[ch].push(sample[ch] || 0);
        if (bufs[ch].length > keep + SAMPLE_RATE) bufs[ch].splice(0, bufs[ch].length - keep);
      }
      fresh++;
    });
    const id = setInterval(() => {
      if (fresh < MIN_NEW_SAMPLES) return;
      const f = makeFrame(bufsRef.current, fresh, bandsRef.current, performance.now(), {
        lastBlinkMs: blinkRef?.current || 0, holdMs,
      });
      fresh = 0;
      if (f) frameRef.current = f;
    }, TICK_MS);
    return () => { unsub(); clearInterval(id); frameRef.current = null; };
  }, [subscribeEEG, isConnected, enabled, blinkRef, holdMs]);

  return frameRef;
}
