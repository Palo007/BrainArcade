// Node check for src/lib/pulseAnalysis.js. Run: node tools/test-pulseAnalysis.mjs [recording.csv]
// Synthetic pulse with known beat intervals + breathing at 15 /min, a 16 Hz (pre-recorder-fix) variant,
// and a summary-only smoke run on a real 64 Hz recording when it is present.
import fs from 'node:fs';
import { analyzePulse, hrvInRange, respirationInRange, fuseRespiration } from '../src/lib/pulseAnalysis.js';
import { HeartRateEstimator } from '../src/lib/heartRate.js';
import { createCsvParser } from '../src/viewer/lib/csvParse.js';

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
  if (!ok) fails++;
};
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;

// Beats: mean IBI 0.95 s, RSA +-45 ms at 0.25 Hz (15 br/min), +-15 ms random beat-to-beat variation
const BR_HZ = 0.25, FS = 64, DUR = 420;
const beats = [];
for (let t = 1; t < DUR; ) {
  beats.push(t);
  t += 0.95 + 0.045 * Math.sin(2 * Math.PI * BR_HZ * t) + 0.03 * rnd();
}
const trueIbi = beats.slice(1).map((b, i) => b - beats[i]);
const trueRmssd = 1e3 * Math.sqrt(trueIbi.slice(1).reduce((s, v, i) => s + (v - trueIbi[i]) ** 2, 0) / (trueIbi.length - 1));

// Optics intensity: pulse shape at each beat, breathing modulates amplitude and baseline
function opticsAt(t) {
  let p = 0;
  // nearest beats only (pulse lasts < 0.6 s)
  let lo = 0, hi = beats.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (beats[m] < t - 0.8) lo = m + 1; else hi = m; }
  for (let k = lo; k < beats.length && beats[k] <= t + 0.1; k++) {
    const u = t - beats[k];
    p += Math.exp(-(((u - 0.02) / 0.09) ** 2)) + 0.35 * Math.exp(-(((u - 0.32) / 0.12) ** 2));
  }
  const br = Math.sin(2 * Math.PI * BR_HZ * t);
  const amp = 0.002 * (1 + 0.25 * br);
  const base = 0.004 * br + 0.01 * Math.sin(2 * Math.PI * 0.02 * t);
  const ch = (b0) => b0 * (1 - amp * p - base + 0.0002 * rnd());
  return [8, 8, 9, 9, 12, 12, ch(13), ch(13.2)];
}

function makeOptics(fs, rowTime) {
  const n = Math.floor(DUR * fs);
  const t = new Float64Array(n);
  const cols = Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`Optics${k + 1}`, new Float32Array(n)]));
  for (let i = 0; i < n; i++) {
    const v = opticsAt(i / fs);
    t[i] = rowTime(i);
    for (let k = 0; k < 8; k++) cols[`Optics${k + 1}`][i] = v[k];
  }
  return { t, n, cols };
}

// 1) 64 Hz with BLE-burst row times (4 samples share one row time, plus jitter) -> index clock must undo it
{
  const opt = makeOptics(FS, (i) => Math.floor(i / 4) * (4 / FS) + 0.06 * (rnd() + 0.5) * ((i % 4) === 0));
  for (let i = 1; i < opt.n; i++) if (opt.t[i] < opt.t[i - 1]) opt.t[i] = opt.t[i - 1];
  const r = analyzePulse(opt, { duration: DUR });
  check('64 Hz: HRV available, sample-index timebase', r?.hrvAvailable && r.timebase === 'sample index', r?.hrvReason || '');
  const h = r.hrv;
  check('64 Hz: RMSSD within 10 % of truth', Math.abs(h.rmssd - trueRmssd) / trueRmssd < 0.1, `${h.rmssd.toFixed(1)} vs ${trueRmssd.toFixed(1)} ms`);
  check('64 Hz: beats found', Math.abs(r.beats - beats.length) <= 4, `${r.beats} vs ${beats.length}`);
  check('64 Hz: few artifacts', h.artifactPct < 2, `${h.artifactPct.toFixed(1)} %`);
  check('64 Hz: mean HR', Math.abs(h.meanHR - 60 / 0.95) < 1, h.meanHR.toFixed(1));
  check('64 Hz: LF/HF for >= 5 min', Number.isFinite(h.lfhf), String(h.lfhf?.toFixed(2)));
  check('64 Hz: breathing 15 +-1.5 /min', Math.abs(r.resp.summary.median - 15) <= 1.5, `${r.resp.summary.median.toFixed(1)} (${r.resp.summary.accepted}/${r.resp.summary.windows} windows)`);
  check('64 Hz: most breathing windows accepted', r.resp.summary.accepted >= 0.8 * r.resp.summary.windows);
  const tr = Array.from(r.rmssd.v).filter(Number.isFinite);
  check('64 Hz: RMSSD track filled', tr.length >= r.rmssd.n - 1 && tr.every((v) => Math.abs(v - trueRmssd) / trueRmssd < 0.3), tr.map((v) => v.toFixed(0)).join(' '));
  const part = hrvInRange(r, 60, 180);
  check('range HRV (60-180 s)', part.available && Number.isFinite(part.rmssd) && part.lfhf === undefined, part.rmssd?.toFixed(1));
  const rr = respirationInRange(r.resp, 60, 180);
  check('range breathing', Math.abs(rr.median - 15) <= 1.5, rr.median.toFixed(1));
}

