/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: session summary, topomaps at the cursor, markers + segments, range stats, export.
import React, { useMemo } from 'react';
import { Topomap } from '../../components/Topomap.jsx';
import { useT, locale } from '../../lib/i18n.js';
import { Seg, Stat, Note } from './Panel.jsx';
import { BAND_COLORS, downloadBlob, bandsGroupOf } from './theme.js';
import { SENSORS, BAND_NAMES, formatWall } from '../lib/csvParse.js';
import { computeSummary, markerSegments } from '../lib/analysis.js';
import { heldIndex, lowerBound, quantiles, fmt, pct, fmtElapsed } from '../lib/series.js';
import { derivedCsv, eventsCsv, summaryJson } from '../lib/exporters.js';

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

export function SummaryPanel({ vc, summary }) {
  const t = useT();
  const { rec, ana } = vc;
  const m = rec.meta;
  const s = summary;
  const o = ana.pafOverall;
  const cols = Object.entries(m.columns).map(([g, c]) => `${g}${g === 'optics' ? ` ${c.length}` : ''}`);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label={t('viewer.sum.start')} value={formatWall(m.startMs)} sub={formatWall(m.startMs, { date: true }).slice(0, 10)} />
        <Stat label={t('viewer.sum.duration')} value={fmtElapsed(m.duration)} sub={t('viewer.sum.rows', { rows: m.rows.toLocaleString(locale()), mb: mb(m.fileSize || 0) })} />
        <Stat label={t('viewer.sum.rate')} value={Number.isFinite(m.fs) ? `${m.fs.toFixed(2)} Hz` : '–'} sub={`${t('viewer.sum.gaps', { n: rec.gaps.length })}${m.backSteps ? ` · ${t('viewer.sum.backSteps', { n: m.backSteps })}` : ''}`} />
        <Stat label={t('viewer.sum.headbandOn')} value={pct(s.headbandOn, 1)} sub={t('viewer.sum.artMoving', { a: pct(s.artifact?.any, 1), m: pct(s.moving, 1) })} color="var(--nes-green)" />
        <Stat label={t('viewer.sum.hsiGood')} wide value={SENSORS.map((x) => pct(s.hsiGood[x])).join(' ')} sub="TP9 AF7 AF8 TP10" color="var(--nes-green)" />
        <Stat label={t('viewer.sum.artSensor')} wide value={SENSORS.map((x) => pct(s.artifact?.[x])).join(' ')} sub={t('viewer.sum.artSensorSub')} color="var(--nes-red)" />
        <Stat label="PAF" value={o ? (o.found ? `${o.paf.toFixed(2)} Hz` : t('viewer.paf.noPeak')) : m.dspAvailable ? '…' : '–'} sub={o?.found ? t('viewer.sum.pafSub', { source: o.source, conf: pct(o.confidence) }) : s.pafMetrics ? t('viewer.sum.winMean', { v: fmt(s.pafMetrics.posteriorMean) }) : ''} color="var(--nes-blue)" />
        <Stat label={t('viewer.sum.faa')} value={fmt(s.faa, 3)} sub={`θ/β ${fmt(s.thetaBeta)} · θ/α ${fmt(s.thetaAlpha)}`} />
        <Stat label={t('viewer.sum.hr')} value={s.hr ? `${fmt(s.hr.mean, 0)} bpm` : t('viewer.sum.notRecorded')} sub={s.hr ? `${t('viewer.sum.minMax', { min: fmt(s.hr.min, 0), max: fmt(s.hr.max, 0) })}${s.hr.estimated ? ` · ${t('viewer.sum.estimated')}` : ''}` : ''} color="var(--nes-red)" />
        <Stat label={t('viewer.sum.breathing')} value={Number.isFinite(s.breathing?.median) ? t('viewer.breath.perMin', { v: s.breathing.median.toFixed(1) }) : '–'} sub={s.breathing ? t('viewer.breath.windows', { a: s.breathing.accepted, w: s.breathing.windows }) : ''} color="var(--nes-blue)" />
        <Stat label={t('viewer.sum.hrv')} value={s.hrv ? (s.hrv.available ? (Number.isFinite(s.hrv.rmssd) ? `${s.hrv.rmssd.toFixed(0)} ms` : '–') : t('viewer.breath.unavailable')) : '–'} sub={s.hrv ? (s.hrv.available ? t('viewer.sum.hrvSub', { sdnn: fmt(s.hrv.sdnn, 0), art: fmt(s.hrv.artifactPct, 1) }) : t('viewer.sum.opticsHz', { fs: fmt(s.hrv.effFs, 1) })) : ''} color="var(--nes-purple)" />
        <Stat label={t('viewer.sum.battery')} value={s.battery ? `${fmt(s.battery.start, 0)} → ${fmt(s.battery.end, 0)}%` : '–'} />
        <Stat label={t('viewer.sum.events')} value={t('viewer.sum.eventsVal', { m: s.events.marker || 0, b: s.events.blink || 0 })} sub={`${t('viewer.sum.jaw', { n: s.events.jaw || 0 })}${s.events.other ? ` · ${t('viewer.sum.other', { n: s.events.other })}` : ''}`} color="var(--nes-yellow)" />
        <Stat label={t('viewer.sum.coherence')} value={fmt(s.coherence)} sub="TP9–TP10, 8–13 Hz" />
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {BAND_NAMES.map((b) => (
          <div key={b} className="border-2 px-1 py-1 text-center" style={{ borderColor: BAND_COLORS[b] }}>
            <div className="text-[8px]" style={{ color: BAND_COLORS[b] }}>{t(`viewer.band.${b}`).toUpperCase()}</div>
            <div className="text-[11px]">{pct(s.bandsRel[b], 1)}</div>
            <div className="text-[8px] text-gray-400">{fmt(s.bandsAbs[b])} B</div>
          </div>
        ))}
      </div>
      <Note>{t('viewer.sum.note', { cols: cols.join(' · ') })}</Note>
    </>
  );
}

