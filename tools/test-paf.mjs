// Validation of src/lib/paf.js. Usage: node tools/test-paf.mjs [csvPath] [seconds]
// (1) synthetic 9.5 Hz + 1/f noise -> PAF within 0.2 Hz  (2) real Mind Monitor CSV (first ~3 min of RAW_*)
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { computePaf, calibrate, personalBands, channelSpectrum } from '../src/lib/paf.js';

const FS = 256;
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };

function pinkNoise(n, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0; // Paul Kellet pink filter
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2;
    b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    out[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return out;
}
function synth(f, amp, n, seed) {
  const noise = pinkNoise(n, seed);
  return Array.from(noise, (v, i) => v * 8 + amp * Math.sin(2 * Math.PI * f * i / FS + seed));
}
for (const f of [7.5, 9.5, 11.5]) {
  const n = FS * 30;
  const ch = { TP9: synth(f, 6, n, 1), AF7: synth(f, 2, n, 2), AF8: synth(f, 2, n, 3), TP10: synth(f, 6, n, 4) };
  const r = computePaf(ch, FS);
  check(`synthetic ${f} Hz`, r.found && Math.abs(r.paf - f) <= 0.2, `paf=${r.paf?.toFixed(2)} conf=${r.confidence.toFixed(2)}`);
}
{ // no peak: pure noise
  const n = FS * 30;
  const ch = { TP9: synth(9, 0, n, 11), AF7: synth(9, 0, n, 12), AF8: synth(9, 0, n, 13), TP10: synth(9, 0, n, 14) };
  const r = computePaf(ch, FS);
  console.log('noise conf/prom', r.confidence, r.prominenceDb); check('noise only -> no PAF', !r.found, `found=${r.found} paf=${r.paf}`);
  // reactivity: closed has alpha, open does not
  const closed = { TP9: synth(9.5, 8, n, 21), AF7: synth(9.5, 2, n, 22), AF8: synth(9.5, 2, n, 23), TP10: synth(9.5, 8, n, 24) };
  const open = { TP9: synth(9.5, 2, n, 31), AF7: synth(9.5, 1, n, 32), AF8: synth(9.5, 1, n, 33), TP10: synth(9.5, 2, n, 34) };
  const c = calibrate(closed, open, FS);
  check('reactivity > 1.2', c.reactivity > 1.2 && !c.fitWarning, `reactivity=${c.reactivity?.toFixed(2)}`);
  const b = personalBands(9.5);
  check('personal bands 9.5', b.alpha[0] === 7.5 && b.alpha[1] === 11.5 && b.theta[0] === 3.5 && b.theta[1] === 7.5);
}

{ // artifact rejection: blinks, motion bursts and zero-filled gaps must not move the PAF
  const n = FS * 60;
  const dirty = (arr, seed) => {
    const a = Array.from(arr);
    for (let k = 0; k < 12; k++) { // blinks: 300 uV, ~0.3 s every ~4.7 s
      const at = Math.floor((k * 4.7 + 1) * FS);
      for (let i = 0; i < 80; i++) a[at + i] += 300 * Math.sin((Math.PI * i) / 80);
    }
    for (let i = 0; i < FS * 6; i++) a[FS * 20 + i] += 250 * Math.sin(2 * Math.PI * 3 * i / FS + seed) + (i % 7) * 20; // motion
    for (let i = 0; i < FS * 5; i++) a[FS * 40 + i] = 0; // zero-filled dropout
    return a;
  };
  const f = 9.5;
  const clean = { TP9: synth(f, 6, n, 41), AF7: synth(f, 2, n, 42), AF8: synth(f, 2, n, 43), TP10: synth(f, 6, n, 44) };
  const bad = { TP9: dirty(clean.TP9, 1), AF7: dirty(clean.AF7, 2), AF8: dirty(clean.AF8, 3), TP10: dirty(clean.TP10, 4) };
  const r = computePaf(bad, FS);
  check('spikes/motion/zero-fill: PAF within 0.2 Hz', r.found && Math.abs(r.paf - f) <= 0.2, `paf=${r.paf?.toFixed(2)}`);
  const sp = channelSpectrum(bad.TP9, FS);
  const spClean = channelSpectrum(clean.TP9, FS);
  check('artifact windows are dropped', sp.rejected > 10 && sp.spectra.length < spClean.spectra.length, `rejected=${sp.rejected} kept=${sp.spectra.length}/${spClean.spectra.length}`);
  check('flat channel -> no spectrum', channelSpectrum(new Array(FS * 20).fill(0), FS) === null);
  check('railed channel -> no spectrum', channelSpectrum(Array.from({ length: FS * 20 }, (_, i) => (i % 8 < 4 ? 800 : -800)), FS) === null);
}

// Real data
const dir = 'C:/Backup/CoDiNG/Muse_Capture&Analysis';
const seconds = Number(process.argv[3]) || 180;
const csvs = fs.readdirSync(dir).filter((f) => /^mindMonitor_.*\.csv$/.test(f) && !/_PAF_|_\d\.csv$/.test(f))
  .map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);

async function readRaw(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let idx = null; const cols = [[], [], [], []];
  const max = seconds * FS;
  for await (const line of rl) {
    if (!idx) { const h = line.split(','); idx = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10'].map((c) => h.indexOf(c)); continue; }
    const p = line.split(',');
    const v = idx.map((i) => parseFloat(p[i]));
    if (v.some((x) => !Number.isFinite(x))) continue;
    v.forEach((x, k) => cols[k].push(x));
    if (cols[0].length >= max) break;
  }
  rl.close();
  return cols;
}
let used = null, cols = null;
if (process.argv[2]) { used = process.argv[2]; cols = await readRaw(used); }
else for (const f of csvs) { const c = await readRaw(f); if (c[0].length >= FS * 20) { used = f; cols = c; break; } }
if (!cols) { console.log('SKIP real data: no CSV with >= 20 s of RAW'); }
else {
  const ch = { TP9: cols[0], AF7: cols[1], AF8: cols[2], TP10: cols[3] };
  const r = computePaf(ch, FS);
  console.log(`file=${path.basename(used)} seconds=${(cols[0].length / FS).toFixed(0)}`);
  console.log(`REAL PAF=${r.paf?.toFixed(3)} found=${r.found} source=${r.source} conf=${r.confidence.toFixed(2)} prom=${r.prominenceDb.toFixed(1)}dB perCh=${JSON.stringify(r.channelPaf)}`);
  check('real data produces a result object', typeof r.found === 'boolean');
}
process.exit(failed ? 1 : 0);
