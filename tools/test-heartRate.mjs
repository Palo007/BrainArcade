// Node check for src/lib/heartRate.js. Run: node tools/test-heartRate.mjs
import { HeartRateEstimator } from '../src/lib/heartRate.js';
import { MMRecorder, COLUMNS } from '../src/lib/mmRecorder.js';

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
  if (!ok) fails++;
};

// deterministic noise
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) - 0.5;

// Optics sample (8 ch) with pulse on the inner IR channels, noise, slow drift
function sample(t, bpm, { amp = 0.002, noise = 0.0008, drift = 0.01, pulse = true } = {}) {
  const ph = 2 * Math.PI * (bpm / 60) * t;
  const p = pulse ? (Math.sin(ph) + 0.3 * Math.sin(2 * ph + 1)) * amp : 0;
  const d = drift * Math.sin(2 * Math.PI * 0.03 * t) + 0.002 * t / 60;
  const ch = (base) => base * 10 ** -(p + d + noise * rnd());
  return [8, 8, 9, 9, 12, 12, ch(13), ch(13.2)];
}

function run(bpmOf, seconds, fs, opts, est = new HeartRateEstimator({ fs })) {
  const out = [];
  const n = Math.round(seconds * fs);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    est.push(sample(t, typeof bpmOf === 'function' ? bpmOf(t) : bpmOf, opts), 1e6 + t * 1000);
    if ((i + 1) % fs === 0) out.push(est.bpm);
  }
  return { est, out };
}

for (const fs of [64, 16]) {
  const { out } = run(72, 40, fs);
  const last = out[out.length - 1];
  check(`72 BPM @${fs} Hz within +-3`, last !== null && Math.abs(last - 72) <= 3, String(last && last.toFixed(1)));
  check(`null before the window fills @${fs} Hz`, out[3] === null);
  const tail = out.slice(15);
  check(`stable after warm-up @${fs} Hz`, tail.every((v) => v !== null && Math.abs(v - 72) <= 3));
}

for (const bpm of [48, 95, 140]) {
  const { out } = run(bpm, 40, 64);
  const last = out[out.length - 1];
  check(`${bpm} BPM within +-3`, last !== null && Math.abs(last - bpm) <= 3, String(last && last.toFixed(1)));
}

{ // measured rate differs from nominal: constructed for 64 Hz, data really at 25 Hz
  const { out } = run(66, 50, 25, undefined, new HeartRateEstimator({ fs: 64 }));
  const last = out[out.length - 1];
  check('rate measured when nominal is wrong', last !== null && Math.abs(last - 66) <= 3, String(last && last.toFixed(1)));
}

{ // flat (no pulse, no noise) -> null
  const { out } = run(72, 30, 64, { pulse: false, noise: 0, drift: 0 });
  check('flat signal -> null', out.every((v) => v === null));
}
{ // noise only -> null
  const { out } = run(72, 30, 64, { pulse: false, noise: 0.004 });
  check('noise only -> null', out.every((v) => v === null));
}
{ // dark / invalid samples -> null
  const est = new HeartRateEstimator({ fs: 64 });
  for (let i = 0; i < 64 * 20; i++) est.push([0, 0, 0, 0, 0, 0, 0, 0], 1e6 + i * 15.6);
  check('zero light -> null', est.bpm === null);
}
{ // pulse stops after 25 s -> value drops back to null
  const est = new HeartRateEstimator({ fs: 64 });
  let mid = null;
  for (let i = 0; i < 64 * 60; i++) {
    const t = i / 64;
    est.push(sample(t, 72, { pulse: t < 25 }), 1e6 + t * 1000);
    if (i === 64 * 24) mid = est.bpm;
  }
  check('pulse present then lost', mid !== null && Math.abs(mid - 72) <= 3 && est.bpm === null, `mid=${mid && mid.toFixed(1)} end=${est.bpm}`);
}
{ // heart rate change is tracked
  const { out } = run((t) => (t < 30 ? 60 : 100), 70, 64);
  const last = out[out.length - 1];
  check('tracks 60 -> 100 BPM', last !== null && Math.abs(last - 100) <= 4, String(last && last.toFixed(1)));
}

// Recorder column
{
  let csv = '';
  const rec = new MMRecorder({ onChunk: (t) => (csv += t) });
  const T0 = 1e12;
  rec.start(T0);
  const ci = COLUMNS.indexOf('Heart_Rate');
  for (let i = 0; i < 256 * 40; i++) {
    const t = i / 256;
    if (i % 4 === 0) rec.setOptics(sample(t, 72), T0 + t * 1000);
    rec.pushEeg([1, 2, 3, 4], T0 + t * 1000);
  }
  rec.flush();
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
  check('Heart_Rate empty at start', rows[10][ci] === '');
  const hr = +rows[rows.length - 1][ci];
  check('Heart_Rate written in CSV', rows[rows.length - 1].length >= ci && Number.isInteger(hr) && Math.abs(hr - 72) <= 3, String(rows[rows.length - 1][ci]));
}

console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails ? 1 : 0);
