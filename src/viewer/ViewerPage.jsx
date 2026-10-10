/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer page (/viewer): open a Mind Monitor CSV (BrainArcade recordings or real Mind Monitor
// files) and explore it. Port of Muse_Capture&Analysis mind_monitor_viewer (app.js + index.html) without
// Google Charts: parsing + analysis in a Web Worker, hand-rolled canvas charts with one shared time range
// and cursor. Everything stays on the device.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, Note } from './components/Panel.jsx';
import { Overview } from './components/Overview.jsx';
import { BandsPanel, RawPanel, QualityPanel, RatiosPanel } from './components/EegPanels.jsx';
import { PafPanel, SpectrumPanel } from './components/AnalysisPanels.jsx';
import { FnirsViewerPanel, HeartPanel, MotionPanel, MmPanel } from './components/BodyPanels.jsx';
import { SummaryPanel, TopoPanel, MarkersPanel, RangePanel, ExportPanel } from './components/InfoPanels.jsx';
import { THEME, loadPrefs, savePrefs } from './components/theme.js';
import { computeSummary, heartSeries } from './lib/analysis.js';
import { fmtElapsed } from './lib/series.js';
import { formatWall } from './lib/csvParse.js';

const DEFAULT_PREFS = {
  open: { summary: true, topo: true, bands: true, raw: true, quality: true, markers: false, range: false, paf: false, spectrum: false, ratios: false, fnirs: false, hr: true, motion: false, mm: false, export: false },
  bandMode: 'rel', bandSensor: 'mean', smooth: 10,
  bandsOn: { Delta: true, Theta: true, Alpha: true, Beta: true, Gamma: true },
  rawFilter: true, rawScale: 100,
  topoMode: 'rel', topoScale: 'global', topoAvg: 2,
  speed: 4, clock: false,
  pafMethod: 'whitened', pafSmooth: 0, pafShow: { TP9: true, AF7: false, AF8: false, TP10: true, balance: false, power: false },
  ratiosOn: { alphaRel: true, faa: true, thetaBeta: true, thetaAlpha: false, focus: false, coherence: false }, ratioSmooth: 10,
  specChannel: 'TP9', motionXYZ: false, hrSmooth: 0,
};
const PHASE = { parse: 'READING FILE', filter: 'FILTERING EEG', artifacts: 'ARTIFACTS', spectrogram: 'SPECTROGRAM', paf: 'PEAK ALPHA', fnirs: 'FNIRS', classicPaf: 'PAF (FFT)' };
const MIN_SPAN = 0.5;
const SPEEDS = [1, 4, 16, 64];
const font = { fontFamily: 'var(--font-retro)' };

function clampView(a, b, dur) {
  let span = Math.min(dur, Math.max(MIN_SPAN, b - a));
  if (!Number.isFinite(span) || span <= 0) span = dur;
  let t0 = Number.isFinite(a) ? a : 0;
  if (t0 < 0) t0 = 0;
  if (t0 + span > dur) t0 = Math.max(0, dur - span);
  return { t0, t1: t0 + span };
}

function offSpans(rec) {
  const hsi = rec.groups.hsi;
  const on = hsi?.cols.HeadBandOn;
  const out = rec.gaps.map(([a, b]) => ({ a, b, color: THEME.gap }));
  if (!on) return out;
  let start = null;
  for (let i = 0; i < hsi.n; i++) {
    if (on[i] === 0 && start === null) start = hsi.t[i];
    if (on[i] !== 0 && start !== null) { out.push({ a: start, b: hsi.t[i], color: THEME.off }); start = null; }
  }
  if (start !== null) out.push({ a: start, b: rec.meta.duration, color: THEME.off });
  return out;
}

export function ViewerPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(() => loadPrefs(DEFAULT_PREFS));
  const setPref = useCallback((k, v) => setPrefs((p) => { const n = { ...p, [k]: v }; savePrefs(n); return n; }), []);
  const togglePanel = useCallback((id) => setPrefs((p) => { const n = { ...p, open: { ...p.open, [id]: !p.open[id] } }; savePrefs(n); return n; }), []);
  const [rec, setRec] = useState(null);
  const [ana, setAna] = useState({});
  const [classic, setClassic] = useState({});
  const [prog, setProg] = useState(null);
  const [error, setError] = useState(null);
  const [view, setViewRaw] = useState({ t0: 0, t1: 1 });
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState(false);
  const workerRef = useRef(null);
  const fileRef = useRef(null);
  const dur = Math.max(1, rec?.meta.duration || 1);

  const setView = useCallback((a, b) => setViewRaw(clampView(a, b, dur)), [dur]);

  const load = useCallback((file) => {
    if (!file) return;
    workerRef.current?.terminate();
    setRec(null); setAna({}); setClassic({}); setError(null); setPlaying(false);
    setProg({ phase: 'parse', value: 0, name: file.name });
    const w = new Worker(new URL('./csvWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') setProg((p) => (m.phase === 'done' ? null : { ...p, phase: m.phase, value: m.value }));
      else if (m.type === 'parsed') {
        setRec(m.rec);
        setAna(m.early || {});
        setViewRaw({ t0: 0, t1: Math.max(1, m.rec.meta.duration) });
        setCursor(0);
      } else if (m.type === 'analysis') setAna((a) => ({ ...a, ...m.ana }));
      else if (m.type === 'fnirs') { setAna((a) => ({ ...a, fnirs: m.fnirs })); setProg(null); }
      else if (m.type === 'classicPaf') setClassic((c) => ({ ...c, [m.key]: m.series }));
      else if (m.type === 'error') { setError(m.message); setProg(null); }
    };
    w.onerror = (e) => { setError(e.message || 'Worker failed'); setProg(null); };
    w.postMessage({ type: 'parse', file });
  }, []);
  useEffect(() => () => workerRef.current?.terminate(), []);

  // Dev only: /viewer?src=/sample-recording.csv loads a file served by Vite (for testing without a file picker)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const src = new URLSearchParams(window.location.search).get('src');
    if (!src) return;
    fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => load(new File([b], src.split('/').pop() || 'sample.csv')))
      .catch((err) => setError(`Could not load ${src}: ${err.message}`));
  }, [load]);

  const runFnirs = useCallback((t) => {
    if (!workerRef.current) return;
    setProg({ phase: 'fnirs', value: 0 });
    workerRef.current.postMessage({ type: 'fnirs', baselineAt: t });
  }, []);
  const runClassic = useCallback((key, opts) => {
    if (!workerRef.current) return;
    setClassic((c) => ({ ...c, [key]: c[key] || null }));
    setProg({ phase: 'classicPaf', value: 0 });
    workerRef.current.postMessage({ type: 'classicPaf', key, opts });
  }, []);

  // Playback
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setCursor((c) => Math.min(dur, c + dt * prefs.speed));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, prefs.speed, dur]);
  useEffect(() => {
    if (!playing) return;
    if (cursor >= dur) { setPlaying(false); return; }
    if (cursor > view.t1 || cursor < view.t0) {
      const span = view.t1 - view.t0;
      setView(cursor - span * 0.05, cursor + span * 0.95);
    }
  }, [cursor, playing, dur, view, setView]);

  const zoom = useCallback((k) => {
    const tc = cursor >= view.t0 && cursor <= view.t1 ? cursor : (view.t0 + view.t1) / 2;
    setView(tc - (tc - view.t0) * k, tc + (view.t1 - tc) * k);
  }, [cursor, view, setView]);
  const pan = useCallback((f) => { const d = (view.t1 - view.t0) * f; setView(view.t0 + d, view.t1 + d); }, [view, setView]);
  const seek = useCallback((t) => {
    setCursor(t);
    setViewRaw((v) => (t >= v.t0 && t <= v.t1 ? v : clampView(t - (v.t1 - v.t0) / 2, t + (v.t1 - v.t0) / 2, dur)));
  }, [dur]);
  const zoomTo = useCallback((a, b) => { setView(a, b); setCursor(a); }, [setView]);
  const windowSec = (s) => {
    const tc = cursor;
    setView(tc - s / 2, tc + s / 2);
  };

  // Keyboard: space play, arrows step, +/- zoom
  useEffect(() => {
    if (!rec) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
      const span = view.t1 - view.t0;
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(Math.min(dur, cursor + span * (e.shiftKey ? 0.1 : 0.01))); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(Math.max(0, cursor - span * (e.shiftKey ? 0.1 : 0.01))); }
      else if (e.key === '+' || e.key === '=') zoom(0.5);
      else if (e.key === '-') zoom(2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rec, view, cursor, dur, seek, zoom]);

  const events = useMemo(() => (rec ? rec.events.map((e) => (e.kind === 'marker' ? { ...e, label: e.text.replace(/.*\/Marker\//i, 'M') } : e)) : []), [rec]);
  const shades = useMemo(() => (rec ? offSpans(rec) : []), [rec]);
  const clock = useMemo(() => ({ startMs: rec?.meta.startMs, on: prefs.clock }), [rec, prefs.clock]);
  const bounds = useMemo(() => [0, dur], [dur]);
  const chart = useMemo(() => ({ view, bounds, onCursor: setCursor, onView: setView, events, shades, clock }), [view, bounds, setView, events, shades, clock]);
  const summary = useMemo(() => (rec ? computeSummary(rec, ana) : null), [rec, ana]);
  const needRange = prefs.open.range || prefs.open.export;
  const rangeSummary = useMemo(() => (rec && needRange ? computeSummary(rec, ana, view.t0, view.t1) : null), [rec, ana, view.t0, view.t1, needRange]);
  const hr = useMemo(() => (rec ? heartSeries(rec, ana) : null), [rec, ana]);
  const overview = useMemo(() => {
    if (!rec) return null;
    const b = rec.groups.bands || ana.bandsDerived;
    if (b && ana.bandRel) return { t: b.t, y: ana.bandRel.cols.Alpha_mean, color: '#00C020' };
    const r = rec.groups.raw;
    if (r) return { t: r.t, y: ana.filtered?.TP9 || r.cols.RAW_TP9, color: '#40C0FF' };
    return null;
  }, [rec, ana.bandRel, ana.bandsDerived, ana.filtered]);

  const busy = !!prog && prog.phase !== 'parse';
  const vc = { rec, ana, prefs, setPref, chart, cursor, view, seek, zoomTo, runFnirs, runClassic, classic, busy };
  const P = (id, title, color, node, extra = {}) => (
    <Panel id={id} title={title} color={color} open={!!prefs.open[id]} onToggle={togglePanel} pngName={extra.png ? `${(rec?.meta.fileName || 'rec').replace(/\.csv$/i, '')}_${id}` : null}>
      {prefs.open[id] && node}
    </Panel>
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) load(f);
  };

  return (
    <div
      className={`max-w-5xl mx-auto pb-16 ${drag ? 'outline-4 outline-dashed outline-[var(--nes-yellow)]' : ''}`}
      style={font}
      onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button type="button" onClick={() => navigate('/')} className="text-sm text-[var(--nes-blue)] hover:text-[var(--nes-yellow)] min-h-[40px]">← HOME</button>
        <h2 className="text-xs sm:text-lg text-[var(--nes-green)]">RECORDING VIEWER</h2>
        <button type="button" className="retro-button ml-auto text-[10px] px-3 py-2 border-[var(--nes-yellow)] text-[var(--nes-yellow)] bg-transparent hover:bg-[var(--nes-yellow)] hover:text-black" onClick={() => fileRef.current?.click()}>
          OPEN CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {error && <p className="text-[10px] text-[var(--nes-red)] border-2 border-[var(--nes-red)] p-2 mb-3" role="alert">ERROR: {error}</p>}

      {prog && (
        <div className="mb-3" aria-live="polite">
          <div className="flex justify-between text-[9px] text-gray-300 mb-1">
            <span>{PHASE[prog.phase] || prog.phase}{prog.name && prog.phase === 'parse' ? ` · ${prog.name}` : ''}</span>
            <span>{Math.round((prog.value || 0) * 100)}%</span>
          </div>
          <div className="h-3 border-2 border-[var(--nes-gray)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((prog.value || 0) * 100)}>
            <div className="h-full bg-[var(--nes-green)]" style={{ width: `${Math.round((prog.value || 0) * 100)}%` }} />
          </div>
        </div>
      )}

      {!rec && !prog && (
        <div
          className="border-4 border-dashed border-[var(--nes-gray)] p-6 text-center cursor-pointer"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
        >
          <p className="text-xs text-white mb-3">DROP A MIND MONITOR CSV HERE</p>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            BrainArcade recordings (Record this session) and Mind Monitor exports. The file is read on this device only - nothing is uploaded.
            Large files (30+ min, 100+ MB) take a few seconds.
          </p>
        </div>
      )}

      {rec && (
        <>
          <div className="sticky top-0 z-20 bg-[#181818] pt-1 pb-2 mb-3 border-b-2 border-[var(--nes-gray)]">
            <div className="flex flex-wrap items-center gap-1 mb-1 text-[10px]">
              <button type="button" className="border-2 border-[var(--nes-green)] text-[var(--nes-green)] px-3 min-h-[32px]" onClick={() => { if (cursor >= dur) setCursor(0); setPlaying((p) => !p); }} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button type="button" className="border-2 border-[var(--nes-yellow)] text-[var(--nes-yellow)] px-2 min-h-[32px] min-w-[44px]" onClick={() => setPref('speed', SPEEDS[(SPEEDS.indexOf(prefs.speed) + 1) % SPEEDS.length])} aria-label={`Playback speed ${prefs.speed} times, tap to change`}>
                ×{prefs.speed}
              </button>
              <span className="text-[var(--nes-yellow)] tabular-nums ml-1" aria-live="off">
                {fmtElapsed(cursor, 0.1)} / {fmtElapsed(dur)} <span className="text-gray-400">{formatWall(rec.meta.startMs + cursor * 1000)}</span>
              </span>
              <span className="truncate text-gray-500 text-[9px] max-w-[40%] hidden sm:inline ml-2">{rec.meta.fileName}</span>
            </div>
            {/* Manual time slider (like Mind Monitor): drag to scrub the cursor; dragging pauses playback */}
            <div className="flex items-center gap-1 mb-1">
              <button type="button" aria-label="Back 1 second" className="border-2 border-[var(--nes-green)] text-[var(--nes-green)] w-8 min-h-[30px] text-[9px]" onClick={() => { setPlaying(false); seek(Math.max(0, cursor - 1)); }}>-1S</button>
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={dur > 600 ? 0.5 : 0.1}
                value={Math.min(cursor, dur || 0)}
                onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }}
                aria-label="Time"
                aria-valuetext={fmtElapsed(cursor, 0.1)}
                className="flex-1 min-w-0 h-8 cursor-pointer accent-[var(--nes-green)]"
              />
              <button type="button" aria-label="Forward 1 second" className="border-2 border-[var(--nes-green)] text-[var(--nes-green)] w-8 min-h-[30px] text-[9px]" onClick={() => { setPlaying(false); seek(Math.min(dur, cursor + 1)); }}>+1S</button>
            </div>
            <div className="flex flex-wrap items-center gap-1 mb-1">
              {[['−', () => zoom(2), 'Zoom out'], ['+', () => zoom(0.5), 'Zoom in'], ['◀', () => pan(-0.5), 'Pan left'], ['▶', () => pan(0.5), 'Pan right']].map(([l, f, a]) => (
                <button key={a} type="button" aria-label={a} className="border-2 border-[var(--nes-blue)] text-[var(--nes-blue)] w-8 sm:w-9 min-h-[30px] text-xs" onClick={f}>{l}</button>
              ))}
              {[[10, '10S'], [30, '30S'], [60, '1M'], [300, '5M'], ['all', 'ALL']].map(([v, l]) => (
                <button key={l} type="button" className="border-2 border-[var(--nes-blue)] text-[var(--nes-blue)] px-1 sm:px-2 min-h-[30px] text-[8px] sm:text-[9px]" onClick={() => (v === 'all' ? setView(0, dur) : windowSec(v))}>{l}</button>
              ))}
              <button type="button" aria-pressed={!!prefs.clock} className="border-2 border-[#c0c0c0] px-1 sm:px-2 min-h-[30px] text-[8px] sm:text-[9px]" style={{ background: prefs.clock ? '#c0c0c0' : 'transparent', color: prefs.clock ? '#000' : '#c0c0c0' }} onClick={() => setPref('clock', !prefs.clock)} title="X axis as wall-clock time">
                CLOCK
              </button>
            </div>
            <Overview series={overview} duration={dur} view={view} cursor={cursor} onView={setView} onCursor={setCursor} events={events} />
            <div className="text-[8px] text-gray-500 mt-1">
              View {fmtElapsed(view.t0)}–{fmtElapsed(view.t1)}
              <span className="hidden sm:inline"> · tap = cursor, drag = pan, Ctrl+wheel / pinch = zoom, Shift+wheel = pan, double-click = all, space = play</span>
              {busy ? ` · ${PHASE[prog.phase] || ''} ${Math.round((prog.value || 0) * 100)}%` : ''}
            </div>
          </div>

          {P('summary', 'Session summary', 'var(--nes-yellow)', <SummaryPanel vc={vc} summary={summary} />)}
          {P('topo', 'Head maps at cursor', 'var(--nes-green)', <TopoPanel vc={vc} />)}
          {P('bands', 'Band power', 'var(--nes-green)', <BandsPanel vc={vc} />, { png: true })}
          {P('raw', 'Raw EEG', 'var(--nes-blue)', <RawPanel vc={vc} />, { png: true })}
          {P('quality', 'Signal quality', 'var(--nes-green)', <QualityPanel vc={vc} />, { png: true })}
          {P('markers', `Markers & events (${rec.events.length})`, 'var(--nes-yellow)', <MarkersPanel vc={vc} />)}
          {P('range', 'Visible range stats', 'var(--nes-yellow)', rangeSummary && <RangePanel vc={vc} summary={summary} rangeSummary={rangeSummary} />)}
          {P('paf', 'Peak alpha frequency', 'var(--nes-blue)', <PafPanel vc={vc} />, { png: true })}
          {P('spectrum', 'Spectrum & spectrogram', 'var(--nes-purple)', <SpectrumPanel vc={vc} />, { png: true })}
          {P('ratios', 'Ratios & asymmetry', 'var(--nes-blue)', <RatiosPanel vc={vc} />, { png: true })}
          {P('fnirs', 'fNIRS (HbO / HbR)', 'var(--nes-red)', <FnirsViewerPanel vc={vc} />, { png: true })}
          {hr && P('hr', 'Heart rate', 'var(--nes-red)', <HeartPanel vc={vc} hr={hr} />, { png: true })}
          {P('motion', 'Motion & battery', 'var(--nes-yellow)', <MotionPanel vc={vc} />, { png: true })}
          {rec.groups.mm && P('mm', 'Mellow / Concentration', 'var(--nes-green)', <MmPanel vc={vc} />, { png: true })}
          {P('export', 'Export', 'var(--nes-green)', rangeSummary && <ExportPanel vc={vc} summary={summary} rangeSummary={rangeSummary} />)}
          {!hr && <Note>No heart rate in this file.</Note>}
        </>
      )}
    </div>
  );
}

export default ViewerPage;
