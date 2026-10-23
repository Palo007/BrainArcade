/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: fNIRS (HbO/HbR replayed through lib/fnirs.js), heart rate, breathing + HRV (lib/pulseAnalysis.js),
// motion + battery, Mellow/Concentration.
import React, { useMemo } from 'react';
import { useT } from '../../lib/i18n.js';
import { TimeChart } from './TimeChart.jsx';
import { Toggle, Legend, Note, Stat, Seg } from './Panel.jsx';
import { THEME, smoothOpts } from './theme.js';
import { stripeLane, flagShade } from './lanes.js';
import { rangeStats, smoothSeries, fmt, fmtElapsed } from '../lib/series.js';
import { FNIRS_QUALITY } from '../lib/analysis.js';
import { hrvInRange, respirationInRange, HRV_MIN_FS, LFHF_MIN_S } from '../../lib/pulseAnalysis.js';

const HBO = '#FC8080', HBR = '#40C0FF';
const QCOL = { good: 'rgba(0,192,32,0.55)', calibrating: 'rgba(160,112,255,0.6)', motion: 'rgba(252,192,96,0.85)', 'no-light': 'rgba(252,128,128,0.85)', saturated: 'rgba(252,128,128,0.85)' };

export function FnirsViewerPanel({ vc }) {
  const t = useT();
  const { rec, ana, chart, cursor, runFnirs, busy } = vc;
  const f = ana.fnirs;
  const lanes = useMemo(() => {
    if (!f) return null;
    const side = (k, name) => ({
      label: t('viewer.fnirs.lane', { side: name }),
      includeZero: true,
      series: [
        { t: f.t, y: f.cols[`hbo${k}`], color: HBO, gap: 2, width: 1.5 },
        { t: f.t, y: f.cols[`hbr${k}`], color: HBR, gap: 2, width: 1.5 },
      ],
      weight: 2,
    });
    const q = (k) => ({ label: `Q ${k}`, t: f.t, y: f.cols[`qual${k}`], color: (v) => QCOL[FNIRS_QUALITY[v]] || null, end: rec.meta.duration });
    return [side('L', t('viewer.fnirs.left')), side('R', t('viewer.fnirs.right')), stripeLane([q('L'), q('R')], { weight: 0.5 })];
  }, [f, rec.meta.duration, t]);
  const shades = useMemo(() => {
    if (!f) return chart.shades;
    const end = Number.isFinite(f.baselineReadyAt) ? f.baselineReadyAt : f.t[f.n - 1];
    return [...(chart.shades || []), { a: f.baselineFrom, b: end, color: 'rgba(160,112,255,0.14)' }];
  }, [f, chart.shades]);
  if (!rec.groups.optics) return <Note>{t('viewer.fnirs.noOptics')}</Note>;
  if (!f) return <Note>{busy ? t('viewer.fnirs.replaying') : t('viewer.fnirs.tooFew')}</Note>;
  return (
    <>
      <div className="mb-1">
        <button type="button" className="retro-button text-[9px] px-2 py-1 mr-2 border-[var(--nes-purple)]" onClick={() => runFnirs(cursor)}>{t('viewer.fnirs.baseCursor')}</button>
        <button type="button" className="retro-button text-[9px] px-2 py-1 border-[var(--nes-gray)]" onClick={() => runFnirs(-Infinity)}>{t('viewer.fnirs.baseStart')}</button>
      </div>
      <Legend cursor={cursor} items={[
        { label: 'ΔHbO L', color: HBO, t: f.t, y: f.cols.hboL }, { label: 'ΔHbR L', color: HBR, t: f.t, y: f.cols.hbrL },
        { label: 'ΔHbO R', color: HBO, t: f.t, y: f.cols.hboR }, { label: 'ΔHbR R', color: HBR, t: f.t, y: f.cols.hbrR },
      ]} format={(v) => (Number.isFinite(v) ? v.toFixed(3) : '–')} />
      <TimeChart {...chart} shades={shades} cursor={cursor} lanes={lanes} height={250} title="fnirs" />
      <Note>
        {t('viewer.fnirs.note', { ch: f.channels, a: fmtElapsed(f.baselineFrom), b: fmtElapsed(f.baselineReadyAt) })}
      </Note>
    </>
  );
}

