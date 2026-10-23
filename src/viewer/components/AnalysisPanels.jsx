/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: peak alpha frequency (PAF) over time + histogram, PSD of the visible range, spectrogram.
import React, { useEffect, useMemo, useRef } from 'react';
import { useT } from '../../lib/i18n.js';
import { TimeChart } from './TimeChart.jsx';
import { Seg, Toggle, Legend, Note, Stat } from './Panel.jsx';
import { SENSOR_COLORS, THEME, smoothOpts, useWidth } from './theme.js';
import { spectrogramDraw, heatGradient } from './lanes.js';
import { smoothSeries, quantiles, fmt, pct, niceTicks } from '../lib/series.js';
import { SENSORS } from '../lib/csvParse.js';
import { ALPHA_ZONES, rangePsd, pafMetrics, SPEC_MAX_HZ } from '../lib/analysis.js';
import { BANDS } from '../../lib/signal.js';

const ZONE_BANDS = [
  { lo: ALPHA_ZONES.slow[0], hi: ALPHA_ZONES.slow[1], color: 'rgba(64,192,255,0.10)' },
  { lo: ALPHA_ZONES.fast[0], hi: ALPHA_ZONES.fast[1], color: 'rgba(252,192,96,0.10)' },
];
const PAF_METHODS = {
  whitened: { label: 'viewer.paf.mWhitened', opts: null },
  c1: { label: 'viewer.paf.mC1', opts: { windowS: 1, stepS: 0.1, pad: 4 } },
  c4: { label: 'viewer.paf.mC4', opts: { windowS: 4, stepS: 1, pad: 1 } },
};
const SHOW = [...SENSORS, 'balance'];

function useCanvas(draw, deps, height) {
  const wrap = useRef(null);
  const cv = useRef(null);
  const W = useWidth(wrap);
  useEffect(() => {
    const c = cv.current;
    if (!c || W < 50) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(height * dpr);
    c.style.width = `${W}px`; c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = THEME.bg; ctx.fillRect(0, 0, W, height);
    ctx.font = '10px ui-monospace, monospace';
    draw(ctx, W, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, height, ...deps]);
  return { wrap, cv };
}

function Histogram({ series, range, view }) {
  const t = useT();
  const [lo, hi] = range;
  const step = 0.25;
  const nb = Math.round((hi - lo) / step);
  const { post, front } = useMemo(() => {
    const p = new Array(nb).fill(0), f = new Array(nb).fill(0);
    if (series) for (let i = 0; i < series.n; i++) {
      if (series.t[i] < view.t0 || series.t[i] > view.t1) continue;
      for (const s of SENSORS) {
        const v = series.cols[s][i];
        if (!(v >= lo && v < hi)) continue;
        const b = Math.floor((v - lo) / step);
        (s === 'TP9' || s === 'TP10' ? p : f)[b]++;
      }
    }
    return { post: p, front: f };
  }, [series, view.t0, view.t1, lo, hi, nb]);
  const H = 120;
  const { wrap, cv } = useCanvas((ctx, W) => {
    const x0 = 40, x1 = W - 6, y0 = 6, y1 = H - 16;
    const max = Math.max(1, ...post, ...front);
    const X = (f) => x0 + ((f - lo) / (hi - lo)) * (x1 - x0);
    for (const z of ZONE_BANDS) { ctx.fillStyle = z.color; ctx.fillRect(X(z.lo), y0, X(z.hi) - X(z.lo), y1 - y0); }
    const bw = (x1 - x0) / nb;
    for (let b = 0; b < nb; b++) {
      const hp = (post[b] / max) * (y1 - y0), hf = (front[b] / max) * (y1 - y0);
      ctx.fillStyle = 'rgba(64,192,255,0.85)'; ctx.fillRect(x0 + b * bw + 1, y1 - hp, bw / 2 - 1, hp);
      ctx.fillStyle = 'rgba(0,192,32,0.85)'; ctx.fillRect(x0 + b * bw + bw / 2, y1 - hf, bw / 2 - 1, hf);
    }
    ctx.fillStyle = THEME.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let f = Math.ceil(lo); f <= hi; f++) ctx.fillText(String(f), X(f), y1 + 3);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(max), x0 - 4, y0 + 4); ctx.fillText('0', x0 - 4, y1);
    ctx.strokeStyle = THEME.frame; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  }, [post, front, lo, hi, nb], H);
  return (
    <div>
      <div className="text-[9px] text-gray-400 mb-1">
        {t('viewer.paf.histo')}: <span className="text-[var(--nes-blue)]">{t('viewer.paf.histoPost')}</span> · <span className="text-[var(--nes-green)]">{t('viewer.paf.histoFront')}</span>
      </div>
      <div ref={wrap} className="w-full" style={{ height: H }}><canvas ref={cv} data-export="paf-histogram" /></div>
    </div>
  );
}

