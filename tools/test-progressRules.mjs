// Tests for src/lib/progressRules.js, src/lib/roundRecord.js and Train of Thoughts on the shared rules.
// Usage: node tools/test-progressRules.mjs
const mem = new Map();
const memStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.localStorage = memStorage;

const P = await import('../src/lib/progressRules.js');
const RR = await import('../src/lib/roundRecord.js');
const T = await import('../src/games/train-of-thoughts/progress.js');

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) failed++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const LEVELS = [1, 2, 3, 4, 5, 6].map((id) => ({ id }));
const R = P.makeRules({ levels: LEVELS, startGoal: 0.6, goalMin: -2, goalMax: 1.2, harder: -1 });
const UP = P.makeRules({ levels: LEVELS, startGoal: 1, goalStep: 1, goalMin: 0, goalMax: 10, harder: 1 });
const day = (n, h = 10) => new Date(2026, 9, n, h);

// ---- goal between rounds
check('goal: over 85% -> one step harder', near(P.nextGoal(R, 0.6, 0.9), 0.5));
check('goal: under 75% -> one step easier', near(P.nextGoal(R, 0.6, 0.7), 0.7));
check('goal: 75-85% -> same', P.nextGoal(R, 0.6, 0.8) === 0.6 && P.nextGoal(R, 0.6, 0.75) === 0.6 && P.nextGoal(R, 0.6, 0.85) === 0.6);
check('goal: harder = higher when harder is +1', P.nextGoal(UP, 3, 0.9) === 4 && P.nextGoal(UP, 3, 0.5) === 2);
check('goal: kept inside min / max', P.nextGoal(R, -2, 0.95) === -2 && P.nextGoal(R, 1.2, 0.1) === 1.2);
check('goal: steps harder than day 1', P.goalSteps(R, 0.3) === 3 && P.goalSteps(UP, 4) === 3);

// ---- safety net in a round
check('safety: not before 45 s', P.safetyNet(R, { t: 44.9, okSec: 40, successSec: 0 }) === null);
check('safety: needs >10 s usable signal', P.safetyNet(R, { t: 50, okSec: 10, successSec: 0 }) === null);
let s = P.safetyNet(R, { t: 45, okSec: 20, successSec: 7 });
check('safety: under 40% -> one step easier, eased', near(s.offset, 0.1) && s.eased === true);
s = P.safetyNet(R, { t: 45, okSec: 20, successSec: 19 });
check('safety: over 90% -> one step harder, not eased', near(s.offset, -0.1) && s.eased === false);
s = P.safetyNet(R, { t: 45, okSec: 20, successSec: 12 });
check('safety: in between -> no change', s.offset === 0 && s.eased === false);

// ---- day start and day end
let p = { ...P.defaultProgress(R), lastDay: P.dayKey(day(1)), dayEndGoal: 0.3, goal: 0.3 };
check('day start: same day -> unchanged', P.startDay(R, p, day(1, 18)) === p);
check('day start: next day -> one step easier than the day ended', near(P.startDay(R, p, day(2)).goal, 0.4));
const rd = { goal: 0.5, safety: 0, lastOfDay: true, len: 90 };
check('day end: last 20 s of the last round -> one step easier', near(P.roundGoal(R, { ...rd, t: 71 }), 0.6));
check('day end: before the last 20 s -> fixed goal', near(P.roundGoal(R, { ...rd, t: 69 }), 0.5));
check('day end: not the last round -> fixed goal', near(P.roundGoal(R, { ...rd, lastOfDay: false, t: 80 }), 0.5));
check('day end: last 20 s not scored', P.isScored(R, { ...rd, t: 71 }) === false && P.isScored(R, { ...rd, t: 60 }) === true);
check('day end: a game can keep scoring them', P.isScored(P.makeRules({ dayEndScored: true }), { ...rd, t: 71 }) === true);
check('round goal: adds the safety offset', near(P.roundGoal(R, { goal: 0.5, safety: 0.1, t: 10, len: 90 }), 0.6));

// ---- stars
check('stars: finish = 1', P.starsFor({ finished: true }) === 1);
check('stars: finish + effort = 2', P.starsFor({ finished: true, effort: true }) === 2);
check('stars: score never counts', P.starsFor({ finished: true, effort: false, score: 999 }) === 1);

