/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Blink detector, one sample at a time (256 Hz). Pure JS so it can be replayed on recordings.
//
// mode 'any' (classic Muse, original Brain Arcade rule): peak-to-peak in the window >= minRangeUv
//   on any channel, then debounce.
// mode 'ears' (Muse S Athena): the Athena reference electrode sits mid-forehead (Fpz), right next to
//   AF7/AF8, so a blink nearly cancels on the forehead channels and shows on BOTH ear channels
//   (TP9/TP10) with the same sign. Measured 2026-10-09 (6 Hz low-pass, max over the 150 ms decide
//   window): blink = ears 60-150 µV in step, forehead at most ~30% of the ears (seen up to 0.29). Head turns move the ears in opposite directions or also move the forehead;
//   contact pops hit one channel alone. Both are rejected.

const FS = 256;

function makeLowpass(f0) {
  const w0 = (2 * Math.PI * f0) / FS;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, b2 = b0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

export class BlinkDetector {
  constructor(cfg) {
    this.cfg = cfg;
    this.win = Math.round((cfg.windowMs * FS) / 1000);
    this.reset();
    this.debug = { threshold: 0, earRange: 0, frontalRange: 0, peak: 0, quiet: 0, blinks: 0, rejected: 0, reason: '' };
  }

  reset() {
    this.n = 0; // samples seen
    this.buf = [[], [], [], []];
    this.lp = this.cfg.lowpassHz > 0 ? [0, 1, 2, 3].map(() => makeLowpass(this.cfg.lowpassHz)) : null;
    this.quiet = null;
    this.lastHit = -Infinity; // sample index of the last detection
    this.armed = true;
    this.cand = null; // event being measured before the decision
    this._peakAt = 0;
  }

  // Game restart: forget the last blink and any half-measured event, keep the learned quiet level
  softReset() {
    this.lastHit = -Infinity;
    this.armed = true;
    this.cand = null;
  }

  // sample: [TP9, AF7, AF8, TP10] in µV. Returns an event object on a blink, else null.
  push(sample) {
    const c = this.cfg;
    const n = this.n++;
    const ms = (n * 1000) / FS;
    const x = [0, 1, 2, 3].map((ch) => {
      const v = sample[ch] ?? 0;
      return this.lp ? this.lp[ch](v) : v;
    });
    for (let ch = 0; ch < 4; ch++) {
      const b = this.buf[ch];
      b.push(x[ch]);
      if (b.length > this.win) b.shift();
    }

    // Per-channel range and signed extreme in the window
    const range = [0, 0, 0, 0];
    const peak = [0, 0, 0, 0];
    for (let ch = 0; ch < 4; ch++) {
      let mn = Infinity, mx = -Infinity;
      for (const v of this.buf[ch]) { if (v < mn) mn = v; if (v > mx) mx = v; }
      range[ch] = mx - mn;
      peak[ch] = Math.abs(mx) >= Math.abs(mn) ? mx : mn;
    }
    const d = this.debug;

    if (c.mode !== 'ears') {
      // Original rule
      const hit = range.some((r) => r >= c.minRangeUv);
      d.threshold = c.minRangeUv;
      d.frontalRange = Math.max(range[1], range[2]);
      d.earRange = Math.max(range[0], range[3]);
      this._hold(Math.max(...range), ms);
      if (!hit || ms - (this.lastHit * 1000) / FS < c.debounceMs) return null;
      this.lastHit = n;
      d.blinks++;
      return { range, threshold: c.minRangeUv };
    }

    // --- Athena: both ears together ---
    const earMin = Math.min(range[0], range[3]);
    const earMax = Math.max(range[0], range[3]);
    const frontal = Math.max(range[1], range[2]);
    // Quiet level of the weaker ear (low-percentile tracker: falls in ~0.4 s, rises in ~8 s;
    // fast both ways during the first 2 s warm-up)
    const warm = ms < 2000;
    if (this.buf[0].length >= this.win) {
      const q = this.quiet;
      this.quiet = q == null ? earMin : q + (earMin - q) * (earMin < q ? 0.01 : warm ? 0.01 : 0.0005);
    }
    const threshold = Math.min(c.maxRangeUv, Math.max(c.minRangeUv, c.rangeFactor * (this.quiet ?? 0)));
    d.threshold = threshold;
    d.earRange = earMin;
    d.frontalRange = frontal;
    d.quiet = this.quiet ?? 0;
    this._hold(earMin, ms);
    if (warm) return null;

    const sinceMs = ((n - this.lastHit) * 1000) / FS;
    if (!this.armed) {
      // One count per blink: the ~0.5 s rebound must pass and the window must calm down first
      if (sinceMs >= c.refractoryMs && earMin < threshold) this.armed = true;
      return null;
    }
    // Start a candidate when the weaker ear crosses the threshold, then watch it for decideMs,
    // so the decision sees the whole event (a head turn may move the forehead a bit later)
    if (!this.cand) {
      if (earMin < threshold) return null;
      this.cand = { start: n, earMin: 0, earMax: 0, frontal: 0, opposite: 0, same: 0, threshold };
    }
    const k = this.cand;
    k.earMin = Math.max(k.earMin, earMin);
    k.earMax = Math.max(k.earMax, earMax);
    k.frontal = Math.max(k.frontal, frontal);
    if (Math.sign(peak[0]) === Math.sign(peak[3])) k.same++; else k.opposite++;
    if (((n - k.start) * 1000) / FS < c.decideMs) return null;
    this.cand = null;

    let reason = '';
    if (k.earMin < c.earAgreement * k.earMax) reason = 'one ear only';
    else if (k.opposite > k.same) reason = 'ears opposite (head turn)';
    else if (k.frontal > c.frontalMaxRatio * k.earMax) reason = 'forehead moved too (movement)';
    // Either way, wait for this event to pass before looking again
    this.armed = false;
    this.lastHit = n;
    if (reason) {
      d.rejected++;
      d.reason = reason;
      return null;
    }
    d.blinks++;
    d.reason = 'blink';
    return { range, earMin: k.earMin, earMax: k.earMax, frontal: k.frontal, threshold: k.threshold };
  }

  // Peak hold 1.5 s for the debug line
  _hold(v, ms) {
    const d = this.debug;
    if (v >= d.peak || ms - this._peakAt > 1500) {
      d.peak = v;
      this._peakAt = ms;
    }
  }
}
