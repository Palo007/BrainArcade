/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo's own calm number, made from raw EEG so the shared processing stays as it is.
// One 2 s window, 4 updates/s, no extra smoothing (about 1.5-2 s delay, measured on the test day).
// calm = log((alpha + min(theta, theta cap)) / beta) on the forehead (AF7/AF8), with the child's own bands
// made from the alpha peak (IAPF) and beta capped at 25 Hz. z = distance from the day's own baseline.
// TP9/TP10 are used only for the eyes-closed check and the blink hold.
// All limits below are START values. The test day sets the real ones.
import { useEffect, useRef } from 'react';
import { SAMPLE_RATE, bandPowersFromPSD } from '../../lib/signal.js';
import { fftRadix2, median } from '../../lib/paf.js';

export const WINDOW_SAMPLES = SAMPLE_RATE * 2; // 2 s = 512 samples (a power of two, for the FFT)
export const TICK_MS = 250; // 4 updates/s
export const MIN_NEW_SAMPLES = 32; // fewer new samples since the last frame = the stream stalled: no frame
export const STALE_MS = 800; // a frame older than this is not used (game holds the value)
export const BLINK_SPAN_MS = 2400; // a blink is inside the 2 s window for about this long after detection
export const DEFAULT_IAPF = 9; // Hz, about right at age 6-9, used when there is no calibration
export const IAPF_MIN = 7;
export const IAPF_MAX = 12;
export const ALPHA_HALF_HZ = 2; // alpha = IAPF +- 2 Hz
export const THETA_MIN_HZ = 4; // below 4 Hz eye movements add too much power
export const BETA_MAX_HZ = 25; // above this, muscle noise is bigger than brain signal
export const MUSCLE_BAND = [30, 45];
export const THETA_CAP_MADS = 1; // theta counts up to baseline median + 1 MAD, no more
export const MAD_FLOOR = 0.1; // a floor in log units, so a very still baseline does not make the meter jumpy
export const METER_Z_SPAN = 4; // meter = 0.5 + z / 4, so z from -2 to +2 fills the bar
export const MUSCLE_FACTOR = 2; // 30-45 Hz above 2x the baseline = muscle
export const SLEEPY_FACTOR = 1.5; // theta/alpha above 1.5x baseline
export const SLEEPY_AFTER_S = 10;
export const EYES_CLOSED_SLEEPY_S = 8; // eyes closed this long in a row = sleepy
export const EYES_AFTER_S = 4;
export const EYES_NO_BLINK_MS = 4000;
export const EYES_MIN_REACTIVITY = 2; // the eyes-closed check runs only when the child's alpha at least doubles
export const EYE_MOVE_CORR = -0.5; // AF7 and AF8 slow waves swing in opposite directions
export const EYE_MOVE_FACTOR = 2; // and are 2x bigger than at baseline
export const EYE_MOVE_HOLD_MS = 1000;
const FRONTAL = [1, 2];
const POSTERIOR = [0, 3];
const LOW_BOX = SAMPLE_RATE / 4; // 0.25 s box filter = slow waves below about 2 Hz
const LOW_STEP = 32; // one low value per 125 ms

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// The child's alpha peak: from the calibration bands (bands.iapf, or the middle of their alpha band)
export function iapfOf(bands) {
  const v = Number.isFinite(bands?.iapf) ? bands.iapf
    : Array.isArray(bands?.alpha) ? (bands.alpha[0] + bands.alpha[1]) / 2 : DEFAULT_IAPF;
  return clamp(Number.isFinite(v) ? v : DEFAULT_IAPF, IAPF_MIN, IAPF_MAX);
}

// Personal bands made from the alpha peak: alpha = IAPF +- 2, theta = 4 ... IAPF-2, beta = IAPF+2 ... 25, plus muscle
export function calmBands(bands) {
  const iapf = iapfOf(bands);
  const a = [iapf - ALPHA_HALF_HZ, iapf + ALPHA_HALF_HZ];
  return {
    theta: [THETA_MIN_HZ, a[0]], alpha: a, beta: [a[1], BETA_MAX_HZ], muscle: MUSCLE_BAND,
  };
}

const hann = Array.from({ length: WINDOW_SAMPLES }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / (WINDOW_SAMPLES - 1))));

// Detrended, Hann-windowed power spectrum of the last 2 s (same scaling as signal.js periodogram)
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

// Slow waves (< 2 Hz) of the last 2 s: a 0.25 s box mean every 125 ms, with the window mean removed
function slowWaves(arr) {
  const off = arr.length - WINDOW_SAMPLES;
  const out = [];
  for (let end = LOW_BOX; end <= WINDOW_SAMPLES; end += LOW_STEP) {
    let s = 0;
    for (let i = end - LOW_BOX; i < end; i++) s += arr[off + i];
    out.push(s / LOW_BOX);
  }
  const m = out.reduce((a, b) => a + b, 0) / out.length;
  return out.map((v) => v - m);
}

// Correlation of the AF7 and AF8 slow waves (-1 = opposite swings) and their size (RMS of the difference)
function eyeSwing(b7, b8) {
  const x = slowWaves(b7), y = slowWaves(b8);
  let sxy = 0, sxx = 0, syy = 0, sd = 0;
  for (let i = 0; i < x.length; i++) { sxy += x[i] * y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sd += (x[i] - y[i]) ** 2; }
  const den = Math.sqrt(sxx * syy);
  return { corr: den > 0 ? sxy / den : 0, amp: Math.sqrt(sd / x.length) };
}

