/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: band power timeline, raw EEG, signal quality, ratios.
import React, { useMemo } from 'react';
import { TimeChart } from './TimeChart.jsx';
import { Seg, Toggle, Legend, Note } from './Panel.jsx';
import { BAND_COLORS, SENSOR_COLORS, THEME, SMOOTH_OPTS, bandsGroupOf } from './theme.js';
import { stripeLane, flagShade } from './lanes.js';
import { smoothSeries, lowerBound } from '../lib/series.js';
import { SENSORS, BAND_NAMES } from '../lib/csvParse.js';

const SENSOR_OPTS = [['mean', 'MEAN'], ...SENSORS.map((s) => [s, s])];

export function BandsPanel({ vc }) {
  const { rec, ana, prefs, setPref, chart, cursor } = vc;
  const bands = bandsGroupOf(rec, ana);
  const mode = prefs.bandMode, sensor = prefs.bandSensor, smooth = prefs.smooth;
  const lanes = useMemo(() => {
    if (!bands || !ana.bandAbs) return null;
    const series = BAND_NAMES.filter((b) => prefs.bandsOn[b]).map((b) => {
      const key = `${b}_${sensor}`;
      const src = mode === 'rel' ? ana.bandRel.cols[key] : sensor === 'mean' ? ana.bandAbs.cols[key] : bands.cols[key];
      return src ? { t: bands.t, y: smoothSeries(bands.t, src, smooth), color: BAND_COLORS[b], label: b, gap: 2, width: 1.5 } : null;
    }).filter(Boolean);
    return [{
      series,
      includeZero: mode === 'rel',
      yFormat: mode === 'rel' ? (v) => `${Math.round(v * 100)}%` : undefined,
      label: mode === 'rel' ? 'relative power' : 'absolute power, log10 µV² (Bels)',
    }];
  }, [bands, ana.bandAbs, ana.bandRel, mode, sensor, smooth, prefs.bandsOn]);
  if (!bands) return <Note>No band power columns in this file.</Note>;
  if (!lanes) return <Note>Computing…</Note>;
  return (
    <>
      <div className="mb-1">
        <Seg label="SCALE" value={mode} onChange={(v) => setPref('bandMode', v)} options={[['rel', 'RELATIVE'], ['abs', 'ABSOLUTE']]} />
        <Seg label="SENSOR" value={sensor} onChange={(v) => setPref('bandSensor', v)} options={SENSOR_OPTS} />
        <Seg label="SMOOTH" value={smooth} onChange={(v) => setPref('smooth', v)} options={SMOOTH_OPTS} />
      </div>
      <div className="mb-1">
        {BAND_NAMES.map((b) => (
          <Toggle key={b} color={BAND_COLORS[b]} on={!!prefs.bandsOn[b]} onChange={(on) => setPref('bandsOn', { ...prefs.bandsOn, [b]: on })}>{b.toUpperCase()}</Toggle>
        ))}
      </div>
      <Legend cursor={cursor} items={lanes[0].series.map((s) => ({ ...s, format: mode === 'rel' ? (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '–') : undefined }))} />
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={190} title="bands" />
      <Note>
        {mode === 'abs'
          ? 'Absolute power as written by Mind Monitor: log10 of µV² (Bels, can be negative). MEAN = average of the 4 sensors in Bels (geometric mean of power).'
          : 'Relative power = band / sum of the 5 bands (linear power). MEAN sums the linear power of the 4 sensors first.'}
        {bands.derived ? ' Bands were computed from the raw EEG (the file has no band columns).' : ''}
      </Note>
    </>
  );
}

const SCALE_OPTS = [[25, '±25'], [50, '±50'], [100, '±100'], [200, '±200'], [500, '±500'], [1000, '±1000']];