export function HeartPanel({ vc, hr }) {
  const t = useT();
  const { chart, cursor, view, prefs, setPref } = vc;
  const lanes = useMemo(() => (hr ? [{ label: hr.estimated ? t('viewer.hr.bpmEst') : t('viewer.hr.bpm'), series: [{ t: hr.t, y: smoothSeries(hr.t, hr.y, prefs.hrSmooth), color: '#FC8080', gap: 3, width: 1.5 }] }] : null), [hr, prefs.hrSmooth, t]);
  const st = useMemo(() => (hr ? rangeStats(hr.t, hr.y, view.t0, view.t1) : null), [hr, view.t0, view.t1]);
  if (!hr) return null;
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label={t('viewer.hr.mean')} value={`${fmt(st.mean, 0)} bpm`} color="var(--nes-red)" />
        <Stat label={t('viewer.hr.min')} value={fmt(st.min, 0)} />
        <Stat label={t('viewer.hr.max')} value={fmt(st.max, 0)} />
      </div>
      <Seg label={t('viewer.smooth')} value={prefs.hrSmooth} onChange={(v) => setPref('hrSmooth', v)} options={smoothOpts(t)} />
      <Legend cursor={cursor} items={[{ label: 'HR', color: '#FC8080', t: hr.t, y: hr.y }]} format={(v) => (Number.isFinite(v) ? `${v.toFixed(0)} bpm` : '–')} />
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={140} title="heart-rate" />
      <Note>{t('viewer.hr.note')}</Note>
    </>
  );
}

const BREATH = '#40C0FF', RMSSD = '#A070FF';