// ---- unlock
const good = { level: 1, successPct: 0.8, eased: false };
function play(rules, prog, rounds, when) {
  let res = null;
  for (const r of rounds) { res = P.applyRound(rules, prog, r, when); prog = res.progress; }
  return res;
}
// ready = played 2 days on level 1, goal 3 steps harder than at level start
const ready = { ...P.defaultProgress(R), goal: 0.3, levelStartGoal: 0.6, levelDays: 2, levelLastDay: P.dayKey(day(2)), days: 2, lastDay: P.dayKey(day(2)) };
let res = play(R, ready, [good, good], day(3));
check('unlock: all true -> next level', res.unlockedLevel === 2 && res.progress.unlocked === 2);
check('unlock: new level starts with its own day count and start goal', res.progress.levelDays === 0 && res.progress.levelStartGoal === res.progress.goal);
const after = play(R, res.progress, [{ level: 2, successPct: 0.1 }, { level: 2, successPct: 0.1 }, { level: 2, successPct: 0.1 }], day(4));
check('unlock: never taken away', after.progress.unlocked === 2);
res = play(R, ready, [good], day(3));
check('unlock: 1 good round is not enough', res.unlockedLevel === null);
res = play(R, ready, [good, { ...good, eased: true }], day(3));
check('unlock: an eased round does not count', res.unlockedLevel === null && res.progress.goodStreak === 0);
res = play(R, ready, [good, { ...good, successPct: 0.69 }], day(3));
check('unlock: under 70% does not count', res.unlockedLevel === null);
res = play(R, ready, [good, { ...good, level: 2 }], day(3));
check('unlock: only rounds on the top level count', res.progress.goodStreak === 1);
res = play(R, { ...ready, levelDays: 0, levelLastDay: null }, [good, good], day(3));
check('unlock: minimum play days on the level', res.unlockedLevel === null && res.progress.levelDays === 1);
res = play(R, { ...ready, levelStartGoal: 0.5 }, [good, good], day(3));
check('unlock: goal must be 3 steps harder than at level start', res.unlockedLevel === null);
res = play(R, { ...ready, lastUnlockDay: P.dayKey(day(3)) }, [good, good], day(3));
check('unlock: max one unlock a day', res.unlockedLevel === null);
res = play(R, { ...ready, unlocked: 6, levelStartGoal: 0.6 }, [{ ...good, level: 6 }, { ...good, level: 6 }], day(3));
check('unlock: not past the last level', res.unlockedLevel === null && res.progress.unlocked === 6);
const meh = { level: 1, successPct: 0.5 };
res = play(R, { ...ready, levelDays: 1, levelLastDay: P.dayKey(day(2)) }, [meh, meh, meh], day(3));
check('unlock: a play day counts once', res.progress.levelDays === 2);

// ---- practice offer
const hard = { level: 2, successPct: 0.3 };
const lvl2 = { ...P.defaultProgress(R), unlocked: 2 };
res = play(R, lvl2, [hard, hard], day(3));
check('practice: 2 hard rounds -> no offer', res.practiceOffer === false);
res = play(R, lvl2, [hard, hard, hard], day(3));
check('practice: 3 hard rounds in a row -> offer, keeps the level', res.practiceOffer === true && res.progress.unlocked === 2);
res = play(R, lvl2, [hard, { ...hard, successPct: 0.5 }, hard, hard], day(3));
check('practice: a better round resets the count', res.practiceOffer === false);
res = play(R, P.defaultProgress(R), [{ level: 1, successPct: 0.1 }, { level: 1, successPct: 0.1 }, { level: 1, successPct: 0.1 }], day(3));
check('practice: no level below level 1', res.practiceOffer === false);

// ---- days played only grows
res = play(R, P.defaultProgress(R), [good, good], day(3));
check('days: two rounds on one day = 1 day', res.progress.days === 1);
res = play(R, res.progress, [good], day(9));
check('days: a later day adds one, no streak lost after a gap', res.progress.days === 2);
check('days: a bad saved value becomes 0, never negative', P.sanitizeProgress(R, { days: -4 }).days === 0);
check('days: history keeps the round', res.progress.history.length === 3 && res.progress.history[2].level === 1);