export function RawPanel({ vc }) {
  const { rec, ana, prefs, setPref, chart, cursor, view } = vc;
  const raw = rec.groups.raw;
  const filt = prefs.rawFilter && ana.filtered;
  const scale = prefs.rawScale;
  const lanes = useMemo(() => {
    if (!raw) return null;
    return SENSORS.filter((s) => raw.cols[`RAW_${s}`]).map((s) => {
      const y = filt ? ana.filtered[s] : raw.cols[`RAW_${s}`];
      let c = 0;
      if (!filt) {
        // unfiltered Mind Monitor raw carries a DC offset (~800 µV): centre the lane on the visible mean
        const i0 = lowerBound(raw.t, view.t0), i1 = lowerBound(raw.t, view.t1);
        const st = Math.max(1, Math.floor((i1 - i0) / 5000));
        let sum = 0, cnt = 0;
        for (let i = i0; i < i1; i += st) { const v = y[i]; if (v === v) { sum += v; cnt++; } }
        c = cnt ? sum / cnt : 0;
      }
      const art = ana.artifacts;
      return {
        label: s,
        labelColor: SENSOR_COLORS[s],
        yRange: [c - scale, c + scale],
        yTicks: [c - scale / 2, c, c + scale / 2],
        yFormat: (v) => Math.round(v - c),
        series: [{ t: raw.t, y, n: raw.n, color: SENSOR_COLORS[s], gap: rec.meta.gapThreshold, width: 1 }],
        draw: art ? flagShade(art.t, art.cols[s], THEME.bad, 1) : undefined,
      };
    });
  }, [raw, filt, ana.filtered, ana.artifacts, scale, rec.meta.gapThreshold, view.t0, view.t1]);
  if (!raw) return <Note>No raw EEG (RAW_*) in this file.</Note>;
  return (
    <>
      <div className="mb-1">
        <Toggle on={!!prefs.rawFilter} onChange={(v) => setPref('rawFilter', v)}>1–45 HZ FILTER</Toggle>
        <Seg label="µV" value={scale} onChange={(v) => setPref('rawScale', v)} options={SCALE_OPTS} />
      </div>
      {prefs.rawFilter && !ana.filtered && <Note>Filter is being computed… showing unfiltered.</Note>}
      <Legend cursor={cursor} items={lanes.map((l) => ({ label: l.label, color: l.labelColor, t: raw.t, y: l.series[0].y }))} format={(v) => (Number.isFinite(v) ? `${v.toFixed(1)} µV` : '–')} />
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={60 * lanes.length + 30} title="raw-eeg" />
      <Note>
        Red = 1 s windows rejected as artifact (not finite, flat, railed or over 150 µV peak-to-peak after detrend; lib/paf.js).
        Grey = gap in the data, pink = headband off. Zero-phase band-pass (forward + backward), like filtfilt.
        {view.t1 - view.t0 > 60 ? ' Zoom in (< 60 s) to see single waves.' : ''}
      </Note>
    </>
  );
}

const hsiColor = (v) => (!(v === v) ? null : v <= 1 ? 'rgba(0,192,32,0.75)' : v <= 2 ? 'rgba(252,192,96,0.85)' : 'rgba(252,128,128,0.85)');

