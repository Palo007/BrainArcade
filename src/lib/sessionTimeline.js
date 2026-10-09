/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Per-session timeline for the parent report. Pure functions + one in-memory store, no React.
// One point per second while a game page is open: relative band powers (averaged over the 4
// channels), relative alpha per channel (topomap), the focus axis (0..1) and fNIRS ΔHbO (µM).
// Memory only: nothing is written to storage and no raw EEG is kept.

export const TIMELINE_BANDS = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
export const TIMELINE_CHANNELS = ['TP9', 'AF7', 'AF8', 'TP10'];
export const TIMELINE_MAX_POINTS = 3600; // 1 hour at 1 Hz

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

// bandPowers: [{delta,theta,alpha,beta,gamma} x 4 channels] (absolute) → relative values or null.
// Returns { bands: {delta..gamma} averaged over valid channels (sums to 1), alpha: [4 x rel alpha | null] }.
export function relativeBands(bandPowers) {
  if (!Array.isArray(bandPowers)) return null;
  const sums = Object.fromEntries(TIMELINE_BANDS.map((b) => [b, 0]));
  const alpha = [];
  let n = 0;
  for (let ch = 0; ch < 4; ch++) {
    const bp = bandPowers[ch];
    if (!bp) { alpha.push(null); continue; }
    let total = 0;
    for (const b of TIMELINE_BANDS) if (fin(bp[b]) && bp[b] > 0) total += bp[b];
    if (!(total > 0)) { alpha.push(null); continue; }
    for (const b of TIMELINE_BANDS) sums[b] += fin(bp[b]) && bp[b] > 0 ? bp[b] / total : 0;
    alpha.push(fin(bp.alpha) && bp.alpha > 0 ? bp.alpha / total : 0);
    n += 1;
  }
  if (!n) return null;
  const bands = {};
  for (const b of TIMELINE_BANDS) bands[b] = sums[b] / n;
  return { bands, alpha };
}

export class SessionTimeline {
  constructor(maxPoints = TIMELINE_MAX_POINTS) {
    this.maxPoints = maxPoints;
    this.points = [];
    this.t0 = null;
    this.ended = false;
    this.resetOnNextPush = false;
  }

  clear() {
    this.points = [];
    this.t0 = null;
    this.ended = false;
    this.resetOnNextPush = false;
  }

  // Freezes the timeline (the game is over): later pushes are ignored. Idempotent.
  end() {
    this.ended = true;
  }

  // Report closed (e.g. Play again): accept points again, starting a fresh timeline on the next push.
  reopen() {
    if (!this.ended) return;
    this.ended = false;
    this.resetOnNextPush = true;
  }

  // sample: { bandPowers, focus, hbo }; nowMs: wall clock. Returns true if a point was stored.
  push({ bandPowers, focus, hbo } = {}, nowMs = Date.now()) {
    if (this.ended) return false;
    const rel = relativeBands(bandPowers);
    if (!rel) return false; // no signal: no point (gap in the chart)
    if (this.resetOnNextPush) {
      this.points = [];
      this.t0 = null;
      this.resetOnNextPush = false;
    }
    if (this.t0 === null) this.t0 = nowMs;
    this.points.push({
      t: (nowMs - this.t0) / 1000,
      bands: rel.bands,
      alpha: rel.alpha,
      focus: fin(focus) ? Math.max(0, Math.min(1, focus)) : null,
      hbo: fin(hbo) ? hbo : null,
    });
    if (this.points.length > this.maxPoints) this.points.splice(0, this.points.length - this.maxPoints);
    return true;
  }

  // All stored points of this session (copy).
  all() {
    return this.points.slice();
  }

  // Points of the most recent `seconds` seconds (whole timeline when seconds is not a positive number).
  last(seconds) {
    const pts = this.points;
    if (!pts.length || !(seconds > 0)) return pts.slice();
    const from = pts[pts.length - 1].t - seconds;
    return pts.filter((p) => p.t >= from);
  }
}

// Shared instance: filled by the collector hook, read by the report components.
export const sessionTimeline = new SessionTimeline();

// Mean relative alpha per channel over points (null where no data).
export function meanAlphaByChannel(points) {
  const out = [];
  for (let ch = 0; ch < 4; ch++) {
    let s = 0;
    let n = 0;
    for (const p of points || []) {
      const v = p.alpha?.[ch];
      if (fin(v)) { s += v; n += 1; }
    }
    out.push(n ? s / n : null);
  }
  return out;
}
