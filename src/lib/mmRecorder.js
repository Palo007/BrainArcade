/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Mind Monitor compatible CSV recorder (pure logic, no DOM, no React).
//
// Format: 61 columns, one row per raw EEG sample (256 Hz), slower streams are held
// (sample-and-hold). Like real Mind Monitor files, data rows have 60 fields (no trailing comma for
// the empty Elements column); event rows have 61 and fill only TimeStamp + Elements. See PLAN-muse-features.md.
//
// Column sources:
//   Delta..Gamma_*  absolute band power in Bels (log10 of µV² in the band), computed here from a
//                   sliding 256-sample window (mean removed, Hamming, FFT), updated about every
//                   100 ms. Empty until the first full window (1 s). Same maths as Mind Monitor,
//                   NOT BiomarkerContext (which is relative/smoothed).
//   RAW_*           µV, whatever the app feeds the EEG pipeline (Athena: 1 Hz high-pass + 50 Hz notch).
//   Optics1..8      samples[N-1] of the optics stream (p1034), Optics9..16 empty.
//   Accelerometer / Gyro  from the Athena acc/gyro stream when present, else empty.
//   HSI_*           1 good / 4 bad (the app has no "medium" level). HeadBandOn 1/0.
//   Battery         percent as reported by the headband.
//   AUX_1..4, Mellow, Concentration, Heart_Rate: always empty.

export const FS = 256;
export const COLUMNS = [
  'TimeStamp',
  ...['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].flatMap((b) => ['TP9', 'AF7', 'AF8', 'TP10'].map((c) => `${b}_${c}`)),
  'RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10',
  'AUX_1', 'AUX_2', 'AUX_3', 'AUX_4',
  'Mellow', 'Concentration',
  'Accelerometer_X', 'Accelerometer_Y', 'Accelerometer_Z',
  'Gyro_X', 'Gyro_Y', 'Gyro_Z',
  ...Array.from({ length: 16 }, (_, i) => `Optics${i + 1}`),
  'Heart_Rate', 'HeadBandOn',
  'HSI_TP9', 'HSI_AF7', 'HSI_AF8', 'HSI_TP10',
  'Battery', 'Elements',
];
export const HEADER = COLUMNS.join(',');

export const BANDS = [
  ['Delta', 1, 4],
  ['Theta', 4, 8],
  ['Alpha', 8, 13],
  ['Beta', 13, 30],
  ['Gamma', 30, 44],
];

const WIN = 256;
const BAND_EVERY = 26; // samples between band updates (~9.8 Hz)
const CHUNK_ROWS = 512; // ~2 s of data per sink write
const GAP_RESYNC_MS = 500; // wall clock persistently ahead of the sample clock by more than this -> jump (data really lost)
const GAP_WINDOW_ROWS = 128; // offset must stay above GAP_RESYNC_MS for this many rows to count as lost samples
const SLEW_MAX_MS = 1; // max clock correction per row (both directions)
const SLEW_GAIN = 0.0005;

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Local time `YYYY-MM-DD HH:MM:SS.mmm` */
export function formatTimestamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** `mindMonitor_YYYY-MM-DD--HH-MM-SS_brainarcade.csv` */
export function recordingFileName(ms) {
  const d = new Date(ms);
  return `mindMonitor_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}--${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_brainarcade.csv`;
}

// Plain decimals, never exponent notation; non-finite -> empty cell
const num = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
const emptyCells = (n) => ','.repeat(n - 1); // n empty fields joined = n-1 commas

// ---- FFT (radix-2, in place) ----
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const HAMMING = Float64Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));
const HAMMING_ENERGY = HAMMING.reduce((s, w) => s + w * w, 0);

/**
 * Absolute band powers in Bels for one 256-sample window (µV).
 * @param {ArrayLike<number>} x length 256
 * @returns {number[]} [delta, theta, alpha, beta, gamma] log10(µV²)
 */
export function bandPowerBels(x, fs = FS) {
  const re = new Float64Array(WIN), im = new Float64Array(WIN);
  let mean = 0;
  for (let i = 0; i < WIN; i++) mean += x[i];
  mean /= WIN;
  for (let i = 0; i < WIN; i++) re[i] = (x[i] - mean) * HAMMING[i];
  fft(re, im);
  const df = fs / WIN;
  const scale = 2 / (fs * HAMMING_ENERGY); // one-sided PSD, µV²/Hz
  return BANDS.map(([, lo, hi]) => {
    let p = 0;
    for (let k = Math.ceil(lo / df); k * df < hi && k < WIN / 2; k++) p += (re[k] * re[k] + im[k] * im[k]) * scale * df;
    return Math.log10(Math.max(p, 1e-12));
  });
}

export class MMRecorder {
  /**
   * @param {object} o
   * @param {(text:string)=>void} o.onChunk receives CSV text (header first), in order
   */
  constructor({ onChunk }) {
    this.onChunk = onChunk;
    this.rows = []; // pending lines
    this.nSamples = 0; // EEG rows written
    this.nEvents = 0;
    this.t0 = 0; // wall-clock ms of sample 0 (shifted on data gaps)
    this.startedAt = 0;
    this.started = false;
    this.ring = Array.from({ length: 4 }, () => new Float64Array(WIN));
    this.bandStr = emptyCells(20);
    this.optStr = emptyCells(16);
    this.accStr = emptyCells(3);
    this.gyroStr = emptyCells(3);
    this.hsiStr = '1,1,1,1';
    this.headOn = '1';
    this.battStr = '';
    this.sinceBand = 0;
    this.offMin = Infinity; // smallest (wall - sample clock) offset in the current window
    this.offRows = 0;
    this.offWall0 = 0;
  }