export function TopoPanel({ vc }) {
  const t = useT();
  const { rec, ana, prefs, setPref, cursor } = vc;
  const bands = bandsGroupOf(rec, ana);
  const mode = prefs.topoMode;
  const src = mode === 'rel' ? ana.bandRel : bands;
  const ranges = useMemo(() => {
    if (!src) return null;
    const out = {};
    for (const b of BAND_NAMES) {
      const all = [];
      for (const s of SENSORS) {
        const y = src.cols[`${b}_${s}`];
        if (!y) continue;
        const st = Math.max(1, Math.floor(y.length / 3000));
        for (let i = 0; i < y.length; i += st) if (y[i] === y[i]) all.push(y[i]);
      }
      const [lo, hi] = quantiles(all, [0.02, 0.98]);
      out[b] = hi > lo ? [lo, hi] : null;
    }
    return out;
  }, [src]);
  const avg = prefs.topoAvg;
  const values = useMemo(() => {
    if (!src || !Number.isFinite(cursor)) return null;
    const t = bands.t;
    const out = {};
    let i0, i1;
    if (avg > 0) { i0 = lowerBound(t, cursor - avg / 2); i1 = lowerBound(t, cursor + avg / 2); } else { i0 = Math.max(0, heldIndex(t, cursor)); i1 = i0 + 1; }
    for (const b of BAND_NAMES) {
      out[b] = SENSORS.map((s) => {
        const y = src.cols[`${b}_${s}`];
        if (!y) return null;
        let sum = 0, c = 0;
        for (let i = i0; i < Math.min(i1, y.length); i++) if (y[i] === y[i]) { sum += y[i]; c++; }
        return c ? sum / c : null;
      });
    }
    return out;
  }, [src, bands, cursor, avg]);
  if (!bands || !src) return <Note>{t('viewer.topo.none')}</Note>;
  const size = typeof window !== 'undefined' && window.innerWidth < 420 ? 136 : 150;
  return (
    <>
      <div className="mb-1">
        <Seg label={t('viewer.eeg.scale')} value={mode} onChange={(v) => setPref('topoMode', v)} options={[['rel', t('viewer.eeg.relative')], ['abs', t('viewer.eeg.absolute')]]} />
        <Seg label={t('viewer.topo.colours')} value={prefs.topoScale} onChange={(v) => setPref('topoScale', v)} options={[['global', t('viewer.topo.session')], ['frame', t('viewer.topo.perFrame')]]} />
        <Seg label={t('viewer.topo.average')} value={avg} onChange={(v) => setPref('topoAvg', v)} options={[[0, t('viewer.topo.none0')], [2, t('viewer.topo.s2')], [10, t('viewer.smooth.s10')]]} />
      </div>
      <div className="text-[9px] text-gray-400 mb-1">{t('viewer.topo.atCursor', { a: fmtElapsed(cursor, 0.1), b: formatWall(rec.meta.startMs + cursor * 1000) })}</div>
      <div className="flex flex-wrap gap-3 justify-center">
        {BAND_NAMES.map((b) => (
          <div key={b} className="text-center">
            <div className="text-[9px] mb-1" style={{ color: BAND_COLORS[b] }}>{t(`viewer.band.${b}`).toUpperCase()}</div>
            <Topomap
              values={values?.[b] || [null, null, null, null]}
              title={mode === 'rel' ? t('viewer.topo.relative') : t('viewer.topo.bels')}
              size={size}
              range={prefs.topoScale === 'global' ? ranges?.[b] : null}
              format={mode === 'abs' ? (v) => v.toFixed(2) : null}
            />
          </div>
        ))}
      </div>
      <Note>{t('viewer.topo.note')}</Note>
    </>
  );
}

