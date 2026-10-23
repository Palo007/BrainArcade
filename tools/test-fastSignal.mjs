// Tests for src/lib/fastSignal.js: stale, blink, muscle, eye move, eyes closed, sleepy, bands, robust z.
// Usage: node tools/test-fastSignal.mjs
import {
  WINDOW_SAMPLES, MIN_NEW_SAMPLES, STALE_MS, BLINK_HOLD_MS, TICK_MS,
  fastBands, blinkHoldMs, robustStats, robustZ, measure, makeFrame, freshFrame, createChecks, signalBaseline,
} from '../src/lib/fastSignal.js';
import { getDeviceProfile } from '../src/lib/deviceProfile.js';
import { BANDS } from '../src/lib/signal.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };

const FS = 256;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const noise = (n, amp = 5) => Array.from({ length: n }, () => rnd() * amp);
const sine = (n, f, amp) => Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / FS));
const add = (a, b) => a.map((v, i) => v + b[i]);
const alphaWave = (n) => sine(n, 10, 4);
const bufsOf = (n = WINDOW_SAMPLES) => [0, 1, 2, 3].map(() => add(noise(n), alphaWave(n)));
const bands = fastBands(BANDS);

// ---- bands
const pb = fastBands({ delta: [1, 3], theta: [3, 8], alpha: [8, 12], beta: [12, 30], gamma: [30, 44] });
check('bands: theta starts at 4 Hz', pb.theta[0] === 4 && pb.theta[1] === 8);
check('bands: beta capped at 25 Hz', pb.beta[0] === 12 && pb.beta[1] === 25);
check('bands: muscle 30-45 Hz', pb.muscle[0] === 30 && pb.muscle[1] === 45);

// ---- robust z
const rs = robustStats([1, 2, 3, 4, 100]);
check('robust: median ignores the outlier', rs.median === 3);
check('robust: MAD scaled to SD', Math.abs(rs.mad - 1.4826) < 1e-9);
check('robust: z', Math.abs(robustZ(3 + 1.4826, rs) - 1) < 1e-9);
check('robust: no values -> null', robustStats([NaN]) === null);

// ---- stale
check('stale: window not full -> no frame', measure(bufsOf(WINDOW_SAMPLES - 1), bands) === null);
const bufs = bufsOf(WINDOW_SAMPLES + 32);
check('stale: too few new samples -> no frame', makeFrame(bufs, MIN_NEW_SAMPLES - 1, bands, 1000) === null);
const fr = makeFrame(bufs, MIN_NEW_SAMPLES, bands, 1000);
check('stale: enough new samples -> frame', !!fr && fr.at === 1000 && fr.sensors.length === 4);
check('stale: fresh just under 400 ms', freshFrame(fr, 1000 + STALE_MS - 1) === fr);
check('stale: 400 ms old -> stale', freshFrame(fr, 1000 + STALE_MS) === null);
check('stale: no frame -> null', freshFrame(null, 1000) === null);
check('stale: tick is 125 ms (8/s)', TICK_MS === 125);

// ---- blink
check('blink: hold from the athena profile is 1.4 s', blinkHoldMs(getDeviceProfile('athena')) === 1400);
check('blink: hold from the classic profile is 1.4 s', blinkHoldMs(getDeviceProfile('classic')) === 1400);
check('blink: no profile -> default', blinkHoldMs(null) === BLINK_HOLD_MS);
check('blink: inside the hold', makeFrame(bufs, 32, bands, 5000, { lastBlinkMs: 5000 - 1399 }).blink === true);
check('blink: after the hold', makeFrame(bufs, 32, bands, 5000, { lastBlinkMs: 5000 - 1400 }).blink === false);
check('blink: never blinked', makeFrame(bufs, 32, bands, 5000).blink === false);
check('blink: profile hold is used', makeFrame(bufs, 32, bands, 5000, { lastBlinkMs: 4000, holdMs: 900 }).blink === false);

// ---- measure: muscle band and eye move
const N = WINDOW_SAMPLES;
const mbufs = bufsOf(N);
mbufs[0] = add(mbufs[0], sine(N, 38, 20));
const mf = measure(mbufs, bands);
check('measure: 38 Hz on TP9 shows in its muscle band', mf.muscle[0] > 20 * mf.muscle[3], `(${mf.muscle[0].toFixed(1)} vs ${mf.muscle[3].toFixed(1)})`);
const quiet = measure(bufsOf(N), bands);
const ebufs = bufsOf(N);
const step = Array.from({ length: N }, (_, i) => (i > N / 2 ? 40 : 0)); // a sideways look: AF7 up, AF8 down
ebufs[1] = add(ebufs[1], step);
ebufs[2] = add(ebufs[2], step.map((v) => -v));
const ef = measure(ebufs, bands);
check('measure: eye move shows in slow AF7-AF8', ef.eyeMove > 10 * quiet.eyeMove, `(${ef.eyeMove.toFixed(0)} vs ${quiet.eyeMove.toFixed(0)})`);
const bb = bufsOf(N);
bb[1] = add(bb[1], step);
bb[2] = add(bb[2], step); // same on both = a blink-like wave, not an eye move
check('measure: same wave on AF7 and AF8 is not an eye move', measure(bb, bands).eyeMove < 3 * quiet.eyeMove);

