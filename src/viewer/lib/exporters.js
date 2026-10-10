/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Export builders for the recording viewer (pure; the page turns the strings into local downloads).
import { BAND_NAMES, formatWall } from './csvParse.js';
import { rangeMean } from './series.js';

const f = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '');

/** One row per second in [a, b]: derived series averaged over that second. */
export function derivedCsv(rec, ana, a = 0, b = rec.meta.duration) {
  const cols = [];
  const add = (name, g, col, d) => { if (g?.cols?.[col]) cols.push({ name, g, col, d }); };
  for (const bn of BAND_NAMES) add(`${bn}_rel_mean`, ana.bandRel, `${bn}_mean`, 4);
  for (const bn of BAND_NAMES) add(`${bn}_abs_mean_bels`, ana.bandAbs, `${bn}_mean`, 4);
  add('faa_ln', ana.ratios, 'faa', 4);
  add('theta_beta', ana.ratios, 'thetaBeta', 3);
  add('theta_alpha', ana.ratios, 'thetaAlpha', 3);
  add('focus_beta_over_theta_alpha', ana.ratios, 'focus', 3);
  add('coherence_tp9_tp10_alpha', ana.coherence, 'coherence', 3);
  for (const s of ['TP9', 'AF7', 'AF8', 'TP10']) add(`paf_${s}_hz`, ana.paf, s, 2);
  add('heart_rate_bpm', rec.groups.hr, 'Heart_Rate', 1);
  if (ana.hrEstimate) cols.push({ name: 'heart_rate_est_bpm', g: { t: ana.hrEstimate.t, cols: { v: ana.hrEstimate.v } }, col: 'v', d: 1 });
  for (const k of ['hboL', 'hbrL', 'hboR', 'hbrR']) add(`fnirs_${k}`, ana.fnirs, k, 5);
  for (const s of ['TP9', 'AF7', 'AF8', 'TP10']) add(`artifact_${s}`, ana.artifacts, s, 0);
  add('moving', ana.motion, 'moving', 0);
  add('battery', rec.groups.battery, 'Battery', 1);
  const lines = [['time_s', 'wall_clock', ...cols.map((c) => c.name)].join(',')];
  for (let t = Math.floor(a); t < b; t++) {
    const row = [t, formatWall(rec.meta.startMs + t * 1000, { date: true })];
    for (const c of cols) {
      // held series (HR, battery) need the value in force, not only samples inside the second
      let v = rangeMean(c.g.t, c.g.cols[c.col], t, t + 1 - 1e-6);
      if (!Number.isFinite(v) && c.g.t.length && c.g.t[0] <= t) {
        let lo = 0, hi = c.g.t.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (c.g.t[m] <= t) lo = m + 1; else hi = m; }
        if (lo > 0 && t - c.g.t[lo - 1] < 5) v = c.g.cols[c.col][lo - 1];
      }
      row.push(f(v, c.d));
    }
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function eventsCsv(rec) {
  const lines = ['time_s,wall_clock,kind,text'];
  for (const e of rec.events) lines.push([e.t.toFixed(3), formatWall(rec.meta.startMs + e.t * 1000, { date: true, millis: true }), e.kind, `"${e.text.replace(/"/g, '""')}"`].join(','));
  return `${lines.join('\n')}\n`;
}

/** JSON-safe copy (NaN -> null, typed arrays dropped) */
export function summaryJson(rec, ana, summary, rangeSummary) {
  const clean = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? +v.toPrecision(6) : null;
    if (ArrayBuffer.isView(v)) return undefined;
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]).filter(([, x]) => x !== undefined));
    return v;
  };
  const m = rec.meta;
  return JSON.stringify(clean({
    file: m.fileName,
    start: formatWall(m.startMs, { date: true, millis: true }),
    duration_s: m.duration,
    rows: m.rows,
    sample_rate_hz: m.fs,
    gaps: rec.gaps.length,
    columns: m.columns,
    events: m.eventCounts,
    session: summary,
    view_range: rangeSummary,
    paf: ana.pafOverall ? { ...ana.pafOverall } : null,
  }), null, 2);
}
