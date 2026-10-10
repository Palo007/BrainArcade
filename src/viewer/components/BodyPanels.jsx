/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: fNIRS (HbO/HbR replayed through lib/fnirs.js), heart rate, motion + battery, Mellow/Concentration.
import React, { useMemo } from 'react';
import { TimeChart } from './TimeChart.jsx';
import { Toggle, Legend, Note, Stat, Seg } from './Panel.jsx';
import { THEME, SMOOTH_OPTS } from './theme.js';
import { stripeLane, flagShade } from './lanes.js';
import { rangeStats, smoothSeries, fmt, fmtElapsed } from '../lib/series.js';
import { FNIRS_QUALITY } from '../lib/analysis.js';

const HBO = '#FC8080', HBR = '#40C0FF';
const QCOL = { good: 'rgba(0,192,32,0.55)', calibrating: 'rgba(160,112,255,0.6)', motion: 'rgba(252,192,96,0.85)', 'no-light': 'rgba(252,128,128,0.85)', saturated: 'rgba(252,128,128,0.85)' };

export function FnirsViewerPanel({ vc }) {
  const { rec, ana, chart, cursor, runFnirs, busy } = vc;
  const f = ana.fnirs;
  const lanes = useMemo(() => {
    if (!f) return null;
    const side = (k, name) => ({
      label: `${name} Δ µM`,
      includeZero: true,
      series: [
        { t: f.t, y: f.cols[`hbo${k}`], color: HBO, gap: 2, width: 1.5 },
        { t: f.t, y: f.cols[`hbr${k}`], color: HBR, gap: 2, width: 1.5 },
      ],
      weight: 2,
    });
    const q = (k) => ({ label: `Q ${k}`, t: f.t, y: f.cols[`qual${k}`], color: (v) => QCOL[FNIRS_QUALITY[v]] || null, end: rec.meta.duration });
    return [side('L', 'LEFT'), side('R', 'RIGHT'), stripeLane([q('L'), q('R')], { weight: 0.5 })];
  }, [f, rec.meta.duration]);
  const shades = useMemo(() => {
    if (!f) return chart.shades;
    const end = Number.isFinite(f.baselineReadyAt) ? f.baselineReadyAt : f.t[f.n - 1];
    return [...(chart.shades || []), { a: f.baselineFrom, b: end, color: 'rgba(160,112,255,0.14)' }];
  }, [f, chart.shades]);
  if (!rec.groups.optics) return <Note>No optics (fNIRS) columns in this file (needs a Muse S Athena recording).</Note>;
  if (!f) return <Note>{busy ? 'Replaying optics…' : 'Optics present but too few channels or no valid samples.'}</Note>;
  return (
    <>
      <div className="mb-1">
        <button type="button" className="retro-button text-[9px] px-2 py-1 mr-2 border-[var(--nes-purple)]" onClick={() => runFnirs(cursor)}>BASELINE AT CURSOR</button>
        <button type="button" className="retro-button text-[9px] px-2 py-1 border-[var(--nes-gray)]" onClick={() => runFnirs(-Infinity)}>BASELINE AT START</button>
      </div>
      <Legend cursor={cursor} items={[
        { label: 'ΔHbO L', color: HBO, t: f.t, y: f.cols.hboL }, { label: 'ΔHbR L', color: HBR, t: f.t, y: f.cols.hbrL },
        { label: 'ΔHbO R', color: HBO, t: f.t, y: f.cols.hboR }, { label: 'ΔHbR R', color: HBR, t: f.t, y: f.cols.hbrR },
      ]} format={(v) => (Number.isFinite(v) ? v.toFixed(3) : '–')} />
      <TimeChart {...chart} shades={shades} cursor={cursor} lanes={lanes} height={250} title="fnirs" />
      <Note>
        Replayed through lib/fnirs.js (outer optodes, modified Beer-Lambert, 0.2 Hz low-pass, {f.channels} channels). Values are changes against the
        baseline (purple: {fmtElapsed(f.baselineFrom)} – {fmtElapsed(f.baselineReadyAt)}, 5 s settle + 30 s still), µM with an assumed path length.
        Q: green good, purple calibrating, yellow motion, red no light / saturated.
      </Note>
    </>
  );
}

