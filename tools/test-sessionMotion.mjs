// Node check: head motion per session (sessionTimeline.pushMotion / motionSummary) and the parent report lines.
// Run: node tools/test-sessionMotion.mjs
import assert from 'node:assert/strict';
import { SessionTimeline, TILTED_DEG } from '../src/lib/sessionTimeline.js';
import { buildParentSummary, motionLines } from '../src/lib/parentSummary.js';

let fails = 0;
const t = (name, fn) => {
  try { fn(); console.log('PASS', name); } catch (e) { fails += 1; console.log('FAIL', name, '-', e.message); }
};
const ch = (d, th, a, b, g) => ({ delta: d, theta: th, alpha: a, beta: b, gamma: g });
const keys = (lines) => lines.map((l) => l.key);
const text = (lines) => lines.map((l) => l.text).join(' ');

t('motion seconds are counted; missing is not a second', () => {
  const tl = new SessionTimeline();
  for (let i = 0; i < 6; i++) tl.pushMotion({ state: 'still', tiltDeg: 2 });
  tl.pushMotion({ state: 'moving', tiltDeg: TILTED_DEG + 5 });
  tl.pushMotion({ state: 'bigMove', tiltDeg: null });
  assert.equal(tl.pushMotion({ state: 'missing' }), false);
  assert.equal(tl.pushMotion({}), false);
  assert.deepEqual(tl.motionSummary(), { motionSec: 8, movingPct: 25, bigMovePct: 13, tiltedPct: 13 });
});

t('no motion data gives no summary (classic Muse, mock)', () => {
  assert.equal(new SessionTimeline().motionSummary(), null);
});

t('end() stops counting; clear() and reopen() start fresh', () => {
  const tl = new SessionTimeline();
  tl.pushMotion({ state: 'moving' });
  tl.end();
  assert.equal(tl.pushMotion({ state: 'moving' }), false);
  assert.equal(tl.motionSummary().motionSec, 1);
  tl.reopen();
  assert.equal(tl.motionSummary().motionSec, 1); // kept until the next push
  tl.pushMotion({ state: 'still' });
  assert.deepEqual(tl.motionSummary(), { motionSec: 1, movingPct: 0, bigMovePct: 0, tiltedPct: 0 });
  tl.clear();
  assert.equal(tl.motionSummary(), null);
});

t('a point after reopen() also clears the motion count', () => {
  const tl = new SessionTimeline();
  tl.pushMotion({ state: 'moving' });
  tl.end();
  tl.reopen();
  tl.push({ bandPowers: Array(4).fill(ch(1, 1, 1, 1, 1)) }, 0);
  assert.equal(tl.motionSummary(), null);
});

t('report: no motion fields or a short session give no motion lines', () => {
  assert.deepEqual(motionLines({}), []);
  assert.deepEqual(motionLines({ motionSec: 20, movingPct: 50 }), []);
  assert.ok(!keys(buildParentSummary({ session: {} })).includes('motion'));
});

t('report: calm head gets the motion line and the calm tip', () => {
  const l = motionLines({ motionSec: 180, movingPct: 4, bigMovePct: 0, tiltedPct: 0 });
  assert.deepEqual(keys(l), ['motion', 'motionTip']);
  assert.match(l[0].text, /^Head movement: moving 4% of the time\.$/);
  assert.match(l[1].text, /calm/);
});

t('report: restless + low focus says the round says little about focus; setup tip for hands', () => {
  const l = motionLines({ motionSec: 180, movingPct: 40, bigMovePct: 5, tiltedPct: 0, setup: 'hands' }, 20);
  assert.deepEqual(keys(l), ['motion', 'motionTip', 'motionTip2']);
  assert.match(l[0].text, /moving 40% of the time \(5% big moves\)/);
  assert.match(l[1].text, /restless/);
  assert.match(l[2].text, /phone on a stand/);
});

t('report: low focus while still points to wandering thoughts, not the body', () => {
  const l = motionLines({ motionSec: 180, movingPct: 3, bigMovePct: 0, tiltedPct: 0 }, 15);
  assert.match(text(l), /thoughts may have wandered/);
  assert.doesNotMatch(text(l), /calm: good/); // a tip already given
});

t('report: often tilted gives the eye-level tip and no calm tip; max two tips', () => {
  const l = motionLines({ motionSec: 180, movingPct: 5, bigMovePct: 0, tiltedPct: 60 });
  assert.match(l[0].text, /start pose: 60% of the time/);
  assert.match(text(l), /eye level/);
  assert.doesNotMatch(text(l), /calm/);
  const many = motionLines({ motionSec: 180, movingPct: 50, bigMovePct: 30, tiltedPct: 60 }, 10);
  assert.equal(many.length, 3);
});

t('report: invalid session gives no focus-based tip', () => {
  const l = motionLines({ motionSec: 180, movingPct: 40, valid: false }, 10);
  assert.doesNotMatch(text(l), /restless, so/);
});

t('report: the motion lines sit in the full summary', () => {
  const k = keys(buildParentSummary({ session: { motionSec: 120, movingPct: 30, bigMovePct: 0, tiltedPct: 0, timeAbovePct: 50 } }));
  assert.ok(k.includes('motion') && k.includes('motionTip'));
});

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