  start(nowMs = Date.now()) {
    this.started = true;
    this.startedAt = nowMs;
    this.t0 = nowMs;
    this.onChunk(HEADER + '\n');
  }

  /** @param {number[]} s [TP9, AF7, AF8, TP10] µV, one sample, in order */
  pushEeg(s, nowMs = Date.now()) {
    if (!this.started) return;
    const n = this.nSamples;
    let t = this.t0 + (n * 1000) / FS;
    const d = nowMs - t;
    // Background-tab bursts deliver late samples all at once (wall clock stands still, offset shrinks).
    // Only an offset that stays high while samples arrive at a normal pace means samples were lost.
    if (this.offRows === 0) this.offWall0 = nowMs;
    if (d < this.offMin) this.offMin = d;
    if (++this.offRows >= GAP_WINDOW_ROWS) {
      // wall time must have advanced about as fast as the samples (a burst arrives in ~0 ms)
      const paced = nowMs - this.offWall0 > (GAP_WINDOW_ROWS * 1000) / FS / 2;
      if (this.offMin > GAP_RESYNC_MS && paced) {
        this.t0 += this.offMin;
        t += this.offMin;
      }
      this.offMin = Infinity;
      this.offRows = 0;
    }
    // Otherwise slew slowly toward the wall clock (either direction, <= 1 ms per row)
    const slew = Math.max(-SLEW_MAX_MS, Math.min(SLEW_MAX_MS, d * SLEW_GAIN));
    this.t0 += slew;
    const slot = n % WIN;
    for (let c = 0; c < 4; c++) this.ring[c][slot] = Number.isFinite(s[c]) ? s[c] : 0;
    this.nSamples = n + 1;
    if (this.nSamples >= WIN && ++this.sinceBand >= BAND_EVERY) {
      this.sinceBand = 0;
      this._updateBands();
    }
    this.rows.push(
      `${formatTimestamp(t)},${this.bandStr},${num(s[0], 3)},${num(s[1], 3)},${num(s[2], 3)},${num(s[3], 3)},` +
      `,,,,,,${this.accStr},${this.gyroStr},${this.optStr},,${this.headOn},${this.hsiStr},${this.battStr}`
    );
    if (this.rows.length >= CHUNK_ROWS) this.flush();
  }

  _updateBands() {
    const cols = Array.from({ length: 5 }, () => []);
    for (let c = 0; c < 4; c++) {
      // unroll the ring into time order (oldest first)
      const x = new Float64Array(WIN);
      const start = this.nSamples % WIN;
      for (let i = 0; i < WIN; i++) x[i] = this.ring[c][(start + i) % WIN];
      const b = bandPowerBels(x);
      for (let k = 0; k < 5; k++) cols[k].push(num(b[k], 5));
    }
    this.bandStr = cols.flat().join(',');
  }

  /** @param {number[]} v optics samples (8 channels for p1034) -> Optics1..8, 9..16 empty */
  setOptics(v) {
    if (!v) return;
    const cells = [];
    for (let i = 0; i < 16; i++) cells.push(i < 8 && i < v.length ? num(v[i], 4) : '');
    this.optStr = cells.join(',');
  }

  /** acc in g, gyro in deg/s, each {x,y,z} (either may be missing) */
  setAccGyro({ acc, gyro }) {
    if (acc) this.accStr = [acc.x, acc.y, acc.z].map((v) => num(v, 6)).join(',');
    if (gyro) this.gyroStr = [gyro.x, gyro.y, gyro.z].map((v) => num(v, 6)).join(',');
  }

  /** hsi: 4 values (1 good / 2 medium / 4 bad); headOn: boolean */
  setQuality(hsi, headOn) {
    if (hsi) this.hsiStr = hsi.map((v) => (Number.isFinite(v) ? String(v) : '')).join(',');
    this.headOn = headOn ? '1' : '0';
  }

  setBattery(pct) {
    this.battStr = num(pct, 2);
  }

  /** Event row: only TimeStamp and Elements filled */
  event(text, nowMs = Date.now()) {
    if (!this.started) return;
    const clean = String(text).replace(/[\r\n,"]/g, ' ');
    // Never earlier than the last sample (mock replay can run ahead of the wall clock)
    const t = this.nSamples ? Math.max(nowMs, this.t0 + ((this.nSamples - 1) * 1000) / FS) : nowMs;
    this.rows.push(`${formatTimestamp(t)}${','.repeat(COLUMNS.length - 2)},${clean}`);
    this.nEvents++;
  }

  flush() {
    if (!this.rows.length) return;
    this.onChunk(this.rows.join('\n') + '\n');
    this.rows = [];
  }

  stop() {
    this.flush();
    this.started = false;
  }

  /** seconds of EEG written */
  get seconds() {
    return this.nSamples / FS;
  }
}