export function QualityPanel({ vc }) {
  const { rec, ana, chart, cursor } = vc;
  const lanes = useMemo(() => {
    const rows = [];
    const hsi = rec.groups.hsi;
    for (const s of SENSORS) if (hsi?.cols[`HSI_${s}`]) rows.push({ label: `HSI ${s}`, t: hsi.t, y: hsi.cols[`HSI_${s}`], color: hsiColor, end: rec.meta.duration });
    if (hsi?.cols.HeadBandOn) rows.push({ label: 'HEADBAND', t: hsi.t, y: hsi.cols.HeadBandOn, color: (v) => (v >= 1 ? 'rgba(0,192,32,0.6)' : v === 0 ? 'rgba(252,128,128,0.85)' : null), end: rec.meta.duration });
    const art = ana.artifacts;
    if (art) for (const s of SENSORS) rows.push({ label: `ART ${s}`, t: art.t, y: art.cols[s], color: (v) => (v === 1 ? 'rgba(252,128,128,0.85)' : 'rgba(0,192,32,0.35)'), end: rec.meta.duration });
    const mo = ana.motion;
    if (mo) rows.push({ label: 'MOVING', t: mo.t, y: mo.cols.moving, color: (v) => (v === 1 ? 'rgba(252,192,96,0.9)' : v === 0 ? 'rgba(0,192,32,0.35)' : null), end: rec.meta.duration });
    return rows.length ? [stripeLane(rows)] : null;
  }, [rec, ana.artifacts, ana.motion]);
  if (!lanes) return <Note>No quality information (HSI / HeadBandOn) in this file.</Note>;
  const rows = lanes[0].yRange[1];
  return (
    <>
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={rows * 16 + 26} title="quality" />
      <Note>HSI: green = good (1), yellow = medium (2), red = bad (4). ART = artifact per second. MOVING = accelerometer / gyro above threshold.</Note>
    </>
  );
}

const RATIOS = [
  ['alphaRel', 'ALPHA REL', 'Alpha relative power (mean of sensors)', '#00C020', (v) => `${Math.round(v * 100)}%`],
  ['faa', 'FAA', 'Frontal alpha asymmetry ln(AF8) − ln(AF7); > 0 = more right alpha', '#FCC060'],
  ['thetaBeta', 'θ/β', 'Theta / beta ratio (linear, mean of sensors)', '#40C0FF'],
  ['thetaAlpha', 'θ/α', 'Theta / alpha ratio', '#A070FF'],
  ['focus', 'FOCUS', 'Focus index β / (θ + α)', '#FC8080'],
  ['coherence', 'COH', 'TP9–TP10 alpha coherence (8–13 Hz, ~10 s Welch)', '#c0c0c0'],
];

export function RatiosPanel({ vc }) {
  const { ana, prefs, setPref, chart, cursor } = vc;
  const on = prefs.ratiosOn;
  const lanes = useMemo(() => {
    const out = [];
    for (const [k, short, , color, yFormat] of RATIOS) {
      if (!on[k]) continue;
      const g = k === 'coherence' ? ana.coherence : ana.ratios;
      const y = g?.cols[k];
      if (!y) continue;
      out.push({ label: short, labelColor: color, yFormat, includeZero: k === 'faa', series: [{ t: g.t, y: smoothSeries(g.t, y, prefs.ratioSmooth), color, gap: 3, width: 1.5 }] });
    }
    return out;
  }, [ana.ratios, ana.coherence, on, prefs.ratioSmooth]);
  return (
    <>
      <div className="mb-1">
        {RATIOS.map(([k, short, , color]) => <Toggle key={k} color={color} on={!!on[k]} onChange={(v) => setPref('ratiosOn', { ...on, [k]: v })}>{short}</Toggle>)}
        <Seg label="SMOOTH" value={prefs.ratioSmooth} onChange={(v) => setPref('ratioSmooth', v)} options={SMOOTH_OPTS} />
      </div>
      {lanes.length ? (
        <>
          <Legend cursor={cursor} items={lanes.map((l) => ({ label: l.label, color: l.labelColor, t: l.series[0].t, y: l.series[0].y, format: (v) => (Number.isFinite(v) ? (l.yFormat ? l.yFormat(v) : v.toFixed(2)) : '–') }))} />
          <TimeChart {...chart} cursor={cursor} lanes={lanes} height={80 * lanes.length + 20} title="ratios" />
        </>
      ) : <Note>{ana.ratios ? 'Choose a measure.' : 'Needs band powers.'}</Note>}
      <ul className="text-[9px] text-gray-400 mt-1 space-y-0.5">
        {RATIOS.filter(([k]) => on[k]).map(([k, short, desc]) => <li key={k}><span className="text-gray-200">{short}</span> – {desc}</li>)}
      </ul>
    </>
  );
}