// 2) 16 Hz unique optics with arrival-time jitter (pre-fix recordings) -> HRV unavailable, breathing still there
{
  const opt = makeOptics(16, (i) => i / 16 + 0.04 * rnd());
  for (let i = 1; i < opt.n; i++) if (opt.t[i] <= opt.t[i - 1]) opt.t[i] = opt.t[i - 1] + 1e-3;
  const r = analyzePulse(opt, { duration: DUR });
  check('16 Hz: HRV unavailable with a reason', r && !r.hrvAvailable && r.hrv === null && /unique samples\/s/.test(r.hrvReason), r?.hrvReason);
  check('16 Hz: range HRV unavailable too', hrvInRange(r, 0, 100).available === false);
  check('16 Hz: breathing 15 +-1.5 /min', Math.abs(r.resp.summary.median - 15) <= 1.5, r.resp.summary.median.toFixed(1));
}

// 3) Fusion rules
check('fusion: primary pair agrees', Math.abs(fuseRespiration({ rifv: 15, riav: 16, riiv: 7, gyro: NaN }).v - 15.5) < 1e-9);
check('fusion: RIIV alone cannot rescue', Number.isNaN(fuseRespiration({ rifv: 15, riav: 9, riiv: 9.2, gyro: NaN }).v));
check('fusion: gyro picks one of the pair', Math.abs(fuseRespiration({ rifv: 15, riav: 9, riiv: NaN, gyro: 14.5 }).v - 14.75) < 1e-9);
check('fusion: all disagree -> rejected', Number.isNaN(fuseRespiration({ rifv: 20, riav: 9, riiv: 6, gyro: 30 }).v));

// 4) heartRate.js behaviour unchanged by the shared helpers (smoke)
{
  const est = new HeartRateEstimator({ fs: 64 });
  for (let i = 0; i < 64 * 20; i++) est.push(opticsAt(i / 64), 1e6 + (i / 64) * 1000);
  check('heartRate.js still estimates the synthetic pulse', est.bpm !== null && Math.abs(est.bpm - 60 / 0.95) < 4, String(est.bpm?.toFixed(1)));
}

// 5) Real recording smoke run (summary only)
const real = process.argv[2] || new URL('../../mindMonitor_2026-10-10--21-37-54_brainarcade.csv', import.meta.url);
if (fs.existsSync(real)) {
  const p = createCsvParser();
  p.push(fs.readFileSync(real, 'utf8'));
  const rec = p.finish();
  const r = analyzePulse(rec.groups.optics, { gyro: rec.groups.gyro, duration: rec.meta.duration });
  const h = r.hrv;
  const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
  console.log(`  real: optics ${f(r.effFs)} Hz (${r.timebase}), beats ${r.beats}, ` + (h
    ? `artifacts ${f(h.artifactPct)} %, HR ${f(h.meanHR)}, RMSSD ${f(h.rmssd)} ms, SDNN ${f(h.sdnn)} ms, pNN50 ${f(h.pnn50)} %`
    : `HRV unavailable: ${r.hrvReason}`) + `, breathing median ${f(r.resp.summary.median)} /min (${r.resp.summary.accepted}/${r.resp.summary.windows} windows)`);
  if (r.effFs > 60) check('real 64 Hz file: RMSSD plausible (45-58 ms)', h && h.rmssd > 45 && h.rmssd < 58);
} else console.log('  (real recording not found, smoke run skipped)');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
