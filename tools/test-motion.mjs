// Node check for src/lib/motion.js: states, missing gyro, tilt reference, packet timestamps.
// Run: node tools/test-motion.mjs
import { MotionTracker, MOVING_DPS, BIG_MOVE_DPS, HANG_MS, REF_STILL_MS, IMU_HZ, gyroMissing } from '../src/lib/motion.js';

let pass = 0;
let fail = 0;
function check(name, ok, info = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`);
}

const STEP = 1000 / IMU_HZ;
const flat = { x: 0, y: 0, z: 1 }; // head level: gravity on z
const reading = (t, gyro, acc = flat) => ({ timestamp: t, acc, gyro });

// Feed `ms` of readings at the Athena rate, starting at t0; returns the end time
function feed(tr, t0, ms, gyro, acc) {
  let t = t0;
  for (; t < t0 + ms; t += STEP) tr.push(reading(t, gyro, acc));
  return t;
}

// 1. Still head: state 'still', tiny gyro
{
  const tr = new MotionTracker();
  let t = feed(tr, 0, 1000, { x: 0.3, y: -0.2, z: 0.4 });
  tr.snapshot(t);
  t = feed(tr, t, 1000, { x: 0.3, y: -0.2, z: 0.4 });
  const s = tr.snapshot(t);
  check('still head is still', s.state === 'still' && s.available, `${s.state}, ${s.gyroDps} °/s`);
  check('rate is close to 52/s', Math.abs(s.ratePerS - 52) <= 3, `${s.ratePerS}`);
}

// 2. Moving and big move, then back to still after the hang time
{
  const tr = new MotionTracker();
  let t = feed(tr, 0, 1000, { x: 0.3, y: 0, z: 0 });
  t = feed(tr, t, 200, { x: MOVING_DPS + 10, y: 0, z: 0 });
  check('turn over the limit is moving', tr.snapshot(t).state === 'moving');
  t = feed(tr, t, 200, { x: BIG_MOVE_DPS + 20, y: 0, z: 0 });
  const big = tr.snapshot(t);
  check('fast turn is a big move', big.state === 'bigMove' && big.gyroDps >= BIG_MOVE_DPS, `${big.gyroDps} °/s`);
  t = feed(tr, t, HANG_MS - 100, { x: 0.3, y: 0, z: 0 });
  check('state holds inside the hang time', tr.snapshot(t).state === 'bigMove');
  t = feed(tr, t, 300, { x: 0.3, y: 0, z: 0 });
  check('still again after the hang time', tr.snapshot(t).state === 'still');
}

// 3. Missing gyro (parser writes 0,0,0) is not "still"
{
  check('gyroMissing(0,0,0)', gyroMissing({ x: 0, y: 0, z: 0 }) && !gyroMissing({ x: 0, y: 0.01, z: 0 }));
  const tr = new MotionTracker();
  let t = feed(tr, 0, 500, { x: 0.3, y: 0, z: 0 });
  tr.snapshot(t);
  t = feed(tr, t, 1500, { x: 0, y: 0, z: 0 });
  const s = tr.snapshot(t);
  check('only zero gyro for 1.5 s is missing', s.state === 'missing' && s.gyroMissingShare === 1, `${s.state}, share ${s.gyroMissingShare}`);
  check('accelerometer still counts as available', s.available === true);
}

// 4. No readings at all
{
  const tr = new MotionTracker();
  const s = tr.snapshot(5000);
  check('no readings is missing and not available', s.state === 'missing' && !s.available);
  feed(tr, 0, 500, { x: 0.3, y: 0, z: 0 });
  check('readings stop: missing after 1 s', tr.snapshot(2000).state === 'missing');
}

// 5. Tilt against the automatic reference (first 2 s still)
{
  const tr = new MotionTracker();
  let t = feed(tr, 0, REF_STILL_MS + 200, { x: 0.3, y: 0, z: 0 });
  let s = tr.snapshot(t);
  check('automatic reference after 2 s still', s.hasRef && s.tiltDeg === 0, `ref ${s.hasRef}, tilt ${s.tiltDeg}`);
  const a = (30 * Math.PI) / 180;
  t = feed(tr, t, 3000, { x: 0.3, y: 0, z: 0 }, { x: Math.sin(a), y: 0, z: Math.cos(a) }); // head 30° forward
  s = tr.snapshot(t);
  check('30° head drop gives tiltDeg ≈ 30', Math.abs(s.tiltDeg - 30) <= 2, `${s.tiltDeg}°`);
  check('pitch follows the drop', Math.abs(s.pitch - 30) <= 2, `${s.pitch}°`);
}

// 6. Manual reference wins over the automatic one
{
  const tr = new MotionTracker();
  const a = (20 * Math.PI) / 180;
  let t = feed(tr, 0, 3000, { x: 0.3, y: 0, z: 0 }, { x: Math.sin(a), y: 0, z: Math.cos(a) });
  check('setReference() works', tr.setReference());
  t = feed(tr, t, 3000, { x: 0.3, y: 0, z: 0 });
  const s = tr.snapshot(t);
  check('tilt is measured from the saved pose', Math.abs(s.tiltDeg - 20) <= 2, `${s.tiltDeg}°`);
  tr.clearReference();
  check('clearReference() removes it', !tr.snapshot(t).hasRef);
}

// 7. One BLE packet: several readings with the same timestamp are spread, not stacked
{
  const tr = new MotionTracker();
  for (let i = 0; i < 6; i++) tr.push(reading(1000, { x: 0.3, y: 0, z: 0 }));
  check('packet readings are spread at the nominal rate', Math.abs(tr._t - (1000 + 5 * STEP)) < 0.01, `${tr._t.toFixed(1)} ms`);
}

// 8. Snapshot resets the peak
{
  const tr = new MotionTracker();
  let t = feed(tr, 0, 300, { x: 45, y: 0, z: 0 });
  tr.snapshot(t);
  t = feed(tr, t, 300, { x: 0.3, y: 0, z: 0 });
  check('peak resets each snapshot', tr.snapshot(t).gyroDps < 1);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
