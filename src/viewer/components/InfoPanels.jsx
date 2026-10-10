/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer: session summary, topomaps at the cursor, markers + segments, range stats, export.
import React, { useMemo } from 'react';
import { Topomap } from '../../components/Topomap.jsx';
import { Seg, Stat, Note } from './Panel.jsx';
import { BAND_COLORS, downloadBlob, bandsGroupOf } from './theme.js';
import { SENSORS, BAND_NAMES, formatWall } from '../lib/csvParse.js';
import { computeSummary, markerSegments } from '../lib/analysis.js';
import { heldIndex, lowerBound, quantiles, fmt, pct, fmtElapsed } from '../lib/series.js';
import { derivedCsv, eventsCsv, summaryJson } from '../lib/exporters.js';

const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;

export function SummaryPanel({ vc, summary }) {
  const { rec, ana } = vc;
  const m = rec.meta;
  const s = summary;
  const o = ana.pafOverall;
  const cols = Object.entries(m.columns).map(([g, c]) => `${g}${g === 'optics' ? ` ${c.length}` : ''}`);
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Start" value={formatWall(m.startMs)} sub={formatWall(m.startMs, { date: true }).slice(0, 10)} />
        <Stat label="Duration" value={fmtElapsed(m.duration)} sub={`${m.rows.toLocaleString()} rows · ${mb(m.fileSize || 0)}`} />
        <Stat label="Sample rate" value={Number.isFinite(m.fs) ? `${m.fs.toFixed(2)} Hz` : '–'} sub={`${rec.gaps.length} gap${rec.gaps.length === 1 ? '' : 's'}${m.backSteps ? ` · ${m.backSteps} clock steps back` : ''}`} />
        <Stat label="Headband on" value={pct(s.headbandOn, 1)} sub={`artifact ${pct(s.artifact?.any, 1)} · moving ${pct(s.moving, 1)}`} color="var(--nes-green)" />
        <Stat label="HSI good" wide value={SENSORS.map((x) => pct(s.hsiGood[x])).join(' ')} sub="TP9 AF7 AF8 TP10" color="var(--nes-green)" />
        <Stat label="Artifact / sensor" wide value={SENSORS.map((x) => pct(s.artifact?.[x])).join(' ')} sub="1 s windows > 150 µV p-p etc." color="var(--nes-red)" />
        <Stat label="PAF" value={o ? (o.found ? `${o.paf.toFixed(2)} Hz` : 'no clear peak') : m.dspAvailable ? '…' : '–'} sub={o?.found ? `${o.source} · conf ${pct(o.confidence)}` : s.pafMetrics ? `window mean ${fmt(s.pafMetrics.posteriorMean)} Hz` : ''} color="var(--nes-blue)" />
        <Stat label="Frontal asym. (FAA)" value={fmt(s.faa, 3)} sub={`θ/β ${fmt(s.thetaBeta)} · θ/α ${fmt(s.thetaAlpha)}`} />
        <Stat label="Heart rate" value={s.hr ? `${fmt(s.hr.mean, 0)} bpm` : 'not recorded'} sub={s.hr ? `min ${fmt(s.hr.min, 0)} · max ${fmt(s.hr.max, 0)}${s.hr.estimated ? ' · estimated' : ''}` : ''} color="var(--nes-red)" />
        <Stat label="Battery" value={s.battery ? `${fmt(s.battery.start, 0)} → ${fmt(s.battery.end, 0)}%` : '–'} />
        <Stat label="Events" value={`${s.events.marker || 0} mark · ${s.events.blink || 0} blink`} sub={`${s.events.jaw || 0} jaw clench${s.events.other ? ` · ${s.events.other} other` : ''}`} color="var(--nes-yellow)" />
        <Stat label="Alpha coherence" value={fmt(s.coherence)} sub="TP9–TP10, 8–13 Hz" />
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {BAND_NAMES.map((b) => (
          <div key={b} className="border-2 px-1 py-1 text-center" style={{ borderColor: BAND_COLORS[b] }}>
            <div className="text-[8px]" style={{ color: BAND_COLORS[b] }}>{b.toUpperCase()}</div>
            <div className="text-[11px]">{pct(s.bandsRel[b], 1)}</div>
            <div className="text-[8px] text-gray-400">{fmt(s.bandsAbs[b])} B</div>
          </div>
        ))}
      </div>
      <Note>Columns with data: {cols.join(' · ')}. Band means: relative % and absolute Bels (log10 µV²) over the whole session.</Note>
    </>
  );
}