export function PafPanel({ vc }) {
  const t = useT();
  const { rec, ana, prefs, setPref, chart, cursor, view, classic, runClassic, busy } = vc;
  const method = prefs.pafMethod;
  const series = method === 'whitened' ? ana.paf : classic[method];
  useEffect(() => {
    if (method !== 'whitened' && !(method in classic) && rec.meta.dspAvailable && ana.paf) runClassic(method, PAF_METHODS[method].opts);
  }, [method, classic, runClassic, rec.meta.dspAvailable, ana.paf]);
  const range = useMemo(() => series?.range || [6, 13], [series]);
  const lanes = useMemo(() => {
    if (!series) return null;
    const sm = prefs.pafSmooth;
    const ser = [];
    for (const s of SENSORS) {
      if (!prefs.pafShow[s]) continue;
      const y = series.cols[s];
      ser.push({ t: series.t, y, color: SENSOR_COLORS[s], dots: 2, label: s });
      if (sm) ser.push({ t: series.t, y: smoothSeries(series.t, y, sm), color: SENSOR_COLORS[s], gap: Math.max(10, sm), width: 2 });
    }
    const out = [{ label: t('viewer.paf.laneAlpha'), yRange: [range[0] - 0.25, range[1] + 0.5], hBands: ZONE_BANDS, series: ser, weight: 2 }];
    if (prefs.pafShow.balance) {
      const n = series.n;
      const bal = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const c = series.cols;
        bal[i] = (c.TP10[i] + c.AF8[i]) / 2 - (c.TP9[i] + c.AF7[i]) / 2;
      }
      out.push({ label: t('viewer.paf.laneBalance'), includeZero: true, series: [{ t: series.t, y: smoothSeries(series.t, bal, sm || 10), color: '#FCC060', gap: 20, width: 1.5 }] });
    }
    if (series.cols.TP9_db && prefs.pafShow.power) {
      out.push({ label: t('viewer.paf.lanePower'), series: SENSORS.filter((s) => prefs.pafShow[s]).map((s) => ({ t: series.t, y: smoothSeries(series.t, series.cols[`${s}_db`], sm), color: SENSOR_COLORS[s], gap: 5 })) });
    }
    return out;
  }, [series, prefs.pafShow, prefs.pafSmooth, range, t]);
  const m = useMemo(() => (series ? pafMetrics(series, view.t0, view.t1) : null), [series, view.t0, view.t1]);
  const o = ana.pafOverall;
  if (!rec.meta.dspAvailable) return <Note>{t('viewer.needsRaw100')}</Note>;
  return (
    <>
      <div className="mb-1">
        <Seg label={t('viewer.paf.method')} value={method} onChange={(v) => setPref('pafMethod', v)} options={Object.entries(PAF_METHODS).map(([k, v]) => [k, t(v.label)])} />
        <Seg label={t('viewer.smooth')} value={prefs.pafSmooth} onChange={(v) => setPref('pafSmooth', v)} options={smoothOpts(t)} />
      </div>
      <div className="mb-1">
        {SHOW.map((s) => <Toggle key={s} color={SENSOR_COLORS[s] || '#FCC060'} on={!!prefs.pafShow[s]} onChange={(v) => setPref('pafShow', { ...prefs.pafShow, [s]: v })}>{s === 'balance' ? t('viewer.paf.balance') : s.toUpperCase()}</Toggle>)}
        {method !== 'whitened' && <Toggle color="#c0c0c0" on={!!prefs.pafShow.power} onChange={(v) => setPref('pafShow', { ...prefs.pafShow, power: v })}>{t('viewer.paf.power')}</Toggle>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <Stat label={t('viewer.paf.session')} value={o?.found ? `${o.paf.toFixed(2)} Hz` : o ? t('viewer.paf.noPeak') : '…'} sub={o?.found ? t('viewer.paf.sessionSub', { source: o.source, conf: pct(o.confidence), lo: fmt(o.pafLo, 1), hi: fmt(o.pafHi, 1) }) : 'lib/paf.js computePaf'} />
        <Stat label={t('viewer.paf.posteriorView')} value={`${fmt(m?.posteriorMean)} Hz`} sub={t('viewer.paf.postSub', { sd: fmt(m?.posteriorStd), med: fmt(m?.posteriorMedian), n: m?.nPosterior ?? 0 })} color="var(--nes-blue)" />
        <Stat label={t('viewer.paf.frontalView')} value={`${fmt(m?.frontalMean)} Hz`} sub={t('viewer.paf.nSub', { n: m?.nFrontal ?? 0 })} color="var(--nes-green)" />
        <Stat label={t('viewer.paf.allView')} value={`${fmt(m?.globalMean)} Hz`} sub={o?.cog ? t('viewer.paf.cog', { v: o.cog.toFixed(2) }) : ''} />
      </div>
      {!series ? <Note>{busy ? t('viewer.paf.computing') : t('viewer.paf.none')}</Note> : (
        <>
          <Legend cursor={cursor} items={SENSORS.filter((s) => prefs.pafShow[s]).map((s) => ({ label: s, color: SENSOR_COLORS[s], t: series.t, y: series.cols[s] }))} />
          <TimeChart {...chart} cursor={cursor} lanes={lanes} height={150 + (lanes.length - 1) * 70} title="paf" />
          <Histogram series={series} range={range} view={view} />
        </>
      )}
      <Note>
        {method === 'whitened' ? t('viewer.paf.noteWhitened') : t('viewer.paf.noteFft')}
        {' '}{t('viewer.paf.noteZones')}
      </Note>
    </>
  );
}

