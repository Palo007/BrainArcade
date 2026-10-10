// Validation of src/viewer/lib/csvParse.js (+ a smoke run of src/viewer/lib/analysis.js).
// Usage: node tools/test-csvParse.mjs [csvPath]
// (1) synthetic CSV in our writer format (60-field data rows, 61-field Elements rows)  (2) real recording, summary only
import fs from 'node:fs';
import path from 'node:path';
import { createCsvParser, parseCsvText, parseTimestamp, formatWall, splitCsvLine, estimateTiming } from '../src/viewer/lib/csvParse.js';
import { COLUMNS, formatTimestamp } from '../src/lib/mmRecorder.js';
import {
  dspChannels, bandpassZeroPhase, artifactSeries, spectrogram, bandDerived, pafSeries, overallPaf, fnirsReplay,
  motionSeries, computeSummary, markerSegments, rangePsd,
} from '../src/viewer/lib/analysis.js';
import { smoothSeries, heldShare, lowerBound, valueAt } from '../src/viewer/lib/series.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- timestamps
const ms = parseTimestamp('2026-10-10 21:37:54.508');
check('timestamp parse (space form)', ms === Date.UTC(2026, 9, 10, 21, 37, 54, 508));
check('timestamp parse (T form, short fraction)', parseTimestamp('2026-10-10T21:37:54.5') === Date.UTC(2026, 9, 10, 21, 37, 54, 500));
check('timestamp garbage -> NaN', Number.isNaN(parseTimestamp('hello')));
check('formatWall round trip', formatWall(ms, { millis: true }) === '21:37:54.508');
// our writer format round-trips (formatTimestamp is local time; parse keeps the fields)
const w = formatTimestamp(new Date(2026, 9, 10, 8, 5, 3, 7).getTime());
check('mmRecorder.formatTimestamp parses', formatWall(parseTimestamp(w), { millis: true }) === '08:05:03.007', w);
check('quoted split', JSON.stringify(splitCsvLine('a,"b,c",,"d""e"')) === JSON.stringify(['a', 'b,c', '', 'd"e']));

