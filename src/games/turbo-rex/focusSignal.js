/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Turbo Rex's own focus number, made from the shared fast signal (lib/fastSignal.js):
// focus = log(beta) - log(alpha + theta) on the forehead (AF7/AF8), with the child's own bands
// (theta from 4 Hz, beta capped at 25 Hz by the shared module). It is the engagement index: a game
// control, not a test. The z is against the child's watch-run baseline (median and MAD).
// The frame is 1 s and comes 8x/s; the game averages the last 4 fresh frames (0.5 s) so the bar is fast
// but not jumpy. Ear sensors (TP9/TP10) are only a muscle alarm.
import { createChecks as createSharedChecks, signalBaseline, robustStats, robustZ } from '../../lib/fastSignal.js';
import { median } from '../../lib/paf.js';

export const AVG_FRAMES = 4; // 4 frames of 125 ms = 0.5 s
export const MAD_FLOOR = 0.08; // log units: a very still baseline must not make the bar jumpy
export const METER_Z_SPAN = 4; // meter = 0.5 + z / 4, so z from -2 to +2 fills the bar

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Demo mode has no headband: the game makes its own z, so the baseline is a stand-in
export const DEMO_BASE = { focus: { median: 0, mad: 1 }, watchRaw: null };

export const focusOf = (frame) => {
  const f = frame.frontal;
  return Math.log(f.beta) - Math.log(f.alpha + f.theta);
};

// Mean of the newest values: win is a plain array the caller keeps (it is changed here)
export function pushFocus(win, value, n = AVG_FRAMES) {
  win.push(value);
  if (win.length > n) win.splice(0, win.length - n);
  return win.reduce((a, b) => a + b, 0) / win.length;
}

// Baseline from the watch-run frames (play pose, items moving, no tapping; blink frames left out).
// The z is made from the 4-frame average, so the spread is measured on the same average.
export function makeBaseline(frames) {
  if (!frames.length) return null;
  const raw = frames.map(focusOf).filter(Number.isFinite);
  if (!raw.length) return null;
  const avg = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - AVG_FRAMES + 1), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  return {
    ...signalBaseline(frames),
    focus: robustStats(avg, MAD_FLOOR),
    watchRaw: median(raw), // the raw number of the watch run: the parent's "real change" line
    n: frames.length,
  };
}

export const zOf = (focusAvg, base) => robustZ(focusAvg, base.focus);
export const meterOf = (z) => clamp(0.5 + z / METER_Z_SPAN, 0, 1);

// Shared flags, the ones Turbo Rex uses. update() returns {muscle, muscleSite, eyeMove, eyes}.
// None of them may reward or punish; the gate decides hold, hint or freeze.
// sleepy is not used: low focus is the game itself (Rex yawns), never a stop.
export function createChecks() {
  const shared = createSharedChecks();
  const off = { muscle: false, muscleSite: null, eyeMove: false, eyes: false };
  return {
    reset() { shared.reset(); },
    update(frame, base, dt, nowMs, { lastBlinkMs = 0, reactivity } = {}) {
      if (!frame || !base) return off;
      const s = shared.update(frame, base, dt, nowMs, { lastBlinkMs, reactivity });
      return { muscle: s.muscle, muscleSite: s.muscleSite, eyeMove: s.eyeMove, eyes: s.eyes };
    },
  };
}
