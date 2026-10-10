/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Recording viewer worker: streams the CSV file (never whole in memory as text), parses it into typed
// arrays (lib/csvParse.js) and runs the offline analysis (lib/analysis.js). All local, nothing is uploaded.
//
// in : { type: 'parse', file }            -> progress*, parsed, progress*, analysis
//      { type: 'fnirs', baselineAt }      -> fnirs
//      { type: 'classicPaf', key, opts }  -> classicPaf
// out: { type: 'progress', phase, value } | { type: 'error', message }
import { createCsvParser, transferList } from './lib/csvParse.js';
import {
  dspChannels, bandpassZeroPhase, artifactSeries, spectrogram, bandsFromSpectrogram, bandDerived,
  pafSeries, classicPafSeries, overallPaf, fnirsReplay, motionSeries,
} from './lib/analysis.js';
import { estimateHeartRateFromOptics } from './lib/hrFallback.js';
import { OPTICS_FS } from '../lib/fnirs.js';

let kept = null; // { rawT, dsp, fs, optics } for re-runs after the parsed buffers were transferred

const progress = (phase, value) => postMessage({ type: 'progress', phase, value });

function buffersOf(obj, list = []) {
  if (!obj || typeof obj !== 'object') return list;
  if (ArrayBuffer.isView(obj)) { if (!list.includes(obj.buffer)) list.push(obj.buffer); return list; }
  for (const v of Object.values(obj)) buffersOf(v, list);
  return list;
}

const cloneGroup = (g) => (g ? { t: g.t.slice(), n: g.n, cols: Object.fromEntries(Object.entries(g.cols).map(([k, v]) => [k, v.slice()])) } : null);

async function parse(file) {
  const parser = createCsvParser();
  const reader = file.stream().getReader();
  const dec = new TextDecoder('utf-8');
  let done = 0;
  let lastPct = -1;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    done += value.byteLength;
    parser.push(dec.decode(value, { stream: true }));
    const pct = Math.floor((done / Math.max(1, file.size)) * 100);
    if (pct !== lastPct) { lastPct = pct; progress('parse', done / Math.max(1, file.size)); }
  }
  parser.push(dec.decode());
  const rec = parser.finish();
  rec.meta.fileName = file.name;
  rec.meta.fileSize = file.size;
  return rec;
}

async function handleParse(file) {
  const rec = await parse(file);
  const { fs, duration } = rec.meta;
  const raw = rec.groups.raw;
  const canDsp = raw && fs >= 100;
  // Light analysis first (needs groups that are about to be transferred)
  const early = {};
  const dsp = canDsp ? dspChannels(rec) : null;
  if (rec.groups.bands) {
    const d = bandDerived(rec.groups.bands);
    Object.assign(early, { bandAbs: d.abs, bandRel: d.rel, ratios: d.ratios });
  }
  early.motion = motionSeries(rec.groups.acc, rec.groups.gyro, duration);
  if (!rec.groups.hr && rec.groups.optics) {
    const est = estimateHeartRateFromOptics(rec.groups.optics, OPTICS_FS); // HR-FALLBACK-HOOK
    if (est) early.hrEstimate = est;
  }
  kept = { rawT: canDsp ? raw.t.slice() : null, dsp, fs, duration, optics: cloneGroup(rec.groups.optics) };
  rec.meta.dspAvailable = !!canDsp;
  postMessage({ type: 'parsed', rec, early }, [...new Set([...transferList(rec), ...buffersOf(early)])]); // early shares time axes with rec

  // Heavy analysis
  const ana = {};
  if (canDsp) {
    progress('filter', 0);
    const filtered = dsp.map((c, i) => { progress('filter', i / 4); return c ? bandpassZeroPhase(c, fs) : null; });
    ana.filtered = Object.fromEntries(['TP9', 'AF7', 'AF8', 'TP10'].map((s, i) => [s, filtered[i]]));
    progress('artifacts', 0);
    ana.artifacts = artifactSeries(dsp, kept.rawT, fs);
    const spec = spectrogram(filtered, dsp, kept.rawT, fs, (v) => progress('spectrogram', v));
    ana.coherence = spec.coherence;
    delete spec.coherence;
    ana.spectrogram = spec;
    if (!rec.groups.bands && spec.n) {
      const b = bandsFromSpectrogram(spec);
      const d = bandDerived(b);
      Object.assign(ana, { bandsDerived: b, bandAbs: d.abs, bandRel: d.rel, ratios: d.ratios });
    }
    ana.paf = pafSeries(dsp, kept.rawT, fs, (v) => progress('paf', v));
    progress('paf', 1);
    ana.pafOverall = overallPaf(dsp, fs, duration); // spectrum: dB above 1/f on paf.js SPEC_GRID
  }
  if (kept.optics) {
    progress('fnirs', 0);
    ana.fnirs = fnirsReplay(kept.optics);
  }
  progress('done', 1);
  postMessage({ type: 'analysis', ana }, buffersOf(ana));
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'parse') await handleParse(msg.file);
    else if (msg.type === 'fnirs') {
      const f = kept?.optics ? fnirsReplay(kept.optics, msg.baselineAt) : null;
      postMessage({ type: 'fnirs', fnirs: f }, f ? buffersOf(f) : []);
    } else if (msg.type === 'classicPaf') {
      if (!kept?.dsp) throw new Error('No raw EEG for PAF');
      const s = classicPafSeries(kept.dsp, kept.rawT, kept.fs, msg.opts, (v) => progress('classicPaf', v));
      progress('done', 1);
      postMessage({ type: 'classicPaf', key: msg.key, series: s }, buffersOf(s));
    }
  } catch (err) {
    postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
