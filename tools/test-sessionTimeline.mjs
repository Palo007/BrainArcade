// Run: node tools/test-sessionTimeline.mjs
import assert from 'node:assert/strict';
import { SessionTimeline, relativeBands, meanAlphaByChannel, TIMELINE_MAX_POINTS } from '../src/lib/sessionTimeline.js';
import { buildParentSummary, formatDuration, focusPctFromTimeline } from '../src/lib/parentSummary.js';

let fails = 0;
const t = (name, fn) => {
  try { fn(); console.log('PASS', name); } catch (e) { fails += 1; console.log('FAIL', name, '-', e.message); }
};
const ch = (d, th, a, b, g) => ({ delta: d, theta: th, alpha: a, beta: b, gamma: g });
const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} != ${y}`);

t('relative bands sum to 1 and average over channels', () => {
  const r = relativeBands([ch(1, 1, 2, 0, 0), ch(0, 0, 1, 1, 2), ch(1, 1, 1, 1, 0), ch(2, 0, 0, 2, 0)]);
  close(Object.values(r.bands).reduce((s, v) => s + v, 0), 1);
  // channel 0 alpha 0.5, ch1 0.25, ch2 0.25, ch3 0
  assert.deepEqual(r.alpha.map((v) => +v.toFixed(3)), [0.5, 0.25, 0.25, 0]);
  close(r.bands.alpha, (0.5 + 0.25 + 0.25 + 0) / 4);
});

t('missing / empty channels are skipped, no signal gives null', () => {
  const r = relativeBands([ch(1, 1, 1, 1, 1), null, ch(0, 0, 0, 0, 0), undefined]);
  close(r.bands.delta, 0.2);
  assert.equal(r.alpha[1], null);
  assert.equal(r.alpha[2], null);
  assert.equal(relativeBands([null, null, null, null]), null);
  assert.equal(relativeBands(undefined), null);
});

t('memory is bounded (cap 1 h by default, custom cap works)', () => {
  assert.equal(TIMELINE_MAX_POINTS, 3600);
  const tl = new SessionTimeline(10);
  for (let i = 0; i < 25; i++) tl.push({ bandPowers: Array(4).fill(ch(1, 1, 1, 1, 1)), focus: 0.5 }, 1000 * i);
  assert.equal(tl.points.length, 10);
  assert.equal(tl.points[0].t, 15);
  const big = new SessionTimeline();
  for (let i = 0; i < 4000; i++) big.push({ bandPowers: Array(4).fill(ch(1, 1, 1, 1, 1)) }, 1000 * i);
  assert.equal(big.points.length, 3600);
});

t('missing fNIRS and focus are stored as null', () => {
  const tl = new SessionTimeline();
  tl.push({ bandPowers: Array(4).fill(ch(1, 2, 3, 4, 5)) }, 5000);
  tl.push({ bandPowers: Array(4).fill(ch(1, 2, 3, 4, 5)), focus: 1.7, hbo: 0.4 }, 6000);
  assert.equal(tl.points[0].hbo, null);
  assert.equal(tl.points[0].focus, null);
  assert.equal(tl.points[1].focus, 1); // clamped
  assert.equal(tl.points[1].hbo, 0.4);
  assert.equal(tl.points[0].t, 0); // relative to first point
});

t('no signal pushes nothing; last(seconds) windows the end', () => {
  const tl = new SessionTimeline();
  assert.equal(tl.push({ bandPowers: [null, null, null, null] }), false);
  assert.equal(tl.points.length, 0);
  for (let i = 0; i < 100; i++) tl.push({ bandPowers: Array(4).fill(ch(1, 1, 1, 1, 1)) }, 1000 * i);
  assert.equal(tl.last(10).length, 11);
  assert.equal(tl.last(0).length, 100);
  tl.clear();
  assert.equal(tl.points.length, 0);
});

t('meanAlphaByChannel averages, null without data', () => {
  const m = meanAlphaByChannel([{ alpha: [0.2, null, 0.4, 0] }, { alpha: [0.4, null, 0.2, 0] }]);
  assert.deepEqual(m.map((v) => (v === null ? null : +v.toFixed(2))), [0.3, null, 0.3, 0]);
});

t('parent summary: comparison with last 5, PAF, no medical wording', () => {
  const earlier = Array.from({ length: 8 }, (_, i) => ({ timeAbovePct: i < 3 ? 90 : 40 }));
  const lines = buildParentSummary({ session: { playedSec: 185, timeAbovePct: 60 }, earlier, calibration: { paf: 8.4 } });
  const text = lines.map((l) => l.text).join(' ');
  assert.match(text, /3 min 5 s/);
  assert.match(text, /60%/);
  assert.match(text, /higher than the last 5 sessions/);
  assert.match(text, /8\.4 Hz/);
  assert.doesNotMatch(text, /diagnos|disorder|ADHD|treat/i);
  assert.equal(formatDuration(60), '1 min');
});

t('parent summary: no history, no fNIRS, no calibration', () => {
  const lines = buildParentSummary({ session: {}, earlier: [], points: [] });
  const keys = lines.map((l) => l.key);
  assert.ok(keys.includes('compare') && !keys.includes('paf') && !keys.includes('fnirs'));
});

t('end() freezes the timeline, is idempotent; clear() and reopen() resume', () => {
  const tl = new SessionTimeline();
  const bp = Array(4).fill(ch(1, 1, 1, 1, 1));
  tl.push({ bandPowers: bp }, 0);
  tl.push({ bandPowers: bp }, 1000);
  tl.end();
  tl.end();
  assert.equal(tl.push({ bandPowers: bp }, 2000), false);
  assert.equal(tl.all().length, 2);
  tl.reopen();
  assert.equal(tl.all().length, 2); // data kept until the next push
  assert.equal(tl.push({ bandPowers: bp }, 9000), true);
  assert.equal(tl.all().length, 1); // fresh timeline
  assert.equal(tl.points[0].t, 0);
  tl.end();
  tl.clear();
  assert.equal(tl.push({ bandPowers: bp }, 0), true);
});

t('excluded (paused / bad-signal) seconds leave a time gap, not a point', () => {
  const tl = new SessionTimeline();
  const bp = Array(4).fill(ch(1, 1, 1, 1, 1));
  [0, 1, 2, 8, 9].forEach((s) => tl.push({ bandPowers: bp }, s * 1000));
  assert.deepEqual(tl.all().map((p) => p.t), [0, 1, 2, 8, 9]);
  assert.equal(tl.push({ bandPowers: [null, null, null, null] }, 10000), false);
  assert.equal(tl.all().length, 5);
});

t('focus stays null before baseline and is ignored by the focus percentage', () => {
  const tl = new SessionTimeline();
  const bp = Array(4).fill(ch(1, 1, 1, 1, 1));
  tl.push({ bandPowers: bp, focus: null }, 0);
  tl.push({ bandPowers: bp, focus: null }, 1000);
  tl.push({ bandPowers: bp, focus: 0.9 }, 2000);
  assert.deepEqual(tl.all().map((p) => p.focus), [null, null, 0.9]);
  assert.equal(focusPctFromTimeline(tl.all()), 100);
  assert.equal(focusPctFromTimeline(tl.all().slice(0, 2)), null);
});

t('score comparison needs the same duration; unknown session is not guessed', () => {
  const earlier = [{ score: 10, durationSec: 60 }, { score: 12, durationSec: 120 }];
  const k = (session) => buildParentSummary({ session, earlier }).map((l) => l.text).join(' ');
  assert.doesNotMatch(k({ score: 50, durationSec: 60 }), /The score was/);
  const same = [{ score: 10, durationSec: 60 }];
  const txt = buildParentSummary({ session: { score: 50, durationSec: 60 }, earlier: same }).map((l) => l.text).join(' ');
  assert.match(txt, /The score was higher than the last session/);
});

t('parent summary: play setup line; old records say not recorded', () => {
  const txt = (session) => buildParentSummary({ session }).map((l) => l.text).join(' ');
  assert.match(txt({ date: '2026-10-23T10:00:00.000Z', setup: 'stand' }), /Play setup: phone on a stand\./);
  assert.match(txt({ date: '2026-09-01T10:00:00.000Z' }), /Play setup: not recorded/);
  assert.doesNotMatch(txt({}), /Play setup/); // no session record at all
});

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
