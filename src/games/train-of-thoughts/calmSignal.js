/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Train of Thoughts' own calm number, made from raw EEG so the shared processing stays as it is.
// Sliding 1 s window, 8 updates/s, no extra smoothing (about 0.5 s delay instead of about 1.5 s).
// busy = log(beta / alpha) on the forehead (AF7/AF8), with the child's own bands and beta capped at 25 Hz.
// TP9/TP10 are used only for the muscle alarm.
import { useEffect, useRef } from 'react';
import { SAMPLE_RATE, BANDS, bandPowersFromPSD } from '../../lib/signal.js';
import { fftRadix2, median } from '../../lib/paf.js';

export const WINDOW_SAMPLES = SAMPLE_RATE; // 1 s (a power of two, for the FFT)
export const TICK_MS = 125; // 8 updates/s
export const MIN_NEW_SAMPLES = 16; // fewer new samples since the last frame = the stream stalled: no frame
export const STALE_MS = 400; // a frame older than this is not used (game holds the value)
export const BLINK_SPAN_MS = 1400; // a blink is inside the 1 s window for about this long after detection
export const BETA_MAX_HZ = 25; // above this, muscle noise is bigger than brain signal
export const MUSCLE_BAND = [30, 45];
export const MUSCLE_FACTOR = 2; // 30-45 Hz above 2x the reference = muscle
export const SLEEPY_FACTOR = 1.6; // theta AND delta 60% above baseline
export const SLEEPY_AFTER_S = 5;
export const EYES_AFTER_S = 2;
export const EYES_NO_BLINK_MS = 4000;
const FRONTAL = [1, 2];

// Personal bands from the PAF calibration (or the standard ones), beta capped, plus the muscle band
export function calmBands(bands = BANDS) {
  const b = bands || BANDS;
  return {
    delta: b.delta, theta: b.theta, alpha: b.alpha,
    beta: [b.beta[0], Math.min(b.beta[1], BETA_MAX_HZ)],
    muscle: MUSCLE_BAND,
  };
}

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
export function measure(bufs, bands) {
  if (!bufs || bufs[0].length < WINDOW_SAMPLES) return null;
  const freqRes = SAMPLE_RATE / WINDOW_SAMPLES;
  const per = bufs.map((arr) => bandPowersFromPSD(spectrum(arr), freqRes, bands));
  const f = (k) => FRONTAL.reduce((s, ch) => s + (per[ch][k] || 0), 0) / FRONTAL.length;
  const alpha = f('alpha'), beta = f('beta');
  if (!(alpha > 0) || !(beta > 0)) return null;
  return {
    busy: Math.log(beta / alpha),
    alpha, theta: f('theta'), delta: f('delta'),
    muscle: per.map((p) => p.muscle || 0),
  };
}

// Play-pose baseline from the warm-up frames (eyes open, watching the train)
export function makeBaseline(frames) {
  if (!frames.length) return null;
  const busy = frames.map((f) => f.busy);
  const mu = busy.reduce((a, b) => a + b, 0) / busy.length;
  const sd = Math.sqrt(busy.reduce((a, b) => a + (b - mu) ** 2, 0) / busy.length);
  return {
    mu,
    sd: Math.max(sd, 0.15), // a floor, so a very still warm-up does not make the bar jumpy
    alpha: median(frames.map((f) => f.alpha)),
    theta: median(frames.map((f) => f.theta)),
    delta: median(frames.map((f) => f.delta)),
    muscle: [0, 1, 2, 3].map((ch) => median(frames.map((f) => f.muscle[ch]))),
    n: frames.length,
  };
}

// Forehead alpha level that counts as "eyes closed". reactivity is the POSTERIOR eyes-closed / eyes-open
// alpha ratio from the PAF calibration; the forehead jump is much smaller (often 1.3-1.8x), so only a
// quarter of the posterior jump is used, kept in 1.3-2.0x. No calibration: 1.5x.
export function eyesFactor(reactivity) {
  if (!(Number.isFinite(reactivity) && reactivity > 1)) return 1.5;
  return Math.min(2, Math.max(1.3, 1 + 0.25 * (reactivity - 1)));
}