// ---- weekly card
const wk = { ...P.defaultProgress(R), goal: 0.4, history: [
  { date: day(1).toISOString(), successPct: 0.5, goal: 0.6, longestStreak: 3 },
  { date: day(10).toISOString(), successPct: 0.6, goal: 0.5, longestStreak: 8 },
  { date: day(11).toISOString(), successPct: 0.8, goal: 0.4, longestStreak: 5 },
] };
const card = P.weeklySummary(R, wk, day(12));
check('weekly: last 7 days only', card.rounds === 2 && card.days === 2);
check('weekly: success and longest streak', near(card.successPct, 0.7) && card.longestStreak === 8);
check('weekly: goal steps now and a week ago', card.goalSteps === 2 && card.goalStepsWeekAgo === 0);

// ---- storage per child and game
check('storage: save', P.saveProgress('gameA', 'kid1', { ...P.defaultProgress(R), stars: 5 }) === true);
P.saveProgress('gameB', 'kid1', { ...P.defaultProgress(R), stars: 9 });
P.saveProgress('gameA', 'kid2', { ...P.defaultProgress(R), stars: 1 });
check('storage: per child and game', P.loadProgress(R, 'gameA', 'kid1').stars === 5 && P.loadProgress(R, 'gameB', 'kid1').stars === 9 && P.loadProgress(R, 'gameA', 'kid2').stars === 1);
check('storage: unknown child -> defaults', P.loadProgress(R, 'gameA', 'nobody').unlocked === 1);
mem.set('brainarcade.gameC', '{bad json');
check('storage: bad JSON -> defaults', P.loadProgress(R, 'gameC', 'kid1').unlocked === 1);
P.saveProgress('gameD', 'kid1', { unlocked: 99, goal: 'x' });
const bad = P.loadProgress(R, 'gameD', 'kid1');
check('storage: bad values are made safe', bad.unlocked === 6 && bad.goal === 0.6 && Array.isArray(bad.history));
globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
check('storage: blocked storage -> defaults, save false', P.loadProgress(R, 'gameA', 'kid1').stars === 0 && P.saveProgress('gameA', 'kid1', {}) === false);
check('storage: blocked storage -> daily limit still works', P.dailyCheck(P.loadDaily('kid1'), 'g').ok === true && P.saveDaily('kid1', {}) === false);
globalThis.localStorage = memStorage;

// ---- arcade-wide daily limit
let d = P.dailyToday(null, day(5));
check('daily: defaults 3 rounds per game, 15 min', d.limits.roundsPerGame === 3 && d.limits.minutes === 15);
let chk = P.dailyCheck(d, 'train', day(5));
check('daily: fresh day -> ok, 3 rounds left', chk.ok && chk.roundsLeft === 3 && !chk.lastRound);
d = P.addUsage(d, { game: 'train', rounds: 2, sec: 120 }, day(5));
chk = P.dailyCheck(d, 'train', day(5));
check('daily: third round is the last', chk.ok && chk.roundsLeft === 1 && chk.lastRound);
d = P.addUsage(d, { game: 'train', rounds: 1, sec: 60 }, day(5));
chk = P.dailyCheck(d, 'train', day(5));
check('daily: 3 rounds of a game -> stop', !chk.ok && chk.reason === 'rounds');
check('daily: other games still have rounds', P.dailyCheck(d, 'hippo', day(5)).ok);
d = P.addUsage(d, { sec: 15 * 60 - 180 }, day(5)); // calibration time counts
chk = P.dailyCheck(d, 'hippo', day(5));
check('daily: 15 min for the whole arcade, calibration included', !chk.ok && chk.reason === 'time' && chk.secLeft === 0);
chk = P.dailyCheck(d, 'hippo', day(6));
check('daily: a new day starts at zero', chk.ok && chk.secLeft === 900 && chk.roundsLeft === 3);
const big = { ...d, limits: { roundsPerGame: 5, minutes: 30 } };
check('daily: a parent can change it', P.dailyCheck(big, 'hippo', day(5)).ok && P.dailyCheck(big, 'train', day(5)).roundsLeft === 2);
check('daily: new day keeps the parent limits', P.dailyToday(big, day(6)).limits.minutes === 30);
const cl = P.cleanLimits({ roundsPerGame: 0, minutes: 999 });
check('daily: parent values are kept in bounds', cl.roundsPerGame === 1 && cl.minutes === 60);
P.setDailyLimits('kid1', { minutes: 20 });
check('daily: parent setting is saved per child', P.loadDaily('kid1').limits.minutes === 20 && P.loadDaily('kid2').limits.minutes === 15);
P.recordDailyUsage('kid1', { game: 'train', rounds: 1, sec: 30 });
check('daily: usage is saved per child', P.dailyCheck(P.loadDaily('kid1'), 'train').roundsDone === 1 && P.dailyCheck(P.loadDaily('kid2'), 'train').roundsDone === 0);

