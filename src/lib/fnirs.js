/* SPDX-License-Identifier: AGPL-3.0-or-later */
// fNIRS (functional near-infrared spectroscopy) for the Muse S Athena.
//
// The Athena shines 2 near-infrared wavelengths into the forehead and measures what comes back.
// Oxygenated (HbO) and deoxygenated (HbR) haemoglobin absorb them differently, so the change
// in light at both wavelengths gives the change in HbO/HbR (modified Beer-Lambert law).
//
// Channel layout (preset p1034 → 8 optics channels; p1035/p1045 → first 4 only), per OpenMuse/amused:
//   0 LO_NIR  1 RO_NIR  2 LO_IR  3 RO_IR  4 LI_NIR  5 RI_NIR  6 LI_IR  7 RI_IR
//   L/R = left/right forehead, O = outer (long path, reaches cortex), I = inner (short path, scalp/PPG)
//   NIR ≈ 730 nm, IR ≈ 850 nm (OpenMuse README; amused comments swap them — unverified).
// Only the outer channels are used for HbO/HbR. All results are RELATIVE to a baseline;
// absolute µM values depend on an assumed source-detector distance and DPF.
//
// Optics 16ch mode (p1041) is ignored: its channel order is disputed (OpenMuse issue #24).

export const OPTICS_FS = 64;

// Molar extinction coefficients, 1/(mM·cm), log10 basis (Prahl, OMLC tables)
const EPS = {
  730: { hbo: 0.39, hbr: 1.1022 },
  850: { hbo: 1.058, hbr: 0.69132 },
};
const SD_CM = 3.0; // assumed source-detector distance (outer optode)
const DPF = 6.0; // differential pathlength factor, typical adult forehead
const LOWPASS_HZ = 0.2; // removes heartbeat (~1 Hz) and breathing noise, keeps the slow haemodynamic response
const BASELINE_S = 10;
const HISTORY_HZ = 4;
const HISTORY_S = 60;
const FULL_SCALE = 2 ** 20 / 32768; // 20-bit sample after muse-jsx scale (1/32768)
const LOW_LIGHT = 0.005; // fraction of full scale → no skin contact
const HIGH_LIGHT = 0.98; // fraction of full scale → saturated
// Motion = fast light changes: RMS of the sample-to-sample ΔOD (heartbeat ≈ 0.001, head jerk ≈ 0.03+).
// A slow, lasting offset from the baseline is NOT motion.
const MOTION_RMS = 0.01;
const MOTION_ALPHA = 0.05; // EMA weight per sample (~0.3 s)

// Sides → [730 nm channel, 850 nm channel]
const SIDES = { left: [0, 2], right: [1, 3] };

