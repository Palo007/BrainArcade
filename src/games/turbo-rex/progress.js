/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Turbo Rex progress per child: belt, goal, stars, days played, tap speed, history.
// The rules are the shared ones (lib/progressRules.js); this file has the belt table and the game-only
// parts (tap speed, the 80% tap test from Yellow belt on, shorter round after a lot of freeze).
// The goal is in z units of the child's watch-run baseline: focus = z above the goal. Higher goal = harder.
// Only White and Yellow are built (proposal phase D); the other belts show as "coming soon".
import * as rules from '../../lib/progressRules.js';
import { updateReference } from '../../lib/roundRecord.js';

export const GAME_KEY = 'turboRex'; // localStorage 'brainarcade.turboRex'
export const GOAL_STEP = 0.1; // z
export const START_GOAL = -0.5; // day 1 starts a little below the child's own normal: an easy win
export const GOAL_MIN = -2;
export const GOAL_MAX = 2.5;
export const PLAYABLE = 2; // White + Yellow
export const TAP_GOOD = 0.9; // correct taps over 90% for 2 rounds -> items a little faster
export const TAP_BAD = 0.7; // under 70% -> slower
export const TAP_UNLOCK = 0.8; // from Yellow on: 80% correct taps in both good rounds
export const FROZEN_SHORT = 0.3; // more than 30% frozen -> next round shorter, shoulder rolls first
export const SHORT_BY_S = 15;
export const SHORT_MIN_S = 45;
export const EFFORT_STREAK_S = 5; // effort star: one focus run of 5 s

// Each belt adds one new skill. minDays = least play days on the belt (Black has none).
export const BELTS = [
  { id: 1, name: 'WHITE', title: 'Rolling Start', sec: 60, minDays: 2, color: '#FFFFFF', taps: false, skill: 'Keep the bar above the goal. No tapping yet.' },
  { id: 2, name: 'YELLOW', title: 'Snack Time', sec: 75, minDays: 3, color: '#F5D83A', taps: true, skill: 'Tap the pizzas.' },
  { id: 3, name: 'ORANGE', title: 'Stinky Socks', sec: 90, minDays: 4, color: '#F39A2B', taps: true, skill: 'Do not tap the socks.' },
  { id: 4, name: 'GREEN', title: 'Sneaky Pizza', sec: 120, minDays: 4, color: '#3FA34D', taps: true, skill: 'Pizzas with flies: do not tap.' },
  { id: 5, name: 'BLUE', title: 'Chicken Chaos', sec: 150, minDays: 5, color: '#3B82C4', taps: true, skill: 'Ignore the chicken.' },
  { id: 6, name: 'BLACK', title: 'Rule Swap', sec: 180, minDays: null, color: '#1C1C1C', taps: true, skill: 'The rule changes. Switch fast.' },
];
export const isBuilt = (id) => id >= 1 && id <= PLAYABLE;

// Item travel time across the snack lane, in seconds, per tap-speed step (steady speed, one lane).
// The slowest gives about 1.5 s inside easy reach near Rex: the early-belt "time to tap".
export const TAP_SPEEDS = [3.4, 3.1, 2.8, 2.5, 2.25, 2.0];
export const tapTravelS = (step) => TAP_SPEEDS[Math.min(TAP_SPEEDS.length - 1, Math.max(0, step | 0))];

// Shared rules with the game's own numbers, one set per built belt because the minimum days differ.
// The level table has only the built belts, so the unlock stops at Yellow until phase E.
const LEVELS = BELTS.slice(0, PLAYABLE);
export const RULES_BY_BELT = LEVELS.map((b) => rules.makeRules({
  levels: LEVELS,
  goalStep: GOAL_STEP,
  startGoal: START_GOAL,
  goalMin: GOAL_MIN,
  goalMax: GOAL_MAX,
  harder: 1, // a higher z goal is harder
  minDaysOnLevel: b.minDays ?? Infinity,
}));
export const rulesFor = (belt) => RULES_BY_BELT[Math.min(PLAYABLE, Math.max(1, belt)) - 1];
export const RULES = RULES_BY_BELT[0]; // goal scale, safety net and day-end ease are the same for every belt

export const WORLDS = [
  { id: 'dino-town', name: 'Dino Town', note: 'Streets, pigeons and a pizza van.' },
];

// One read-aloud comic page per built belt
export const STORY = [
  'Rex got a skateboard! Your brain is his fuel. Think hard on Rex, and he zooms through Dino Town. Let your mind drift, and Rex gets sleepy. Watch out for the snail!',
  'The pizza van lost its pizzas! They fly down the street. Rex is hungry. Tap the pizzas and Rex eats them. BURP! Far away, a monkey with a big grin watches.',
];

export const dayKey = rules.dayKey;
export const goalLevel = (goal) => rules.goalSteps(RULES, goal); // steps harder than day 1
export const startDay = (p, now) => rules.startDay(rulesFor(p.unlocked), p, now);

export function defaultProgress() {
  return { ...rules.defaultProgress(RULES), tapStep: 0, tapPcts: [], shortNext: false, ref: null };
}

// Round length: the belt's time, shorter after a round with a lot of freeze
export const roundLen = (belt, p) => {
  const sec = BELTS[belt - 1].sec;
  return p?.shortNext ? Math.max(SHORT_MIN_S, sec - SHORT_BY_S) : sec;
};

