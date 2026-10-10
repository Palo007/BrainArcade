/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Streaming Mind Monitor CSV parser. Pure (no DOM, no Worker): used by viewer/csvWorker.js and
// tools/test-csvParse.mjs. Ported from Muse_Capture&Analysis mind_monitor_viewer/app.js (parseCsv),
// rewritten for 100+ MB files:
// - columns are looked up by header index (data rows have 60 fields, Elements rows 61 - row length is
//   never compared with the header length);
// - "YYYY-MM-DD HH:MM:SS.mmm" is parsed by hand (Date.parse rejects the space form in some engines);
//   values are kept as UTC fields, so wall-clock display is the recorded local time without TZ shifts;
// - sample-and-held streams (bands ~10 Hz, optics 64 Hz, acc/gyro, HSI, battery, HR) are stored only
//   when a value changes, so a 256 Hz file does not keep 26 copies of each band value;
// - Elements rows (markers, blinks, jaw clench, connect events) become an event list and do not break
//   the held values of the other columns.

export const SENSORS = ['TP9', 'AF7', 'AF8', 'TP10'];
export const BAND_NAMES = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

// Column groups: each group shares one time axis.
export const GROUPS = {
  raw: SENSORS.map((s) => `RAW_${s}`),
  bands: BAND_NAMES.flatMap((b) => SENSORS.map((s) => `${b}_${s}`)),
  acc: ['Accelerometer_X', 'Accelerometer_Y', 'Accelerometer_Z'],
  gyro: ['Gyro_X', 'Gyro_Y', 'Gyro_Z'],
  optics: Array.from({ length: 16 }, (_, i) => `Optics${i + 1}`),
  hr: ['Heart_Rate'],
  hsi: ['HeadBandOn', ...SENSORS.map((s) => `HSI_${s}`)],
  battery: ['Battery'],
  mm: ['Mellow', 'Concentration'],
};
// raw is stored for every data row; all others only on change
const HELD = Object.keys(GROUPS).filter((g) => g !== 'raw');
const EMPTY_HOLD_S = 0.5;

const TS_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d+))?/;

/** "YYYY-MM-DD HH:MM:SS.mmm" -> ms (UTC fields = recorded local time). Plain numbers = epoch seconds. NaN if unknown. */
export function parseTimestamp(s) {
  if (!s) return NaN;
  const m = TS_RE.exec(s);
  if (m) {
    const frac = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + frac;
  }
  const n = Number(s);
  if (Number.isFinite(n) && s.trim() !== '') return n > 1e11 ? n : n * 1000; // epoch ms or s
  return NaN;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** ms from parseTimestamp -> "HH:MM:SS" (or with date / ms) */
export function formatWall(ms, { date = false, millis = false } = {}) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const hms = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${millis ? `.${pad(d.getUTCMilliseconds(), 3)}` : ''}`;
  return date ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${hms}` : hms;
}

/** Quote-aware split of one CSV line (only used when the line contains a quote). */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Event kind from an Elements cell */
export function eventKind(text) {
  const s = text.toLowerCase();
  if (s.includes('/marker')) return 'marker';
  if (s.includes('blink')) return 'blink';
  if (s.includes('jaw')) return 'jaw';
  if (s.includes('connect')) return 'connect';
  if (s.includes('touching_forehead')) return 'forehead';
  return 'other';
}

class Grow {
  constructor(Type, cap = 1024) { this.Type = Type; this.a = new Type(cap); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  }
  done() { return this.a.slice(0, this.n); }
}

/**
 * Streaming parser. push(textChunk) any number of times, then finish() -> recording:
 * { meta, groups: { raw|bands|...: { t: Float64Array (s from first row), n, cols: { name: Float32Array } } }, events, gaps }
 * Empty cells are NaN. Columns without a single value are dropped; groups without columns are omitted.
 */