export function HeartPanel({ vc, hr }) {
  const { chart, cursor, view, prefs, setPref } = vc;
  const lanes = useMemo(() => (hr ? [{ label: hr.estimated ? 'BPM (estimated from optics)' : 'BPM (Heart_Rate)', series: [{ t: hr.t, y: smoothSeries(hr.t, hr.y, prefs.hrSmooth), color: '#FC8080', gap: 3, width: 1.5 }] }] : null), [hr, prefs.hrSmooth]);
  const st = useMemo(() => (hr ? rangeStats(hr.t, hr.y, view.t0, view.t1) : null), [hr, view.t0, view.t1]);
  if (!hr) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label="Mean (view)" value={`${fmt(st.mean, 0)} bpm`} color="var(--nes-red)" />
        <Stat label="Min" value={fmt(st.min, 0)} />
        <Stat label="Max" value={fmt(st.max, 0)} />
      </div>
      <Seg label="SMOOTH" value={prefs.hrSmooth} onChange={(v) => setPref('hrSmooth', v)} options={SMOOTH_OPTS} />
      <Legend cursor={cursor} items={[{ label: 'HR', color: '#FC8080', t: hr.t, y: hr.y }]} format={(v) => (Number.isFinite(v) ? `${v.toFixed(0)} bpm` : '–')} />
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={140} title="heart-rate" />
      <Note>Gaps = no reliable pulse at that time. Beat-to-beat (HRV) data is not in the CSV.</Note>
    </>
  );
}

export function MotionPanel({ vc }) {
  const { rec, ana, chart, cursor, prefs, setPref } = vc;
  const xyz = prefs.motionXYZ;
  const lanes = useMemo(() => {
    const out = [];
    const mo = ana.motion;
    const shade = mo ? flagShade(mo.t, mo.cols.moving, THEME.move, 1) : undefined;
    const add = (g, label, unit) => {
      if (!g) return;
      const cols = Object.values(g.cols);
      if (cols.length < 3) return;
      const series = xyz
        ? cols.map((y, i) => ({ t: g.t, y, color: ['#FC8080', '#00C020', '#40C0FF'][i], gap: 1 }))
        : [{ t: g.t, y: Float32Array.from(g.t, (_, i) => Math.hypot(cols[0][i], cols[1][i], cols[2][i])), color: '#FCC060', gap: 1 }];
      out.push({ label: `${label} ${unit}`, series, draw: shade });
    };
    add(rec.groups.acc, 'ACC', xyz ? 'x/y/z, g' : '|a|, g');
    add(rec.groups.gyro, 'GYRO', xyz ? 'x/y/z, °/s' : '|ω|, °/s');
    if (rec.groups.battery) out.push({ label: 'BATTERY %', weight: 0.6, series: [{ t: rec.groups.battery.t, y: rec.groups.battery.cols.Battery, color: '#00C020', step: true, end: rec.meta.duration }] });
    return out;
  }, [rec, ana.motion, xyz]);
  if (!lanes.length) return <Note>No accelerometer / gyro / battery data in this file.</Note>;
  return (
    <>
      <Toggle on={!!xyz} onChange={(v) => setPref('motionXYZ', v)}>X / Y / Z</Toggle>
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={90 * lanes.length} title="motion" />
      <Note>Yellow shading = moving (acc magnitude std over 1 s &gt; 0.05 g or mean gyro &gt; 15 °/s) - a cue for movement artifacts in the EEG.</Note>
    </>
  );
}

export function MmPanel({ vc }) {
  const { rec, chart, cursor } = vc;
  const g = rec.groups.mm;
  const lanes = useMemo(() => (g ? Object.entries(g.cols).map(([k, y], i) => ({ label: k, series: [{ t: g.t, y, color: i ? '#40C0FF' : '#00C020', gap: 2 }] })) : null), [g]);
  if (!g) return null;
  return <TimeChart {...chart} cursor={cursor} lanes={lanes} height={80 * lanes.length} title="mellow-concentration" />;
}