// Tap speed between rounds: over 90% for 2 rounds -> one step faster; under 70% -> one step slower
export function nextTapStep(step, pcts) {
  const s = Number.isFinite(step) ? step : 0;
  const last = pcts[pcts.length - 1];
  if (pcts.length >= 2 && pcts.slice(-2).every((v) => v > TAP_GOOD)) return { step: Math.min(TAP_SPEEDS.length - 1, s + 1), reset: true };
  if (Number.isFinite(last) && last < TAP_BAD) return { step: Math.max(0, s - 1), reset: true };
  return { step: s, reset: false };
}

// The extra unlock part on top of the shared rules: from Yellow on, 80% correct taps in both good rounds
export function extraUnlockOk(belt, tapPcts) {
  if (!BELTS[belt - 1]?.taps) return true;
  const last = (tapPcts || []).slice(-2);
  return last.length === 2 && last.every((v) => v >= TAP_UNLOCK);
}

// round: { belt, sec, focusPct (above the goal, 0-1), eased, longest, tapPct (null without taps), hits, missed,
//          sockTaps, rtMs, heldPct, frozenPct, mainReason, rawByMin[], watchRaw, setup }
// The round gets its star for finishing, also when it ended early.
export function finishRound(p, round, now = new Date()) {
  const hasTaps = Number.isFinite(round.tapPct);
  const tapPcts = hasTaps ? [...(p.tapPcts || []), round.tapPct].slice(-3) : (p.tapPcts || []);
  const base = rulesFor(p.unlocked);
  // When the tap test is not met, rules that cannot unlock are passed in
  const R = extraUnlockOk(p.unlocked, tapPcts) ? base : { ...base, goodRounds: Infinity };
  const res = rules.applyRound(R, p, {
    level: round.belt, successPct: round.focusPct, eased: round.eased, effort: round.longest >= EFFORT_STREAK_S,
  }, now, {
    longestStreakS: round.longest, sec: round.sec, setup: round.setup,
    heldPct: round.heldPct, frozenPct: round.frozenPct, mainReason: round.mainReason || undefined,
    tapPct: hasTaps ? round.tapPct : undefined, hits: round.hits, missed: round.missed, sockTaps: round.sockTaps,
    rtMs: round.rtMs ?? undefined,
    // Raw focus number (log ratio): per-minute means of the round and the watch-run median, for real change
    rawByMin: round.rawByMin, watchRaw: round.watchRaw ?? undefined,
  });
  const out = res.progress;
  if (hasTaps) {
    const t = nextTapStep(p.tapStep, tapPcts);
    out.tapStep = t.step;
    // a new speed starts a new count; this round's unlock test already used the old list
    out.tapPcts = t.reset ? [] : tapPcts;
  } else {
    out.tapPcts = tapPcts;
  }
  out.shortNext = round.frozenPct > FROZEN_SHORT;
  out.ref = updateReference(p.ref, out.history, now);
  return { progress: out, stars: res.stars, unlockedBelt: res.unlockedLevel, practiceOffer: res.practiceOffer };
}

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

// Loaded progress made safe: a bad value must not crash a round
export function loadProgress(childId) {
  const p = { ...defaultProgress(), ...rules.loadProgress(RULES, GAME_KEY, childId) };
  p.tapStep = Math.min(TAP_SPEEDS.length - 1, Math.max(0, Math.round(num(p.tapStep, 0))));
  if (!Array.isArray(p.tapPcts)) p.tapPcts = [];
  p.tapPcts = p.tapPcts.filter(Number.isFinite);
  p.shortNext = !!p.shortNext;
  return p;
}
export const saveProgress = (childId, p) => rules.saveProgress(GAME_KEY, childId, p);

// 7-day card for parents, from the saved round history. Two kinds of numbers:
// real change (raw focus number against the fixed first-week reference) and tuning (goal steps, focus time).
export function parentCardOf(p, now = Date.now()) {
  const since = now - 7 * 864e5;
  const all = p.history || [];
  const h = all.filter((x) => new Date(x.date).getTime() >= since);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const fin = (arr) => arr.filter(Number.isFinite);
  const sum = (k) => h.reduce((a, x) => a + (Number.isFinite(x[k]) ? x[k] : 0), 0);
  const reasons = {};
  h.forEach((x) => { if (x.mainReason) reasons[x.mainReason] = (reasons[x.mainReason] || 0) + 1; });
  const mainReason = Object.keys(reasons).sort((a, b) => reasons[b] - reasons[a])[0] || null;
  const setups = {};
  h.forEach((x) => { const s = x.setup || 'unknown'; setups[s] = (setups[s] || 0) + 1; });
  // The raw line: one point per round (mean of its minutes) and its watch run, last 30 rounds
  const line = all.slice(-30).map((x) => ({
    date: x.date,
    raw: avg(fin((Array.isArray(x.rawByMin) ? x.rawByMin : []).map((v) => (v == null ? NaN : Number(v))))),
    watch: Number.isFinite(x.watchRaw) ? x.watchRaw : null,
  }));
  return {
    rounds: h.length,
    days: new Set(h.map((x) => x.date.slice(0, 10))).size,
    focusPct: avg(fin(h.map((x) => x.successPct))),
    longest: h.reduce((a, x) => Math.max(a, x.longestStreakS || 0), 0),
    heldPct: avg(fin(h.map((x) => x.heldPct))),
    frozenPct: avg(fin(h.map((x) => x.frozenPct))),
    mainReason,
    tapPct: avg(fin(h.map((x) => x.tapPct))),
    hits: sum('hits'), missed: sum('missed'), sockTaps: sum('sockTaps'),
    rtMs: avg(fin(h.map((x) => x.rtMs))),
    goalSteps: goalLevel(p.goal),
    setups,
    line,
    ref: p.ref,
  };
}