function lowpass(f0, fs) {
  const w0 = (2 * Math.PI * f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0, b1 = (1 - cos) / a0, b2 = b0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const step = (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  step.reset = () => { x1 = x2 = y1 = y2 = 0; };
  return step;
}

// Solve ΔOD(730), ΔOD(850) → ΔHbO, ΔHbR in µM
function mbll(od730, od850) {
  const L = SD_CM * DPF;
  const a = EPS[730].hbo * L, b = EPS[730].hbr * L;
  const c = EPS[850].hbo * L, d = EPS[850].hbr * L;
  const det = a * d - b * c;
  return {
    hbo: ((d * od730 - b * od850) / det) * 1000,
    hbr: ((a * od850 - c * od730) / det) * 1000,
  };
}

const emptySide = () => ({ hbo: 0, hbr: 0, level: 0, quality: 'waiting' });

export class FnirsProcessor {
  constructor({ fs = OPTICS_FS } = {}) {
    this.fs = fs;
    this.samples = 0;
    this.channels = 0;
    this.history = []; // [{ t, l: {hbo,hbr}, r: {hbo,hbr} }]
    this.resetBaseline();
  }

  resetBaseline() {
    this._sum = [0, 0, 0, 0];
    this._n = 0;
    this._i0 = null;
    this._lp = Array.from({ length: 4 }, () => lowpass(LOWPASS_HZ, this.fs));
    this._diffSq = [0, 0, 0, 0]; // EMA of (sample-to-sample ΔOD)² = fast-change (motion) estimate
    this._lastLevel = [0, 0, 0, 0];
    this.history = [];
    this.current = { left: emptySide(), right: emptySide() };
  }

  get baselineProgress() {
    return this._i0 ? 1 : Math.min(1, this._n / (BASELINE_S * this.fs));
  }

  get baselineReady() {
    return !!this._i0;
  }

  // One optics sample: array of 4 / 8 / 16 values (64 Hz)
  push(sample) {
    if (!sample || sample.length < 4 || sample.length > 8) return;
    this.channels = sample.length;
    this.samples++;
    const raw = [sample[0], sample[1], sample[2], sample[3]];
    for (let ch = 0; ch < 4; ch++) {
      const prev = this._lastLevel[ch];
      const d = raw[ch] > 0 && prev > 0 ? Math.log10(raw[ch] / prev) : 0;
      this._diffSq[ch] += (d * d - this._diffSq[ch]) * MOTION_ALPHA;
      this._lastLevel[ch] = raw[ch];
    }

    if (!this._i0) {
      this._updateQuality();
      const q = [this.current.left.quality, this.current.right.quality];
      if (q.includes('motion')) {
        // Moved during calibration → start the baseline again so it is not skewed
        this._sum = [0, 0, 0, 0];
        this._n = 0;
      } else if (!q.includes('no-light') && !q.includes('saturated')) {
        for (let ch = 0; ch < 4; ch++) this._sum[ch] += raw[ch];
        this._n++;
        if (this._n >= BASELINE_S * this.fs) {
          this._i0 = this._sum.map((s) => s / this._n);
          this._updateQuality();
        }
      }
      return;
    }

    const od = raw.map((v, ch) => {
      const x = v > 0 && this._i0[ch] > 0 ? -Math.log10(v / this._i0[ch]) : 0;
      return this._lp[ch](x);
    });

    for (const [side, [c730, c850]] of Object.entries(SIDES)) {
      const { hbo, hbr } = mbll(od[c730], od[c850]);
      Object.assign(this.current[side], { hbo, hbr });
    }
    this._updateQuality();

    if (this.samples % Math.round(this.fs / HISTORY_HZ) === 0) {
      const { left, right } = this.current;
      this.history.push({
        t: Date.now(),
        l: { hbo: left.hbo, hbr: left.hbr },
        r: { hbo: right.hbo, hbr: right.hbr },
      });
      if (this.history.length > HISTORY_HZ * HISTORY_S) this.history.shift();
    }
  }

  _updateQuality() {
    for (const [side, chs] of Object.entries(SIDES)) {
      const level = Math.min(...chs.map((ch) => this._lastLevel[ch])) / FULL_SCALE;
      const maxLevel = Math.max(...chs.map((ch) => this._lastLevel[ch])) / FULL_SCALE;
      const motion = Math.max(...chs.map((ch) => Math.sqrt(this._diffSq[ch])));
      let quality = 'good';
      if (level < LOW_LIGHT) quality = 'no-light';
      else if (maxLevel > HIGH_LIGHT) quality = 'saturated';
      else if (motion > MOTION_RMS) quality = 'motion';
      else if (!this._i0) quality = 'calibrating';
      this.current[side].level = level;
      this.current[side].quality = quality;
    }
  }

  // Cheap live read for joystick axes: oxygenation index + whether it can be trusted right now
  index() {
    const { left, right } = this.current;
    const bad = [left.quality, right.quality].some((q) => q === 'motion' || q === 'no-light' || q === 'saturated');
    return {
      ready: this.baselineReady,
      bad,
      oxy: (left.hbo - left.hbr + right.hbo - right.hbr) / 2,
    };
  }

  // Plain snapshot for React state
  snapshot() {
    const { left, right } = this.current;
    return {
      available: this.samples > 0,
      channels: this.channels,
      baselineReady: this.baselineReady,
      baselineProgress: this.baselineProgress,
      left: { ...left },
      right: { ...right },
      // Oxygenation index: ΔHbO − ΔHbR averaged over both sides (higher ≈ more frontal activation)
      oxy: (left.hbo - left.hbr + right.hbo - right.hbr) / 2,
      history: this.history.slice(),
    };
  }
}

// Synthetic optics for mock mode: slow HbO rise/fall + heartbeat, so the dashboards can be tested
export function startMockOptics(processor) {
  const t0 = performance.now();
  let n = 0;
  const id = setInterval(() => {
    const now = (performance.now() - t0) / 1000;
    while (n / OPTICS_FS < now) {
      const t = n / OPTICS_FS;
      const act = Math.sin((2 * Math.PI * t) / 30) * 0.004; // ±ΔOD-ish activation, 30 s period
      const pulse = Math.sin(2 * Math.PI * 1.1 * t) * 0.002;
      const noise = () => (Math.random() - 0.5) * 0.001;
      const i730 = 8 * 10 ** -(-0.6 * act + pulse + noise()); // HbR falls → 730 nm brightens
      const i850 = 9 * 10 ** -(0.9 * act + pulse + noise()); // HbO rises → 850 nm darkens
      processor.push([i730, i730 * 0.97, i850, i850 * 1.02, 12, 12, 13, 13]);
      n++;
    }
  }, 100);
  return () => clearInterval(id);
}