export function createCsvParser({ onRow } = {}) {
  let rest = '';
  let header = null;
  let idx = null; // column name -> index
  let tsIdx = -1;
  let elIdx = -1;
  let t0Ms = NaN;
  let lastMs = NaN;
  let rows = 0;
  let badTs = 0;
  let backSteps = 0;
  let firstLine = true;
  const events = [];
  const store = {}; // group -> { names, ix, t: Grow, cols: Grow[], prev: string[], any: bool[], empty: bool }

  const setupHeader = (cells) => {
    header = cells.map((c) => c.trim());
    idx = Object.fromEntries(header.map((h, i) => [h, i]));
    tsIdx = header.findIndex((h) => /^(timestamp|time)$/i.test(h));
    elIdx = header.indexOf('Elements');
    for (const [g, names] of Object.entries(GROUPS)) {
      const present = names.filter((n) => idx[n] !== undefined);
      if (!present.length) continue;
      store[g] = {
        names: present,
        ix: present.map((n) => idx[n]),
        t: new Grow(Float64Array, g === 'raw' ? 65536 : 4096),
        cols: present.map(() => new Grow(Float32Array, g === 'raw' ? 65536 : 4096)),
        prev: present.map(() => null),
        any: present.map(() => false),
        empty: true,
        pend: -1,
      };
    }
  };

  const line = (raw) => {
    let s = raw;
    if (s.charCodeAt(s.length - 1) === 13) s = s.slice(0, -1);
    if (firstLine) { firstLine = false; if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); }
    if (!s) return;
    const cells = s.includes('"') ? splitCsvLine(s) : s.split(',');
    if (!header) { setupHeader(cells); return; }
    rows++;
    let ms = tsIdx >= 0 ? parseTimestamp(cells[tsIdx]) : NaN;
    if (!Number.isFinite(ms)) { badTs++; ms = Number.isFinite(lastMs) ? lastMs + 1000 / 256 : 0; }
    if (!Number.isFinite(t0Ms)) t0Ms = ms;
    if (Number.isFinite(lastMs) && ms < lastMs) { backSteps++; ms = lastMs; } // keep time monotonic for binary search
    lastMs = ms;
    const t = (ms - t0Ms) / 1000;
    const el = elIdx >= 0 ? (cells[elIdx] || '').trim() : '';
    if (el) events.push({ t, text: el, kind: eventKind(el) });

    // Pure event rows (only TimeStamp + Elements): do not let their empty cells break held values
    const r = store.raw;
    let rawAny = false;
    if (r) for (let k = 0; k < r.ix.length; k++) if (cells[r.ix[k]]) { rawAny = true; break; }
    if (el && !rawAny) {
      let other = false;
      for (const g of HELD) {
        const st = store[g];
        if (!st) continue;
        for (let k = 0; k < st.ix.length; k++) if (cells[st.ix[k]]) { other = true; break; }
        if (other) break;
      }
      if (!other) return;
    }
    if (r && rawAny) {
      r.t.push(t);
      for (let k = 0; k < r.ix.length; k++) {
        const c = cells[r.ix[k]];
        const v = c ? +c : NaN;
        if (v === v) r.any[k] = true;
        r.cols[k].push(v);
      }
    }
    for (let gi = 0; gi < HELD.length; gi++) {
      const st = store[HELD[gi]];
      if (!st) continue;
      let changed = false;
      let allEmpty = true;
      for (let k = 0; k < st.ix.length; k++) {
        const c = cells[st.ix[k]] || '';
        if (c) allEmpty = false;
        if (c !== st.prev[k]) changed = true;
      }
      if (allEmpty) {
        // Streams written only on their own rows leave the cells empty in between: hold the value.
        // Empty for longer than EMPTY_HOLD_S = really no data (e.g. HR while the pulse is poor) -> NaN.
        if (!st.empty) {
          if (st.pend < 0) st.pend = t;
          else if (t - st.pend > EMPTY_HOLD_S) {
            st.t.push(st.pend);
            for (let k = 0; k < st.ix.length; k++) st.cols[k].push(NaN);
            st.empty = true;
            st.pend = -1;
          }
        }
        continue;
      }
      st.pend = -1;
      if (!changed && !st.empty) continue;
      st.t.push(t);
      for (let k = 0; k < st.ix.length; k++) {
        const c = cells[st.ix[k]] || '';
        st.prev[k] = c;
        const v = c ? +c : NaN;
        if (v === v) st.any[k] = true;
        st.cols[k].push(v);
      }
      st.empty = false;
    }
    if (onRow) onRow(rows);
  };

  return {
    push(chunk) {
      const text = rest + chunk;
      const parts = text.split('\n');
      rest = parts.pop();
      for (let i = 0; i < parts.length; i++) line(parts[i]);
    },
    finish() {
      if (rest) { line(rest); rest = ''; }
      if (!header) throw new Error('Empty file');
      if (tsIdx < 0) throw new Error('No TimeStamp column - not a Mind Monitor CSV');
      const groups = {};
      for (const [g, st] of Object.entries(store)) {
        const cols = {};
        st.names.forEach((n, k) => { if (st.any[k]) cols[n] = st.cols[k].done(); });
        if (!Object.keys(cols).length) continue;
        groups[g] = { t: st.t.done(), n: st.t.n, cols };
      }
      const timing = estimateTiming(groups.raw?.t);
      const duration = Number.isFinite(lastMs) ? (lastMs - t0Ms) / 1000 : 0;
      const counts = {};
      for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
      return {
        meta: {
          header,
          rows,
          startMs: t0Ms,
          endMs: lastMs,
          duration,
          fs: timing.fs,
          gapThreshold: timing.gapThreshold,
          badTimestamps: badTs,
          backSteps,
          eventCounts: counts,
          columns: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, Object.keys(v.cols)])),
        },
        groups,
        events,
        gaps: timing.gaps,
      };
    },
  };
}

/**
 * Effective raw sample rate = samples / time over contiguous runs (ms timestamps make the median dt
 * 4 ms = 250 Hz for 256 Hz data, so dt statistics are not used). Gaps = dt above the threshold.
 */
export function estimateTiming(t) {
  if (!t || t.length < 3) return { fs: NaN, gaps: [], gapThreshold: NaN };
  const n = t.length;
  let fs = (n - 1) / Math.max(1e-9, t[n - 1] - t[0]);
  let gaps = [];
  let thr = NaN;
  for (let pass = 0; pass < 2; pass++) {
    thr = Math.max(0.1, 10 / fs);
    gaps = [];
    let gapTime = 0;
    let gapCount = 0;
    for (let i = 1; i < n; i++) {
      const dt = t[i] - t[i - 1];
      if (dt > thr) { gaps.push([t[i - 1], t[i]]); gapTime += dt; gapCount++; }
    }
    const span = t[n - 1] - t[0] - gapTime;
    if (span > 0) fs = (n - 1 - gapCount) / span;
  }
  return { fs, gaps, gapThreshold: thr };
}

/** Parse a whole CSV string (tests / small files). */
export function parseCsvText(text) {
  const p = createCsvParser();
  p.push(text);
  return p.finish();
}

/** Transferable buffers of a parsed recording (for postMessage). */
export function transferList(rec) {
  const list = [];
  for (const g of Object.values(rec.groups)) {
    list.push(g.t.buffer);
    for (const c of Object.values(g.cols)) list.push(c.buffer);
  }
  return list;
}