// Stateful traps check. update() returns {muscle, tense, eyes, sleepy}. None of them may reward or punish.
// muscle = a burst (0.5 s in a row above 2x a slow reference) -> hold.
// tense  = the slow reference itself above 2x the warm-up baseline. The game keeps playing but caps the
//          busy value at the goal, so muscle can neither win nor speed the train. On the demo recording a
//          plain 2x-baseline hold rule held 57% of the time; the burst rule holds about 8%.
export const MUSCLE_REF_TAU_S = 20;
export const MUSCLE_RUN_FRAMES = 4;
export function createChecks() {
  let eyesFor = 0, sleepyFor = 0, muscleUntil = 0, lastFrame = null, ref = null, runs = [0, 0, 0, 0];
  return {
    reset() { eyesFor = 0; sleepyFor = 0; muscleUntil = 0; lastFrame = null; ref = null; runs = [0, 0, 0, 0]; },
    update(frame, base, dt, nowMs, { lastBlinkMs = 0, reactivity } = {}) {
      if (!frame || !base) return { muscle: false, tense: false, eyes: false, sleepy: false };
      if (!ref) ref = [...base.muscle];
      if (frame !== lastFrame) {
        lastFrame = frame;
        const a = (TICK_MS / 1000) / MUSCLE_REF_TAU_S;
        frame.muscle.forEach((p, ch) => {
          runs[ch] = ref[ch] > 0 && p > MUSCLE_FACTOR * ref[ch] ? runs[ch] + 1 : 0;
          ref[ch] += (Math.min(p, 3 * ref[ch]) - ref[ch]) * a; // bursts barely move the reference
        });
        if (runs.some((n) => n >= MUSCLE_RUN_FRAMES)) muscleUntil = nowMs + 500; // hold a little after the burst
      }
      const tense = ref.some((r, ch) => base.muscle[ch] > 0 && r > MUSCLE_FACTOR * base.muscle[ch]);
      const alphaUp = base.alpha > 0 && frame.alpha > eyesFactor(reactivity) * base.alpha;
      const noBlink = nowMs - lastBlinkMs > EYES_NO_BLINK_MS;
      eyesFor = alphaUp && noBlink ? eyesFor + dt : 0;
      // A blink adds slow waves (delta, theta) to the forehead: blink frames neither grow nor reset the timer
      if (!frame.blink) {
        const slow = base.theta > 0 && base.delta > 0
          && frame.theta > SLEEPY_FACTOR * base.theta && frame.delta > SLEEPY_FACTOR * base.delta;
        sleepyFor = slow ? sleepyFor + dt : 0;
      }
      return { muscle: nowMs < muscleUntil, tense, eyes: eyesFor >= EYES_AFTER_S, sleepy: sleepyFor >= SLEEPY_AFTER_S };
    },
  };
}

// Raw EEG -> latest frame in a ref, 8x/s, only while enabled (warm-up and rounds). No React state.
// frame.at = when it was made; frame.blink = a blink is inside its window (the game keeps the last value).
// No frame is made when the stream stalls, so a frozen signal goes stale instead of looking fresh.
export function useCalmSignal(subscribeEEG, isConnected, bands, { enabled = true, blinkRef = null } = {}) {
  const frameRef = useRef(null);
  const bufsRef = useRef([[], [], [], []]);
  const bandsRef = useRef(calmBands(bands));
  useEffect(() => { bandsRef.current = calmBands(bands); }, [bands]);

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
      fresh = 0;
      const f = measure(bufsRef.current, bandsRef.current);
      if (!f) return;
      const now = performance.now();
      const lastBlink = blinkRef?.current || 0;
      frameRef.current = { ...f, at: now, blink: lastBlink > 0 && now - lastBlink < BLINK_SPAN_MS };
    }, TICK_MS);
    return () => { unsub(); clearInterval(id); frameRef.current = null; };
  }, [subscribeEEG, isConnected, enabled, blinkRef]);

  return frameRef;
}