export function MarkersPanel({ vc }) {
  const t = useT();
  const { rec, ana, seek, zoomTo } = vc;
  const marks = rec.events.filter((e) => e.kind !== 'blink');
  const blinks = rec.events.filter((e) => e.kind === 'blink');
  const segs = useMemo(() => markerSegments(rec).map((sg) => ({ ...sg, s: computeSummary(rec, ana, sg.a, sg.b) })), [rec, ana]);
  return (
    <>
      {marks.length ? (
        <ul className="flex flex-wrap gap-2 mb-2">
          {marks.map((e, i) => (
            <li key={i}>
              <button type="button" className="border-2 px-2 py-1 text-[9px] min-h-[30px]" style={{ borderColor: e.kind === 'marker' ? 'var(--nes-yellow)' : 'var(--nes-gray)' }} onClick={() => seek(e.t)}>
                {fmtElapsed(e.t)} {e.text.replace('/muse/', '').replace('/Marker/', t('viewer.markers.prefix'))}
              </button>
            </li>
          ))}
        </ul>
      ) : <Note>{t('viewer.markers.none')}</Note>}
      {blinks.length > 0 && (
        <details className="mb-2">
          <summary className="text-[9px] text-[var(--nes-blue)] cursor-pointer py-1">{t('viewer.markers.blinks', { n: blinks.length })}</summary>
          <div className="flex flex-wrap gap-1 mt-1">
            {blinks.map((e, i) => <button key={i} type="button" className="text-[8px] border border-[var(--nes-gray)] px-1" onClick={() => seek(e.t)}>{fmtElapsed(e.t)}</button>)}
          </div>
        </details>
      )}
      {segs.length > 0 && (
        <div className="overflow-x-auto">
          <div className="text-[9px] text-gray-400 mb-1">{t('viewer.markers.segments')}</div>
          <table className="text-[9px] w-full border-collapse">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pr-2">{t('viewer.markers.thSegment')}</th><th className="pr-2">{t('viewer.markers.thDur')}</th><th className="pr-2">{t('viewer.markers.thAlpha')}</th><th className="pr-2">θ/β</th><th className="pr-2">FAA</th><th className="pr-2">PAF</th><th className="pr-2">{t('viewer.markers.thHr')}</th><th className="pr-2">{t('viewer.markers.thArt')}</th><th />
              </tr>
            </thead>
            <tbody>
              {segs.map((sg, i) => (
                <tr key={i} className="border-t border-[var(--nes-gray)]">
                  <td className="pr-2 py-1 whitespace-nowrap">{fmtElapsed(sg.a)}–{fmtElapsed(sg.b)}</td>
                  <td className="pr-2">{fmtElapsed(sg.b - sg.a)}</td>
                  <td className="pr-2">{pct(sg.s.bandsRel.Alpha, 1)}</td>
                  <td className="pr-2">{fmt(sg.s.thetaBeta)}</td>
                  <td className="pr-2">{fmt(sg.s.faa, 3)}</td>
                  <td className="pr-2">{fmt(sg.s.pafMetrics?.posteriorMedian)}</td>
                  <td className="pr-2">{sg.s.hr ? fmt(sg.s.hr.mean, 0) : '–'}</td>
                  <td className="pr-2">{pct(sg.s.artifact?.any)}</td>
                  <td><button type="button" className="border border-[var(--nes-yellow)] text-[var(--nes-yellow)] px-1" onClick={() => zoomTo(sg.a, sg.b)}>{t('viewer.markers.zoom')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// [label key, value formatter, label vars]
const ROWS = [
  ['viewer.range.duration', (s) => fmtElapsed(s.duration)],
  ['viewer.sum.headbandOn', (s) => pct(s.headbandOn, 1)],
  ['viewer.range.artAny', (s) => pct(s.artifact?.any, 1)],
  ['viewer.range.moving', (s) => pct(s.moving, 1)],
  ...BAND_NAMES.map((b) => ['viewer.range.bandRow', (s) => `${pct(s.bandsRel[b], 1)} / ${fmt(s.bandsAbs[b])}`, b]),
  ['viewer.range.tbta', (s) => `${fmt(s.thetaBeta)} · ${fmt(s.thetaAlpha)}`],
  ['viewer.range.focus', (s) => fmt(s.focus)],
  ['viewer.range.faa', (s) => fmt(s.faa, 3)],
  ['viewer.sum.coherence', (s) => fmt(s.coherence)],
  ['viewer.range.pafMedian', (s) => (s.pafMetrics ? `${fmt(s.pafMetrics.posteriorMedian)} Hz` : '–')],
  ['viewer.range.hrMean', (s) => (s.hr ? `${fmt(s.hr.mean, 0)} bpm` : '–')],
  ['viewer.range.breathing', (s) => (Number.isFinite(s.breathing?.median) ? `${fmt(s.breathing.median, 1)} /min` : '–')],
  ['viewer.range.rmssdSdnn', (s) => (s.hrv?.available ? `${fmt(s.hrv.rmssd, 0)} · ${fmt(s.hrv.sdnn, 0)} ms` : '–')],
  ['viewer.range.hbo', (s) => (s.fnirs ? `${fmt(s.fnirs.hboL, 3)} / ${fmt(s.fnirs.hboR, 3)}` : '–')],
  ['viewer.range.hbr', (s) => (s.fnirs ? `${fmt(s.fnirs.hbrL, 3)} / ${fmt(s.fnirs.hbrR, 3)}` : '–')],
  ['viewer.range.markersBlinks', (s) => `${s.events.marker || 0} / ${s.events.blink || 0}`],
];

export function RangePanel({ vc, summary, rangeSummary }) {
  const { view } = vc;
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <div className="text-[9px] text-gray-400 mb-1">{t('viewer.range.title', { a: fmtElapsed(view.t0), b: fmtElapsed(view.t1) })}</div>
      <table className="text-[9px] w-full border-collapse">
        <thead><tr className="text-gray-400 text-left"><th className="pr-2">{t('viewer.range.measure')}</th><th className="pr-2 text-[var(--nes-yellow)]">{t('viewer.range.view')}</th><th>{t('viewer.range.session')}</th></tr></thead>
        <tbody>
          {ROWS.map(([label, f, band], i) => (
            <tr key={i} className="border-t border-[var(--nes-gray)]">
              <td className="pr-2 py-1">{t(label, { band: band ? t(`viewer.band.${band}`) : '' })}</td>
              <td className="pr-2 text-[var(--nes-yellow)]">{f(rangeSummary)}</td>
              <td>{f(summary)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportPanel({ vc, summary, rangeSummary }) {
  const t = useT();
  const { rec, ana, view } = vc;
  const base = (rec.meta.fileName || 'recording').replace(/\.csv$/i, '');
  const csv = (text, name) => downloadBlob(new Blob([text], { type: 'text/csv' }), name);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-green)]" onClick={() => downloadBlob(new Blob([summaryJson(rec, ana, summary, rangeSummary)], { type: 'application/json' }), `${base}_summary.json`)}>{t('viewer.export.summary')}</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-blue)]" onClick={() => csv(derivedCsv(rec, ana, view.t0, view.t1), `${base}_derived_${Math.round(view.t0)}-${Math.round(view.t1)}s.csv`)}>{t('viewer.export.derivedView')}</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-blue)]" onClick={() => csv(derivedCsv(rec, ana), `${base}_derived.csv`)}>{t('viewer.export.derivedAll')}</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-yellow)]" onClick={() => csv(eventsCsv(rec), `${base}_events.csv`)}>{t('viewer.export.events')}</button>
      </div>
      <Note>{t('viewer.export.note')}</Note>
    </>
  );
}