// ---- flags on synthetic frames
const BASE = { alpha: 1, theta: 1, delta: 1, muscle: [1, 1, 1, 1], eyeMove: 1 };
const frame = (o = {}) => ({ frontal: { alpha: 1, theta: 1, delta: 1, beta: 1 }, muscle: [1, 1, 1, 1], eyeMove: 1, blink: false, ...o });
const dt = TICK_MS / 1000;
function run(c, frames, t0 = 0) {
  let out = null, t = t0;
  for (const f of frames) { t += TICK_MS; out = c.update(f, BASE, dt, t); }
  return { out, t };
}

let c = createChecks();
check('muscle: no base -> all off', c.update(frame(), null, dt, 0).muscle === false);
let r = run(c, [...Array(3)].map(() => frame({ muscle: [5, 1, 1, 1] })));
check('muscle: 3 frames (<0.5 s) above 2x -> no hold', r.out.muscle === false);
r = run(c, [frame({ muscle: [5, 1, 1, 1] })], r.t);
check('muscle: 4 frames (0.5 s) above 2x -> hold', r.out.muscle === true && r.out.muscleSite === 'ears');
r = run(c, [frame()], r.t);
check('muscle: held a little after the burst', r.out.muscle === true);
r = run(c, [...Array(4)].map(() => frame()), r.t);
check('muscle: hold ends 0.5 s after the burst', r.out.muscle === false && r.out.muscleSite === null);
c = createChecks();
r = run(c, [...Array(4)].map(() => frame({ muscle: [1, 5, 1, 1] })));
check('muscle: forehead burst', r.out.muscleSite === 'forehead');
c = createChecks();
r = run(c, [...Array(4)].map(() => frame({ muscle: [5, 5, 1, 1] })));
check('muscle: forehead and ears', r.out.muscleSite === 'both');
c = createChecks();
r = run(c, [...Array(4)].map(() => frame({ muscle: [1.9, 1.9, 1.9, 1.9] })));
check('muscle: just under 2x -> no hold', r.out.muscle === false);
c = createChecks();
r = run(c, [...Array(480)].map(() => frame({ muscle: [3, 1, 1, 1] }))); // 60 s of steady tension
check('muscle: steady tension -> tense hint', r.out.tense === true);
check('muscle: steady tension -> slow reference catches up, no hold', r.out.muscle === false);

c = createChecks();
r = run(c, [frame({ eyeMove: 4 })]);
check('eye move: jump above 3x the quiet level', r.out.eyeMove === true);
r = run(c, [...Array(4)].map(() => frame()), r.t);
check('eye move: ends 0.5 s later', r.out.eyeMove === false);
c = createChecks();
r = run(c, [frame({ eyeMove: 2.5 })]);
check('eye move: small change -> no flag', r.out.eyeMove === false);
c = createChecks();
r = run(c, [frame({ eyeMove: 10, blink: true })]);
check('eye move: blink frames are skipped', r.out.eyeMove === false);

c = createChecks();
r = run(c, [...Array(16)].map(() => frame({ frontal: { alpha: 2, theta: 1, delta: 1, beta: 1 } })), 10000);
check('eyes closed: alpha up 2 s, no blink -> flag', r.out.eyes === true);
c = createChecks();
let o = null;
for (let i = 0, t = 10000; i < 16; i++) { t += TICK_MS; o = c.update(frame({ frontal: { alpha: 2, theta: 1, delta: 1, beta: 1 } }), BASE, dt, t, { lastBlinkMs: t - 1000 }); }
check('eyes closed: a recent blink means eyes are open', o.eyes === false);
c = createChecks();
r = run(c, [...Array(41)].map(() => frame({ frontal: { alpha: 1, theta: 2, delta: 2, beta: 1 } })));
check('sleepy: theta and delta up 5 s -> flag', r.out.sleepy === true);
c = createChecks();
r = run(c, [...Array(41)].map(() => frame({ frontal: { alpha: 1, theta: 2, delta: 1, beta: 1 } })));
check('sleepy: theta alone -> no flag', r.out.sleepy === false);

const sb = signalBaseline([frame({ muscle: [1, 2, 3, 4], eyeMove: 2 }), frame({ muscle: [1, 2, 3, 4], eyeMove: 4 }), frame({ muscle: [1, 2, 3, 4], eyeMove: 6 })]);
check('baseline: medians per sensor', sb.muscle.join() === '1,2,3,4' && sb.eyeMove === 4 && sb.alpha === 1);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