export function TopoPanel({ vc }) {
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
  if (!bands || !src) return <Note>No band powers.</Note>;
  const size = typeof window !== 'undefined' && window.innerWidth < 420 ? 136 : 150;
  return (
    <>
      <div className="mb-1">
        <Seg label="SCALE" value={mode} onChange={(v) => setPref('topoMode', v)} options={[['rel', 'RELATIVE'], ['abs', 'ABSOLUTE']]} />
        <Seg label="COLOURS" value={prefs.topoScale} onChange={(v) => setPref('topoScale', v)} options={[['global', 'SESSION'], ['frame', 'PER FRAME']]} />
        <Seg label="AVERAGE" value={avg} onChange={(v) => setPref('topoAvg', v)} options={[[0, 'NONE'], [2, '2S'], [10, '10S']]} />
      </div>
      <div className="text-[9px] text-gray-400 mb-1">At cursor {fmtElapsed(cursor, 0.1)} · {formatWall(rec.meta.startMs + cursor * 1000)} (use ▶ to animate)</div>
      <div className="flex flex-wrap gap-3 justify-center">
        {BAND_NAMES.map((b) => (
          <div key={b} className="text-center">
            <div className="text-[9px] mb-1" style={{ color: BAND_COLORS[b] }}>{b.toUpperCase()}</div>
            <Topomap
              values={values?.[b] || [null, null, null, null]}
              title={mode === 'rel' ? 'relative' : 'Bels'}
              size={size}
              range={prefs.topoScale === 'global' ? ranges?.[b] : null}
              format={mode === 'abs' ? (v) => v.toFixed(2) : null}
            />
          </div>
        ))}
      </div>
      <Note>Inverse-distance interpolation of the 4 sensors (no extrapolation beyond them). SESSION colours = 2–98 % range of the whole recording, so maps can be compared over time.</Note>
    </>
  );
}