function PsdChart({ psd, paf }) {
  const H = 170;
  const { wrap, cv } = useCanvas((ctx, W) => {
    if (!psd) return;
    const x0 = 40, x1 = W - 6, y0 = 6, y1 = H - 16;
    const fLo = 1, fHi = SPEC_MAX_HZ;
    let lo = Infinity, hi = -Infinity;
    for (const s of SENSORS) {
      const a = psd.ch[s];
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        if (psd.freqs[k] < fLo) continue;
        const v = Math.log10(a[k]);
        if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }
    }
    if (!(hi > lo)) return;
    lo = Math.floor(lo * 2) / 2; hi = Math.ceil(hi * 2) / 2;
    const X = (f) => x0 + ((f - fLo) / (fHi - fLo)) * (x1 - x0);
    const Y = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
    for (const z of ZONE_BANDS) { ctx.fillStyle = z.color.replace('0.10', '0.18'); ctx.fillRect(X(z.lo), y0, X(z.hi) - X(z.lo), y1 - y0); }
    ctx.strokeStyle = THEME.grid; ctx.fillStyle = THEME.axis;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const [name, [a]] of Object.entries(BANDS)) {
      if (a < fLo) continue;
      const x = Math.round(X(a)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      ctx.fillText(name[0].toUpperCase(), x + 6, y0 + 2);
    }
    for (const f of [1, 4, 8, 13, 20, 30, 45]) ctx.fillText(String(f), X(f), y1 + 3);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of niceTicks(lo, hi, 3)) { ctx.fillText(`1e${v}`, x0 - 3, Y(v)); ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke(); }
    for (const s of SENSORS) {
      const a = psd.ch[s];
      if (!a) continue;
      ctx.strokeStyle = SENSOR_COLORS[s]; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < a.length; k++) {
        const f = psd.freqs[k];
        if (f < fLo || f > fHi) continue;
        const v = Math.log10(a[k]);
        if (!Number.isFinite(v)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(f), Y(v)); else ctx.moveTo(X(f), Y(v));
        pen = true;
      }
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    if (Number.isFinite(paf)) {
      ctx.strokeStyle = '#ffffff'; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(X(paf), y0); ctx.lineTo(X(paf), y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`PAF ${paf.toFixed(2)}`, X(paf) + 3, y0 + 14);
    }
    ctx.strokeStyle = THEME.frame; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
  }, [psd, paf], H);
  return <div ref={wrap} className="w-full" style={{ height: H }}><canvas ref={cv} data-export="psd" /></div>;
}

