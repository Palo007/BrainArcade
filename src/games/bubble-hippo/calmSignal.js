/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo's own calm number, made from the shared fast signal (lib/fastSignal.js):
// calm = log((alpha + min(theta, theta cap)) / beta) on the forehead (AF7/AF8), with the child's own bands.
// The shared frame is 1 s; the game keeps its old ~2 s span by averaging calm over the last 8 fresh frames.
// Flags (stale, blink, eye move, muscle, eyes closed) come from the shared checks. The sleepy rule stays
// the game's own: forehead theta/alpha, no delta, off in duck time (a review took delta out for this game).
import { createChecks as createSharedChecks, signalBaseline, robustStats, robustZ, EYES_AFTER_S } from '../../lib/fastSignal.js';
import { median } from '../../lib/paf.js';

export const THETA_CAP_MADS = 1; // theta counts up to baseline median + 1 MAD, no more
export const MAD_FLOOR = 0.1; // a floor in log units, so a very still baseline does not make the meter jumpy
export const METER_Z_SPAN = 4; // meter = 0.5 + z / 4, so z from -2 to +2 fills the bar
export const AVG_FRAMES = 8; // 8 frames of 125 ms = 1 s of averaging on top of the 1 s window
export const SLEEPY_FACTOR = 1.5; // theta/alpha above 1.5x baseline
export const SLEEPY_AFTER_S = 10;
export const EYES_CLOSED_SLEEPY_S = 8; // eyes closed this long in a row = sleepy

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const MAD_TO_SD = 1.4826; // robustStats scales its MAD to match an SD; the theta cap uses the plain MAD

// Demo mode has no headband: the game makes its own z, so the baseline is a stand-in
export const DEMO_BASE = { calm: { median: 0, mad: 1 } };

// log of the calm ratio on a shared frame, with theta capped so drowsy theta cannot grow the bubble
export const calmOf = (frame, thetaCap = Infinity) => {
  const f = frame.frontal;
  return Math.log((f.alpha + Math.min(f.theta, thetaCap)) / f.beta);
};

// Mean of the newest calm values: win is a plain array the caller keeps (it is changed here)
export function pushCalm(win, value, n = AVG_FRAMES) {
  win.push(value);
  if (win.length > n) win.splice(0, win.length - n);
  return win.reduce((a, b) => a + b, 0) / win.length;
}

// Baseline from the daily 60 s (or the 20 s warm-up) frames, eyes open, in the play pose
export function makeBaseline(frames) {
  if (!frames.length) return null;
  const theta = robustStats(frames.map((f) => f.frontal.theta));
  const thetaCap = theta.median + THETA_CAP_MADS * (theta.mad / MAD_TO_SD);
  // The z is made from the 8-frame average, so the spread is measured on the same average
  const raw = frames.map((f) => calmOf(f, thetaCap));
  const avg = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - AVG_FRAMES + 1), i + 1);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  return {
    ...signalBaseline(frames),
    calm: robustStats(avg, MAD_FLOOR),
    thetaStats: theta,
    thetaCap,
    thetaAlpha: median(frames.map((f) => f.frontal.theta / f.frontal.alpha)),
    n: frames.length,
  };
}

// z = how far from the child's own normal; meter = 0.5 + z / 4, from 0 to 1
export const zOf = (calmAvg, base) => robustZ(calmAvg, base.calm);
export const meterOf = (z) => clamp(0.5 + z / METER_Z_SPAN, 0, 1);

// Shared flags plus the game's own sleepy rule. update() returns {eyes, eyeMove, sleepy, muscle}.
// None of them may reward or punish.
// sleepy = forehead theta/alpha above 1.5x baseline for 10 s, or eyes closed for 8 s -> freeze. Off in duck time.
// muscle = a burst on the forehead or the ears -> hold (never freeze: a freeze would give a clencher a break).
export function createChecks() {
  const shared = createSharedChecks();
  let sleepyFor = 0, eyesFor = 0;
  return {
    reset() { shared.reset(); sleepyFor = 0; eyesFor = 0; },
    update(frame, base, dt, nowMs, { lastBlinkMs = 0, reactivity, duckTime = false } = {}) {
      const s = shared.update(frame, base, dt, nowMs, { lastBlinkMs, reactivity });
      if (!frame || !base) { sleepyFor = 0; eyesFor = 0; return { eyes: false, eyeMove: false, sleepy: false, muscle: false }; }
      eyesFor = s.eyes ? eyesFor + dt : 0;
      // Duck time is thinking hard (theta goes up): the sleepy check is off then and starts over after it.
      // A blink adds slow waves to the forehead: blink frames neither grow nor reset the timer.
      if (duckTime) sleepyFor = 0;
      else if (!frame.blink) {
        const slow = base.thetaAlpha > 0 && frame.frontal.theta / frame.frontal.alpha > SLEEPY_FACTOR * base.thetaAlpha;
        sleepyFor = slow ? sleepyFor + dt : 0;
      }
      // the shared eyes flag starts after EYES_AFTER_S, so the 8 s total is counted from there
      const closedLong = eyesFor >= EYES_CLOSED_SLEEPY_S - EYES_AFTER_S;
      return {
        eyes: s.eyes,
        eyeMove: s.eyeMove,
        sleepy: !duckTime && (sleepyFor >= SLEEPY_AFTER_S || closedLong),
        muscle: s.muscle,
      };
    },
  };
}