export function BreathHrvPanel({ vc }) {
  const t = useT();
  const { rec, ana, chart, cursor, view, prefs, setPref, busy } = vc;
  const p = ana.pulse;
  const src = !!prefs.breathSources;
  const lanes = useMemo(() => {
    if (!p) return null;
    const r = p.resp;
    const series = [{ t: r.t, y: r.v, color: BREATH, gap: 20, width: 2 }, { t: r.t, y: r.v, color: BREATH, dots: 4 }];
    if (src) {
      series.push({ t: r.t, y: r.rifv, color: '#FCC060', dots: 3 }, { t: r.t, y: r.riav, color: '#00C020', dots: 3 }, { t: r.t, y: r.riiv, color: '#909090', dots: 3 });
      if (r.summary.gyro) series.push({ t: r.t, y: r.gyro, color: '#FC8080', dots: 3 });
    }
    const out = [{ label: t('viewer.breath.laneBr'), series, weight: 1 }];
    if (p.rmssd) out.push({ label: t('viewer.breath.laneRmssd'), includeZero: true, series: [{ t: p.rmssd.t, y: p.rmssd.v, color: RMSSD, gap: 40, width: 2 }, { t: p.rmssd.t, y: p.rmssd.v, color: RMSSD, dots: 4 }], weight: 1 });
    return out;
  }, [p, src, t]);
  const inView = useMemo(() => (p ? { br: respirationInRange(p.resp, view.t0, view.t1), hrv: hrvInRange(p, view.t0, view.t1) } : null), [p, view.t0, view.t1]);
  if (!rec.groups.optics) return <Note>{t('viewer.breath.noOptics')}</Note>;
  if (!p) return <Note>{busy ? t('viewer.breath.analysing') : t('viewer.breath.noPulse')}</Note>;
  const s = p.resp.summary, h = p.hrv, v = inView;
  const ms = (x) => (Number.isFinite(x) ? `${x.toFixed(0)} ms` : '–');
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <Stat label={t('viewer.breath.session')} value={Number.isFinite(s.median) ? t('viewer.breath.perMin', { v: s.median.toFixed(1) }) : '–'} sub={t('viewer.breath.sessionSub', { q1: fmt(s.q1, 1), q3: fmt(s.q3, 1), a: s.accepted, w: s.windows })} color={BREATH} />
        <Stat label={t('viewer.breath.view')} value={Number.isFinite(v.br.median) ? t('viewer.breath.perMin', { v: v.br.median.toFixed(1) }) : '–'} sub={t('viewer.breath.windows', { a: v.br.accepted, w: v.br.windows })} color={BREATH} />
        {h ? (
          <>
            <Stat label={t('viewer.breath.rmssd')} value={ms(h.rmssd)} sub={t('viewer.breath.viewVal', { v: ms(v.hrv.rmssd) })} color={RMSSD} />
            <Stat label="SDNN · pNN50" value={`${ms(h.sdnn)} · ${fmt(h.pnn50, 0)}%`} sub={t('viewer.breath.viewVal', { v: `${ms(v.hrv.sdnn)} · ${fmt(v.hrv.pnn50, 0)}%` })} color={RMSSD} />
            <Stat label={t('viewer.breath.meanHr')} value={`${fmt(h.meanHR, 1)} bpm`} sub={t('viewer.breath.viewVal', { v: `${fmt(v.hrv.meanHR, 1)} bpm` })} color="var(--nes-red)" />
            <Stat label={t('viewer.breath.beatsUsed')} value={`${h.nn} / ${h.ibis}`} sub={t('viewer.breath.artifacts', { v: fmt(h.artifactPct, 1) })} />
            <Stat label={t('viewer.breath.opticsRate')} value={`${fmt(p.effFs, 1)} Hz`} sub={t('viewer.breath.clock', { v: p.timebase })} />
            <Stat label="LF/HF" value={Number.isFinite(h.lfhf) ? fmt(h.lfhf, 2) : '–'} sub={Number.isFinite(h.lfhf) ? t('viewer.breath.restOnly') : t('viewer.breath.needsMin', { n: LFHF_MIN_S / 60 })} />
          </>
        ) : (
          <>
            <Stat label="HRV" value={t('viewer.breath.unavailable')} sub={t('viewer.breath.opticsNeeds', { fs: fmt(p.effFs, 1), min: HRV_MIN_FS })} color="var(--nes-red)" />
            <Stat label={t('viewer.breath.beatsFound')} value={String(p.beats)} sub={t('viewer.breath.clock', { v: p.timebase })} />
          </>
        )}
      </div>
      {!h && <Note>{t('viewer.breath.hrvUnavail', { reason: p.hrvReasonCode === 'coarse' ? t('viewer.breath.reasonCoarse', { fs: fmt(p.effFs, 1), min: HRV_MIN_FS }) : p.hrvReasonCode === 'fewBeats' ? t('viewer.breath.reasonFew') : p.hrvReason })}</Note>}
      <Toggle on={src} onChange={(x) => setPref('breathSources', x)}>{t('viewer.breath.sources')}</Toggle>
      <Legend cursor={cursor} items={[
        { label: t('viewer.breath.legend'), color: BREATH, t: p.resp.t, y: p.resp.v, format: (x) => (Number.isFinite(x) ? `${x.toFixed(1)} /min` : '–') },
        ...(p.rmssd ? [{ label: 'RMSSD', color: RMSSD, t: p.rmssd.t, y: p.rmssd.v, format: (x) => ms(x) }] : []),
        ...(src ? [{ label: 'RIFV', color: '#FCC060' }, { label: 'RIAV', color: '#00C020' }, { label: 'RIIV', color: '#909090' }, ...(s.gyro ? [{ label: t('viewer.breath.headPitch'), color: '#FC8080' }] : [])] : []),
      ]} />
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={p.rmssd ? 220 : 120} title="breathing-hrv" />
      <Note>
        {t('viewer.breath.note', { fs: HRV_MIN_FS, min: LFHF_MIN_S / 60 })}
      </Note>
    </>
  );
}

export function MotionPanel({ vc }) {
  const t = useT();
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
    if (rec.groups.battery) out.push({ label: t('viewer.motion.battery'), weight: 0.6, series: [{ t: rec.groups.battery.t, y: rec.groups.battery.cols.Battery, color: '#00C020', step: true, end: rec.meta.duration }] });
    return out;
  }, [rec, ana.motion, xyz, t]);
  if (!lanes.length) return <Note>{t('viewer.motion.none')}</Note>;
  return (
    <>
      <Toggle on={!!xyz} onChange={(v) => setPref('motionXYZ', v)}>X / Y / Z</Toggle>
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={90 * lanes.length} title="motion" />
      <Note>{t('viewer.motion.note')}</Note>
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
