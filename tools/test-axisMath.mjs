// Validation of src/lib/axisMath.js. Usage: node tools/test-axisMath.mjs
import { centered01, rise01, createDriftLevel } from '../src/lib/axisMath.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// linear mapping = old JoystickContext normalizeRatio (games keep their feel)
check('linear x1.5 range 0.6 = 0.9167', near(centered01(1.5, { range: 0.6 }), 0.5 + 0.5 * 0.5 / 0.6));
check('linear null = 0.5', centered01(null) === 0.5);
check('linear rise x1.3 range 0.6 = 0.5', near(rise01(1.3, { range: 0.6 }), 0.5));
check('rise null = 0', rise01(null) === 0);

// log mapping is symmetric: ×k and ÷k sit the same distance from 0.5
for (const k of [1.2, 1.5, 2]) {
  const up = centered01(k, { range: 0.6, mapping: 'log' });
  const down = centered01(1 / k, { range: 0.6, mapping: 'log' });
  check(`log x${k} and /${k} symmetric`, near(up - 0.5, 0.5 - down), `up=${up.toFixed(3)} down=${down.toFixed(3)}`);
}
check('log x1.6 range 0.6 = 1', near(centered01(1.6, { range: 0.6, mapping: 'log' }), 1));

// drift tracker: a held +40 % step
const hold = (tauS, seconds) => {
  const d = createDriftLevel();
  let out = 1;
  d(1, 10, 0, tauS); // start at baseline
  for (let ms = 250; ms <= seconds * 1000; ms += 250) out = d(1.4, 10, ms, tauS);
  return out;
};
check('tau 90 s: held change halves within 2 min', centered01(hold(90, 120), { range: 0.6 }) < 0.6);
check('tau 600 s: held change keeps > 85 % after 60 s', hold(600, 60) - 1 > 0.85 * 0.4, `r=${hold(600, 60).toFixed(3)}`);
// new baseline restarts the tracker
{
  const d = createDriftLevel();
  d(1, 10, 0, 90);
  for (let ms = 250; ms <= 60000; ms += 250) d(1.4, 10, ms, 90);
  check('new baseline restarts at r', near(d(1.4, 11, 60250, 90), 1.4));
}
// render rate does not matter (time based)
{
  const a = createDriftLevel(), b = createDriftLevel();
  a(1, 10, 0, 90); b(1, 10, 0, 90);
  let ra, rb;
  for (let ms = 50; ms <= 30000; ms += 50) ra = a(1.4, 10, ms, 90);
  for (let ms = 1000; ms <= 30000; ms += 1000) rb = b(1.4, 10, ms, 90);
  check('same result at 20 Hz and 1 Hz calls', near(ra, rb, 1e-9), `${ra.toFixed(6)} vs ${rb.toFixed(6)}`);
}

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
