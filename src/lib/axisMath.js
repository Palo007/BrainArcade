/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Pure maths for the joystick axes (contexts/JoystickContext.jsx). No React, so it can be tested in Node.
//
// r = ratio of a biomarker vs its baseline (1 = same as baseline).
// mapping 'linear': change = (r - 1) / range   (old behaviour, games are tuned to it)
// mapping 'log':    change = ln(r) / ln(1 + range)   (×1.6 and ÷1.6 give the same size of change)

export function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Signed change of r; ±1 at the edge of the range
export function change(r, range, mapping = 'linear') {
  return mapping === 'log' ? Math.log(r) / Math.log(1 + range) : (r - 1) / range;
}

// Two-sided axis: 0.5 at baseline, 0 / 1 at the edges of the range. No ratio (no baseline) → 0.5
export function centered01(r, { range = 0.4, mapping = 'linear' } = {}) {
  if (r == null) return 0.5;
  return clamp01(0.5 + 0.5 * change(r, range, mapping));
}

// One-sided axis: 0 at or below baseline, 1 at the top of the range. No ratio → 0
export function rise01(r, { range = 0.6, mapping = 'linear' } = {}) {
  if (r == null) return 0;
  return clamp01(change(r, range, mapping));
}

// Slow running level of a ratio, in log space. Returns r divided by that level, so a slow drift
// fades out and a change over seconds still shows. One tracker per axis AND biomarker: axes must
// not share state (a resting one-sided axis used to switch a shared tracker to its fast mode).
// A new baseline value restarts the tracker at 1. tauS = Infinity turns the drift fix off.
export function createDriftLevel() {
  let log = 0, t = null, base = null;
  return (r, baseline, nowMs, tauS) => {
    if (t === null || base !== baseline) { log = 0; t = nowMs; base = baseline; }
    const dt = Math.min(5, (nowMs - t) / 1000);
    t = nowMs;
    log += (Math.log(r) - log) * (1 - Math.exp(-dt / tauS));
    return r / Math.exp(log);
  };
}