export function MarkersPanel({ vc }) {
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
                {fmtElapsed(e.t)} {e.text.replace('/muse/', '').replace('/Marker/', 'MARKER ')}
              </button>
            </li>
          ))}
        </ul>
      ) : <Note>No markers in this file.</Note>}
      {blinks.length > 0 && (
        <details className="mb-2">
          <summary className="text-[9px] text-[var(--nes-blue)] cursor-pointer py-1">{blinks.length} blinks (ticks at the top of the charts)</summary>
          <div className="flex flex-wrap gap-1 mt-1">
            {blinks.map((e, i) => <button key={i} type="button" className="text-[8px] border border-[var(--nes-gray)] px-1" onClick={() => seek(e.t)}>{fmtElapsed(e.t)}</button>)}
          </div>
        </details>
      )}
      {segs.length > 0 && (
        <div className="overflow-x-auto">
          <div className="text-[9px] text-gray-400 mb-1">Marker-to-marker segments</div>
          <table className="text-[9px] w-full border-collapse">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pr-2">SEGMENT</th><th className="pr-2">DUR</th><th className="pr-2">ALPHA</th><th className="pr-2">θ/β</th><th className="pr-2">FAA</th><th className="pr-2">PAF</th><th className="pr-2">HR</th><th className="pr-2">ART</th><th />
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
                  <td><button type="button" className="border border-[var(--nes-yellow)] text-[var(--nes-yellow)] px-1" onClick={() => zoomTo(sg.a, sg.b)}>ZOOM</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const ROWS = [
  ['Duration', (s) => fmtElapsed(s.duration)],
  ['Headband on', (s) => pct(s.headbandOn, 1)],
  ['Artifact (any sensor)', (s) => pct(s.artifact?.any, 1)],
  ['Moving', (s) => pct(s.moving, 1)],
  ...BAND_NAMES.map((b) => [`${b} rel / abs`, (s) => `${pct(s.bandsRel[b], 1)} / ${fmt(s.bandsAbs[b])}`]),
  ['θ/β · θ/α', (s) => `${fmt(s.thetaBeta)} · ${fmt(s.thetaAlpha)}`],
  ['Focus β/(θ+α)', (s) => fmt(s.focus)],
  ['FAA ln(AF8)−ln(AF7)', (s) => fmt(s.faa, 3)],
  ['Alpha coherence', (s) => fmt(s.coherence)],
  ['PAF posterior median', (s) => (s.pafMetrics ? `${fmt(s.pafMetrics.posteriorMedian)} Hz` : '–')],
  ['Heart rate mean', (s) => (s.hr ? `${fmt(s.hr.mean, 0)} bpm` : '–')],
  ['ΔHbO left / right', (s) => (s.fnirs ? `${fmt(s.fnirs.hboL, 3)} / ${fmt(s.fnirs.hboR, 3)}` : '–')],
  ['ΔHbR left / right', (s) => (s.fnirs ? `${fmt(s.fnirs.hbrL, 3)} / ${fmt(s.fnirs.hbrR, 3)}` : '–')],
  ['Markers / blinks', (s) => `${s.events.marker || 0} / ${s.events.blink || 0}`],
];

export function RangePanel({ vc, summary, rangeSummary }) {
  const { view } = vc;
  return (
    <div className="overflow-x-auto">
      <div className="text-[9px] text-gray-400 mb-1">Visible range {fmtElapsed(view.t0)} – {fmtElapsed(view.t1)} vs whole session (zoom / pan or ZOOM a marker segment to change it)</div>
      <table className="text-[9px] w-full border-collapse">
        <thead><tr className="text-gray-400 text-left"><th className="pr-2">MEASURE</th><th className="pr-2 text-[var(--nes-yellow)]">VIEW</th><th>SESSION</th></tr></thead>
        <tbody>
          {ROWS.map(([label, f]) => (
            <tr key={label} className="border-t border-[var(--nes-gray)]">
              <td className="pr-2 py-1">{label}</td>
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
  const { rec, ana, view } = vc;
  const base = (rec.meta.fileName || 'recording').replace(/\.csv$/i, '');
  const csv = (text, name) => downloadBlob(new Blob([text], { type: 'text/csv' }), name);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-green)]" onClick={() => downloadBlob(new Blob([summaryJson(rec, ana, summary, rangeSummary)], { type: 'application/json' }), `${base}_summary.json`)}>SUMMARY JSON</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-blue)]" onClick={() => csv(derivedCsv(rec, ana, view.t0, view.t1), `${base}_derived_${Math.round(view.t0)}-${Math.round(view.t1)}s.csv`)}>DERIVED CSV (VIEW)</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-blue)]" onClick={() => csv(derivedCsv(rec, ana), `${base}_derived.csv`)}>DERIVED CSV (ALL)</button>
        <button type="button" className="retro-button text-[9px] px-3 py-2 border-[var(--nes-yellow)]" onClick={() => csv(eventsCsv(rec), `${base}_events.csv`)}>EVENTS CSV</button>
      </div>
      <Note>Files are created on this device; nothing is uploaded. Derived CSV = one row per second (band powers, ratios, PAF, HR, fNIRS, artifact and motion flags). Each chart panel also has a PNG button.</Note>
    </>
  );
}