// ---- synthetic file, writer column layout
const FS = 256;
const N = FS * 20; // 20 s
const col = Object.fromEntries(COLUMNS.map((c, i) => [c, i]));
const t0 = Date.UTC(2026, 9, 10, 10, 0, 0, 0);
const lines = [COLUMNS.join(',')];
const fmtTs = (m) => formatWall(m, { date: true, millis: true });
lines.push(`${fmtTs(t0)}${','.repeat(COLUMNS.length - 2)},/muse/event/connected MuseS-TEST`);
const gapAt = FS * 10; // 1 s gap after 10 s
let markerRows = 0;
for (let i = 0; i < N; i++) {
  const tm = t0 + Math.round((i * 1000) / FS) + (i >= gapAt ? 1000 : 0);
  const cells = new Array(COLUMNS.length - 1).fill(''); // 60 fields: Elements omitted
  cells[0] = fmtTs(tm);
  const tt = i / FS;
  ['TP9', 'AF7', 'AF8', 'TP10'].forEach((s, k) => { cells[col[`RAW_${s}`]] = (20 * Math.sin(2 * Math.PI * 10 * tt + k) + 800).toFixed(3); });
  if (i >= 280) {
    const bi = Math.floor(i / 26); // held ~10 Hz
    ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].forEach((b, k) => ['TP9', 'AF7', 'AF8', 'TP10'].forEach((s, j) => {
      cells[col[`${b}_${s}`]] = (0.5 + 0.1 * k + 0.01 * j + 0.001 * (bi % 3)).toFixed(5);
    }));
  }
  if (i % 4 === 0) for (let o = 1; o <= 8; o++) cells[col[`Optics${o}`]] = (10 + o + 0.01 * Math.sin(i / 10)).toFixed(4);
  if ((i >= FS * 2 && i < FS * 8) || i >= FS * 12) cells[col.Heart_Rate] = (i < FS * 8 ? 70 : 72).toFixed(1);
  cells[col.HeadBandOn] = '1';
  ['TP9', 'AF7', 'AF8', 'TP10'].forEach((s, k) => { cells[col[`HSI_${s}`]] = i > N / 2 && k === 0 ? '4' : '1'; });
  cells[col.Battery] = (90 - Math.floor(i / 2560)).toFixed(2);
  lines.push(cells.join(','));
  if (i === FS * 5 || i === FS * 15) {
    lines.push(`${fmtTs(tm)}${','.repeat(COLUMNS.length - 2)},/Marker/${++markerRows}`);
  }
  if (i === FS * 7) lines.push(`${fmtTs(tm)}${','.repeat(COLUMNS.length - 2)},/muse/elements/blink`);
}
const text = `﻿${lines.join('\r\n')}\r\n`;
// stream it in odd-sized chunks to exercise line splitting across chunks
const p = createCsvParser();
for (let i = 0; i < text.length; i += 7777) p.push(text.slice(i, i + 7777));
const rec = p.finish();
const same = parseCsvText(text);
check('chunked == whole parse', same.groups.raw.n === rec.groups.raw.n && same.events.length === rec.events.length);
check('header (BOM stripped)', rec.meta.header[0] === 'TimeStamp' && rec.meta.header.length === 61);
check('raw rows = data rows', rec.groups.raw.n === N, `${rec.groups.raw.n}`);
check('events kept', rec.events.length === 4 && rec.meta.eventCounts.marker === 2 && rec.meta.eventCounts.blink === 1 && rec.meta.eventCounts.connect === 1, JSON.stringify(rec.meta.eventCounts));
check('event rows do not break held values', !Array.from(rec.groups.hsi.cols.HeadBandOn).some(Number.isNaN));
check('bands deduped (held)', rec.groups.bands.n < N / 20 && rec.groups.bands.n > 100, `${rec.groups.bands.n}`);
check('leading empty bands skipped', rec.groups.bands.t[0] > 1.0, `${rec.groups.bands.t[0]}`);
check('optics present 1..8 only', JSON.stringify(rec.meta.columns.optics) === JSON.stringify(Array.from({ length: 8 }, (_, i) => `Optics${i + 1}`)));
check('optics ~64 Hz', near(rec.groups.optics.n / 21, 64, 6), `${rec.groups.optics.n}`);
check('empty columns dropped (no gyro/mm group)', !rec.groups.gyro && !rec.groups.mm);
const hrv = Array.from(rec.groups.hr.cols.Heart_Rate);
check('HR: long empty stretch -> one NaN, values held', rec.groups.hr.n === 3 && hrv[0] === 70 && Number.isNaN(hrv[1]) && hrv[2] === 72, `${hrv}`);
check('sample rate ~256', near(rec.meta.fs, 256, 0.5), rec.meta.fs.toFixed(2));
check('one gap found', rec.gaps.length === 1 && near(rec.gaps[0][1] - rec.gaps[0][0], 1.004, 0.01), JSON.stringify(rec.gaps));
check('duration', near(rec.meta.duration, 21, 0.05), rec.meta.duration.toFixed(3));
check('estimateTiming no gaps', estimateTiming(Float64Array.from({ length: 1000 }, (_, i) => i / 250)).gaps.length === 0);
const hsiGood = heldShare(rec.groups.hsi.t, rec.groups.hsi.cols.HSI_TP9, (v) => v <= 1, 0, rec.meta.duration);
check('HSI TP9 good ~50%', near(hsiGood, 0.5, 0.05), hsiGood.toFixed(3));
check('valueAt held', valueAt(rec.groups.battery.t, rec.groups.battery.cols.Battery, 0.5) === 90);
check('lowerBound', lowerBound(Float64Array.from([0, 1, 2, 3]), 1.5) === 2);
const sm = smoothSeries(Float64Array.from([0, 1, 2, 3, 4]), Float32Array.from([0, 10, NaN, 10, 0]), 2.1);
check('smooth ignores NaN', near(sm[1], 5, 1e-6) && Number.isNaN(sm[2]), Array.from(sm).join(','));

// analysis on the synthetic file
const dsp = dspChannels(rec);
check('dsp NaN at gap start', Number.isNaN(dsp[0][gapAt]) && Number.isFinite(dsp[0][gapAt - 1]));
const filt = bandpassZeroPhase(dsp[0], rec.meta.fs);
let mean = 0; for (let i = 300; i < 2000; i++) mean += filt[i]; mean /= 1700;
check('band-pass removes 800 µV offset', Math.abs(mean) < 1, mean.toFixed(3));
const spec = spectrogram(dsp.map((c) => bandpassZeroPhase(c, rec.meta.fs)), dsp, rec.groups.raw.t, rec.meta.fs);
const psd = rangePsd(spec, 0, 30);
const peakF = psd.freqs[psd.ch.TP9.indexOf(Math.max(...psd.ch.TP9))];
check('PSD peak at 10 Hz', near(peakF, 10, 0.6), peakF.toFixed(2));
const cohMean = Array.from(spec.coherence.cols.coherence).filter(Number.isFinite);
check('TP9-TP10 coherence high for same sine', cohMean.length > 0 && cohMean.every((v) => v > 0.9), `${cohMean.length}`);
const bd = bandDerived(rec.groups.bands);
check('relative bands sum to 1', near(['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'].reduce((s, b) => s + bd.rel.cols[`${b}_TP9`][5], 0), 1, 1e-5));
check('FAA = ln10 * (AF8 - AF7)', near(bd.ratios.cols.faa[5], Math.LN10 * 0.01, 1e-4), bd.ratios.cols.faa[5].toFixed(5));
const fn = fnirsReplay(rec.groups.optics);
check('fNIRS replay runs', fn && fn.n > 50 && fn.channels === 8, `${fn?.n}`);
const segs = markerSegments(rec);
check('3 marker segments', segs.length === 3, JSON.stringify(segs.map((s) => [s.a.toFixed(1), s.b.toFixed(1)])));
const sum = computeSummary(rec, { bandAbs: bd.abs, bandRel: bd.rel, ratios: bd.ratios, artifacts: artifactSeries(dsp, rec.groups.raw.t, rec.meta.fs) });
check('summary headband 100%', near(sum.headbandOn, 1, 1e-6) && near(sum.battery.start, 90, 1e-6), JSON.stringify({ hb: sum.headbandOn, bat: sum.battery }));