export function SpectrumPanel({ vc }) {
  const t = useT();
  const { rec, ana, prefs, setPref, chart, cursor, view } = vc;
  const spec = ana.spectrogram;
  const psd = useMemo(() => (spec ? rangePsd(spec, view.t0, view.t1) : null), [spec, view.t0, view.t1]);
  const ch = prefs.specChannel;
  const getFrame = useMemo(() => {
    if (!spec) return null;
    const nb = spec.nBins;
    if (ch !== 'mean') return (f) => (spec.clean[ch][f] ? spec.power[ch].subarray(f * nb, f * nb + nb) : null);
    const buf = new Float32Array(nb);
    return (f) => {
      let c = 0;
      buf.fill(0);
      for (const s of SENSORS) {
        if (!spec.clean[s][f]) continue;
        c++;
        const p = spec.power[s];
        for (let k = 0; k < nb; k++) buf[k] += p[f * nb + k];
      }
      if (!c) return null;
      for (let k = 0; k < nb; k++) buf[k] /= c;
      return buf;
    };
  }, [spec, ch]);
  const colorRange = useMemo(() => {
    if (!spec || !getFrame) return [0, 1];
    const vals = [];
    const st = Math.max(1, Math.floor(spec.n / 400));
    for (let f = 0; f < spec.n; f += st) {
      const fr = getFrame(f);
      if (!fr) continue;
      for (let k = 1; k < fr.length; k += 2) if (fr[k] > 0) vals.push(Math.log10(fr[k]));
    }
    const [a, b] = quantiles(vals, [0.02, 0.98]);
    return Number.isFinite(a) && b > a ? [a, b] : [0, 1];
  }, [spec, getFrame]);
  const lanes = useMemo(() => {
    if (!spec) return null;
    return [{ label: t('viewer.spec.lane', { ch }), yRange: [spec.df, Math.min(SPEC_MAX_HZ, spec.nBins * spec.df)], yTicks: [4, 8, 13, 30], yFormat: (v) => v.toFixed(0), series: [], draw: spectrogramDraw(spec, getFrame, colorRange, SPEC_MAX_HZ) }];
  }, [spec, ch, getFrame, colorRange, t]);
  const paf = ana.pafOverall?.found ? ana.pafOverall.paf : NaN;
  if (!rec.meta.dspAvailable) return <Note>{t('viewer.needsRaw100')}</Note>;
  if (!spec) return <Note>{t('viewer.spec.computing')}</Note>;
  return (
    <>
      <div className="text-[9px] text-gray-400 mb-1">{t('viewer.spec.title', { n: psd?.frames || 0 })}</div>
      <Legend items={SENSORS.map((s) => ({ label: s, color: SENSOR_COLORS[s] }))} />
      <PsdChart psd={psd} paf={paf} />
      <div className="mt-2 mb-1">
        <Seg label={t('viewer.spec.seg')} value={ch} onChange={(v) => setPref('specChannel', v)} options={[...SENSORS.map((s) => [s, s]), ['mean', t('viewer.eeg.mean')]]} />
      </div>
      <TimeChart {...chart} cursor={cursor} lanes={lanes} height={170} title="spectrogram" />
      <div className="flex items-center gap-2 text-[9px] text-gray-400 mt-1">
        <span>1e{colorRange[0].toFixed(1)}</span>
        <span className="inline-block h-2 w-32 border border-[var(--nes-gray)]" style={{ background: heatGradient }} />
        <span>1e{colorRange[1].toFixed(1)} µV²/Hz</span>
      </div>
      <Note>{t('viewer.spec.note')}</Note>
    </>
  );
}