// One frame from the last 2 s of the 4 channels, or null when the window is not full yet.
// frame: raw alpha/theta/beta on AF7+AF8 (mean), alpha on TP9+TP10, muscle power per channel, eye swing.
export function measure(bufs, bands) {
  if (!bufs || bufs[0].length < WINDOW_SAMPLES) return null;
  const freqRes = SAMPLE_RATE / WINDOW_SAMPLES;
  const per = bufs.map((arr) => bandPowersFromPSD(spectrum(arr), freqRes, bands));
  const f = (k) => FRONTAL.reduce((s, ch) => s + (per[ch][k] || 0), 0) / FRONTAL.length;
  const alpha = f('alpha'), theta = f('theta'), beta = f('beta');
  if (!(alpha > 0) || !(beta > 0)) return null;
  const { corr, amp } = eyeSwing(bufs[1], bufs[2]);
  return {
    alpha, theta, beta,
    tpAlpha: POSTERIOR.reduce((s, ch) => s + (per[ch].alpha || 0), 0) / POSTERIOR.length,
    muscle: per.map((p) => p.muscle || 0),
    eyeCorr: corr, eyeAmp: amp,
  };
}

// Median and MAD (median absolute deviation): the middle value and the normal spread. A blink does not move them.
export function medianMad(values) {
  const m = median(values);
  return { med: m, mad: median(values.map((v) => Math.abs(v - m))) };
}

// log of the calm ratio, with theta capped so drowsy theta cannot grow the bubble
export function logRatio(frame, thetaCap) {
  return Math.log((frame.alpha + Math.min(frame.theta, thetaCap)) / frame.beta);
}

// Baseline from the daily 60 s (or the 20 s warm-up) frames, eyes open, in the play pose
export function makeBaseline(frames) {
  if (!frames.length) return null;
  const th = medianMad(frames.map((f) => f.theta));
  const thetaCap = th.med + THETA_CAP_MADS * th.mad;
  const lr = medianMad(frames.map((f) => logRatio(f, thetaCap)));
  return {
    mu: lr.med,
    mad: Math.max(lr.mad, MAD_FLOOR),
    theta: th.med, thetaMad: th.mad, thetaCap,
    thetaAlpha: median(frames.map((f) => f.theta / f.alpha)),
    muscle: [0, 1, 2, 3].map((ch) => median(frames.map((f) => f.muscle[ch]))),
    tpAlpha: median(frames.map((f) => f.tpAlpha)),
    eyeAmp: median(frames.map((f) => f.eyeAmp)),
    n: frames.length,
  };
}

// z = how far from the child's own normal; meter = 0.5 + z / 4, from 0 to 1
export function toMeter(frame, base) {
  const z = (logRatio(frame, base.thetaCap) - base.mu) / base.mad;
  return { z, meter: clamp(0.5 + z / METER_Z_SPAN, 0, 1) };
}

// Stateful traps check. update() returns {eyes, eyeMove, sleepy, muscle}. None of them may reward or punish.
// eyes    = TP alpha above the log-midpoint of eyes-open and eyes-closed alpha for 4 s, no blinks -> hold.
//           Only on when reactivity (closed/open alpha ratio from the calibration) is at least 2.
// eyeMove = slow, opposite, big swings on AF7 vs AF8 (looking left and right) -> hold.
// sleepy  = theta/alpha above 1.5x baseline for 10 s, or eyes closed for 8 s -> freeze. Off in duck time.
// muscle  = 30-45 Hz above 2x baseline on AF7 or AF8 -> hold (never freeze: a freeze would give a clencher a break).
// Play Setup Phase 2: the wiggle and head-nod checks plug in here, once MotionContext exists.
export function createChecks() {
  let eyesFor = 0, sleepyFor = 0, moveUntil = 0, lastNow = null;
  return {
    reset() { eyesFor = 0; sleepyFor = 0; moveUntil = 0; lastNow = null; },
    update(frame, base, { now = 0, lastBlinkAt = 0, reactivity, duckTime = false } = {}) {
      const dt = lastNow == null ? 0 : Math.min(0.5, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      if (!frame || !base) return { eyes: false, eyeMove: false, sleepy: false, muscle: false };
      const closed = Number.isFinite(reactivity) && reactivity >= EYES_MIN_REACTIVITY && base.tpAlpha > 0
        && frame.tpAlpha > base.tpAlpha * Math.sqrt(reactivity); // log-midpoint = open x sqrt(closed/open)
      const noBlink = now - lastBlinkAt > EYES_NO_BLINK_MS;
      eyesFor = closed && noBlink ? eyesFor + dt : 0;
      // Duck time is thinking hard (theta goes up): the sleepy check is off then and starts over after it
      if (duckTime) sleepyFor = 0;
      else {
        const slow = base.thetaAlpha > 0 && frame.theta / frame.alpha > SLEEPY_FACTOR * base.thetaAlpha;
        sleepyFor = slow ? sleepyFor + dt : 0;
      }
      if (frame.eyeCorr < EYE_MOVE_CORR && base.eyeAmp > 0 && frame.eyeAmp > EYE_MOVE_FACTOR * base.eyeAmp) {
        moveUntil = now + EYE_MOVE_HOLD_MS;
      }
      const muscle = FRONTAL.some((ch) => base.muscle[ch] > 0 && frame.muscle[ch] > MUSCLE_FACTOR * base.muscle[ch]);
      return {
        eyes: eyesFor >= EYES_AFTER_S,
        eyeMove: now < moveUntil,
        sleepy: !duckTime && (sleepyFor >= SLEEPY_AFTER_S || eyesFor >= EYES_CLOSED_SLEEPY_S),
        muscle,
      };
    },
  };
}

// Raw EEG -> latest frame in a ref, 4x/s, only while enabled (baseline, warm-up and rounds). No React state.
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