// ---- real recording smoke run (summary only)
const def = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'mindMonitor_2026-10-10--21-37-54_brainarcade.csv');
const real = process.argv[2] || def;
if (!fs.existsSync(real)) console.log(`SKIP real data: ${real} not found`);
else {
  const t1 = Date.now();
  const rp = createCsvParser();
  await new Promise((res, rej) => {
    fs.createReadStream(real, { encoding: 'utf8', highWaterMark: 1 << 20 }).on('data', (c) => rp.push(c)).on('end', res).on('error', rej);
  });
  const r = rp.finish();
  const tParse = Date.now() - t1;
  const m = r.meta;
  console.log(`file=${path.basename(real)} rows=${m.rows} dur=${m.duration.toFixed(1)}s fs=${m.fs.toFixed(2)} gaps=${r.gaps.length} parse=${tParse}ms`);
  console.log(`groups=${Object.entries(r.groups).map(([g, v]) => `${g}:${v.n}x${Object.keys(v.cols).length}`).join(' ')} events=${JSON.stringify(m.eventCounts)} badTs=${m.badTimestamps} back=${m.backSteps}`);
  check('real: header 61 cols', m.header.length === 61);
  check('real: fs 250-262', m.fs > 250 && m.fs < 262);
  check('real: has raw + bands', !!r.groups.raw && !!r.groups.bands);
  const t2 = Date.now();
  const d = dspChannels(r);
  const f = d.map((c) => bandpassZeroPhase(c, m.fs));
  const art = artifactSeries(d, r.groups.raw.t, m.fs);
  const sp = spectrogram(f, d, r.groups.raw.t, m.fs);
  const ps = pafSeries(d, r.groups.raw.t, m.fs);
  const op = overallPaf(d, m.fs, m.duration);
  const b2 = bandDerived(r.groups.bands);
  const fr = fnirsReplay(r.groups.optics);
  const mo = motionSeries(r.groups.acc, r.groups.gyro, m.duration);
  const s = computeSummary(r, { bandAbs: b2.abs, bandRel: b2.rel, ratios: b2.ratios, artifacts: art, motion: mo, paf: ps, coherence: sp.coherence, fnirs: fr });
  console.log(`analysis=${Date.now() - t2}ms frames=${sp.n} pafWin=${ps.n} PAF=${op.paf?.toFixed(2)} (${op.source}, conf ${op.confidence.toFixed(2)}) fnirs=${fr?.n} ready@${fr?.baselineReadyAt?.toFixed(1)}`);
  console.log(`summary: hb=${(s.headbandOn * 100).toFixed(1)}% hsi=${JSON.stringify(Object.fromEntries(Object.entries(s.hsiGood).map(([k, v]) => [k, +(v * 100).toFixed(1)])))} art=${(s.artifact.any * 100).toFixed(1)}% move=${(s.moving * 100).toFixed(1)}% rel=${JSON.stringify(Object.fromEntries(Object.entries(s.bandsRel).map(([k, v]) => [k, +(v * 100).toFixed(1)])))} faa=${s.faa?.toFixed(3)} tbr=${s.thetaBeta?.toFixed(2)} coh=${s.coherence?.toFixed(2)} pafPostMean=${s.pafMetrics.posteriorMean?.toFixed(2)} hr=${s.hr ? s.hr.mean.toFixed(1) : 'none'}`);
  check('real: analysis produced frames', sp.n > 10 && ps.n > 5);
}
process.exit(failed ? 1 : 0);
