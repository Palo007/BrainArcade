// Validation of src/lib/signal.js band powers. Usage: node tools/test-signal.mjs
// (1) DC offset / slow drift must not leak into delta  (2) each PSD bin belongs to exactly one band
// (3) segments marked bad (blinks) are skipped
import { computeWelchPSD, bandPowersFromPSD, BANDS, SAMPLE_RATE as FS } from '../src/lib/signal.js';
import { personalBands } from '../src/lib/paf.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };

const N = FS * 8;
const sines = (n) => 10 * Math.sin(2 * Math.PI * 2 * n / FS) + 10 * Math.sin(2 * Math.PI * 10 * n / FS);
const bandsOf = (sig) => { const { psd, freqRes } = computeWelchPSD(sig); return bandPowersFromPSD(psd, freqRes); };

// (1) DC offset and drift
const clean = bandsOf(Array.from({ length: N }, (_, n) => sines(n)));
for (const dc of [20, 100, 500]) {
  const b = bandsOf(Array.from({ length: N }, (_, n) => dc + sines(n)));
  const ratio = b.delta / clean.delta;
  check(`DC ${dc} µV leaves delta unchanged`, Math.abs(ratio - 1) < 0.02, `ratio=${ratio.toFixed(3)}`);
}
{
  const b = bandsOf(Array.from({ length: N }, (_, n) => 40 * n / N + sines(n))); // 40 µV drift over 8 s
  const ratio = b.delta / clean.delta;
  check('linear drift leaves delta unchanged', Math.abs(ratio - 1) < 0.02, `ratio=${ratio.toFixed(3)}`);
}

// (2) band edges: an 8 Hz sine is mostly alpha, not equally theta and alpha
{
  const b = bandsOf(Array.from({ length: N }, (_, n) => 10 * Math.sin(2 * Math.PI * 8 * n / FS)));
  check('8 Hz sine: theta < 0.3 x alpha', b.theta < 0.3 * b.alpha, `theta/alpha=${(b.theta / b.alpha).toFixed(2)}`);
}
// every bin 0.5..45 Hz counted once: band sum == sum of the bins, for standard and personal bands
{
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const { psd, freqRes } = computeWelchPSD(Array.from({ length: N }, () => 20 * rnd()));
  for (const [name, bands] of [['standard', BANDS], ['personal PAF 8.6', personalBands(8.6)], ['personal PAF 10.3', personalBands(10.3)]]) {
    const total = Object.values(bandPowersFromPSD(psd, freqRes, bands)).reduce((a, v) => a + v, 0);
    let bins = 0;
    for (let k = Math.ceil(0.5 / freqRes); k < Math.ceil(45 / freqRes); k++) bins += psd[k];
    check(`${name}: each bin in one band`, Math.abs(total / bins - 1) < 1e-6, `sum/bins=${(total / bins).toFixed(6)}`);
  }
}

// (3) artifact skip: a blink-like 150 µV bump in the newest second is left out when marked
{
  const base = Array.from({ length: N }, (_, n) => sines(n));
  const withBlink = base.map((v, n) => (n >= N - 200 && n < N - 120 ? v + 150 * Math.sin(Math.PI * (n - (N - 200)) / 80) : v));
  const marked = (a, b) => b > N - 230 && a < N - 90; // segment overlaps the padded blink
  const spec = (sig, isBad) => { const { psd, freqRes } = computeWelchPSD(sig, FS, 2, 1, isBad); return bandPowersFromPSD(psd, freqRes); };
  const ref = spec(base);
  const raw = spec(withBlink);
  const skipped = spec(withBlink, marked);
  check('unmarked blink inflates delta', raw.delta > 1.5 * ref.delta, `x${(raw.delta / ref.delta).toFixed(2)}`);
  check('marked blink is skipped', Math.abs(skipped.delta / ref.delta - 1) < 0.05, `x${(skipped.delta / ref.delta).toFixed(3)}`);
  const allBad = spec(withBlink, () => true);
  check('all segments bad: falls back to newest 3', Math.abs(allBad.delta / raw.delta - 1) < 1e-6);
}

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