// ---- round record
const e = (n, raw) => ({ date: day(n).toISOString(), rawByMin: raw });
let ref = RR.updateReference(null, [e(1, [0.1, 0.2]), e(3, [0.3])], day(3));
check('reference: provisional in the first week', ref && ref.fixed === false && near(ref.median, 0.2));
ref = RR.updateReference(ref, [e(1, [0.1, 0.2]), e(3, [0.3]), e(9, [5, 5, 5])], day(9));
check('reference: fixed after 7 days, later rounds left out', ref.fixed === true && near(ref.median, 0.2) && ref.n === 3);
check('reference: never changes once fixed', RR.updateReference(ref, [e(20, [9])], day(20)) === ref);
check('reference: no data -> null', RR.updateReference(null, [], day(1)) === null);
const rec = RR.makeRoundRecord({
  game: 'train-of-thoughts', level: 2, setup: 'stand', rawByMin: [0.2, null, 0.5], ref: { median: 0.2, mad: 0.1 },
  goal: 3, successPct: 0.756, longestStreakS: 12.4, heldPct: 0.1, frozenPct: 0, stars: 2,
});
check('record: has every schema field', RR.ROUND_FIELDS.every((k) => k in rec));
check('record: z against the fixed reference', rec.zByMin[0] === 0 && rec.zByMin[1] === null && near(rec.zByMin[2], 3));
check('record: percents 0-100', rec.successPct === 76 && rec.heldPct === 10 && rec.frozenPct === 0);
const sf = RR.toSessionFields(rec);
check('record: session row keeps report names', sf.timeAbovePct === 76 && sf.flowSec === 12 && sf.rawByMin === '0.2  0.5' && sf.level === 2);
check('record: no reference -> no z', RR.makeRoundRecord({ rawByMin: [1] }).zByMin.length === 0);

// ---- Train of Thoughts on the shared rules behaves as before
mem.clear();
let tp = T.defaultProgress();
const tGood = { line: 1, calmPct: 0.8, eased: false, wagonsDropped: 2, longestStreak: 6, anyCalm5: true, busyByMin: [0.4] };
let tr = T.finishRound(tp, tGood, day(1));
tr = T.finishRound(tr.progress, tGood, day(1));
check('train: 2 good rounds unlock line 2 on the same day (as before)', tr.unlockedLine === 2);
check('train: stars, passengers, history', tr.progress.stars === 4 && tr.progress.passengers === 4 && tr.newPassengers.length === 2 && tr.progress.history.length === 2);
check('train: goal kept for 80% calm', tr.progress.goal === 0.6 && T.goalLevel(0.3) === 3);
check('train: reference from raw busy', tr.progress.ref && near(tr.progress.ref.median, 0.4));
check('train: weekly card', T.weeklyCard(tr.progress, day(2)).rounds === 2 && near(T.weeklyCard(tr.progress, day(2)).calmPct, 0.8));
mem.set(T.STORE_KEY, JSON.stringify({ byChild: { kid: {
  unlocked: 3, goal: 0.4, stars: 7, passengers: 5, days: 4, roundsToday: 2,
  history: [{ date: day(1).toISOString(), line: 2, calmPct: 0.7, goal: 0.5, busyByMin: [0.3] }],
} } }));
const old = T.loadProgress('kid');
check('train: old saved progress loads', old.unlocked === 3 && old.stars === 7 && old.passengers === 5 && old.goal === 0.4);
check('train: old history is mapped to the shared names', old.history[0].level === 2 && old.history[0].successPct === 0.7 && old.history[0].rawByMin[0] === 0.3);
check('train: day start one step easier', near(T.startDay({ ...old, lastDay: P.dayKey(day(1)), dayEndGoal: 0.4 }, day(2)).goal, 0.5));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
