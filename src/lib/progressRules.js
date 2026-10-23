/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Shared progress rules for the brain games. Pure functions; each game passes its own rules object
// (level table, goal scale, minimum days). Storage per child and game, and the arcade-wide daily limit,
// are in localStorage with try/catch.
//
// The goal is in the game's own units. rules.harder says which way is harder: -1 = a lower goal is
// harder (Train of Thoughts: calm = busy z below the goal), +1 = a higher goal is harder.

export const DEFAULT_RULES = {
  levels: [{ id: 1 }],
  goalStep: 0.1,
  startGoal: 0,
  goalMin: -Infinity,
  goalMax: Infinity,
  harder: -1,
  targetLow: 0.75, // between rounds: under 75% success -> one step easier
  targetHigh: 0.85, // over 85% -> one step harder
  safetyAtS: 45, // safety net once in a round, after 45 s of play
  safetyMinOkS: 10, // ...and at least 10 s of usable signal
  safetyLow: 0.4,
  safetyHigh: 0.9,
  dayEndS: 20, // last 20 s of the day's last round: one step easier
  dayEndScored: false, // ...and not scored
  goodPct: 0.7, // unlock: 2 good rounds in a row on the top level, success >= 70%, not eased
  goodRounds: 2,
  minDaysOnLevel: 2, // play days on the top level before the next one opens (per game)
  minGoalSteps: 3, // goal at least 3 steps harder than at level start
  hardPct: 0.4, // practice offer: 3 hard rounds in a row (under 40%)
  hardRounds: 3,
  historyMax: 200,
};
export const makeRules = (overrides = {}) => ({ ...DEFAULT_RULES, ...overrides });

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- goal ---------------------------------------------------------------------------------------
export const clampGoal = (R, g) => Math.min(R.goalMax, Math.max(R.goalMin, Math.round(g * 100) / 100));
export const harderGoal = (R, g, steps = 1) => clampGoal(R, g + R.harder * R.goalStep * steps);
export const easierGoal = (R, g, steps = 1) => harderGoal(R, g, -steps);
// A goal change of n steps (n > 0 harder, n < 0 easier) without clamping, for offsets inside a round
export const stepOffset = (R, steps) => R.harder * R.goalStep * steps;
// Steps harder than the start goal (day 1)
export const goalSteps = (R, goal) => Math.round((goal - R.startGoal) / (R.harder * R.goalStep));

// Between rounds: aim for 75-85% success
export function nextGoal(R, goal, successPct) {
  if (successPct > R.targetHigh) return harderGoal(R, goal);
  if (successPct < R.targetLow) return easierGoal(R, goal);
  return goal;
}

// Safety net inside a round, once: after 45 s, success under 40% -> one step easier ("eased"),
// over 90% -> one step harder. Returns null while it is too early, else { offset, eased }
// (offset is added to the round's fixed goal).
export function safetyNet(R, { t, okSec, successSec }) {
  if (t < R.safetyAtS || !(okSec > R.safetyMinOkS)) return null;
  const pct = successSec / okSec;
  if (pct < R.safetyLow) return { offset: stepOffset(R, -1), eased: true };
  if (pct > R.safetyHigh) return { offset: stepOffset(R, 1), eased: false };
  return { offset: 0, eased: false };
}

// Last 20 s of the day's last round
export const inDayEnd = (R, { lastOfDay, t, len }) => !!lastOfDay && t > len - R.dayEndS;
// The goal that counts right now in a round: fixed goal + safety offset + day-end ease
export const roundGoal = (R, r) => r.goal + (r.safety || 0) + (inDayEnd(R, r) ? stepOffset(R, -1) : 0);
// Whether this moment of the round counts for the success %
export const isScored = (R, r) => R.dayEndScored || !inDayEnd(R, r);

// ---- stars --------------------------------------------------------------------------------------
// 1 for finishing the round + 1 for effort; never for score
export const starsFor = ({ finished = true, effort = false } = {}) => (finished ? 1 : 0) + (effort ? 1 : 0);

// ---- per child progress -------------------------------------------------------------------------
export function defaultProgress(R) {
  return {
    unlocked: 1, goal: R.startGoal, dayEndGoal: null, lastDay: null,
    goodStreak: 0, hardStreak: 0, stars: 0, days: 0, lastUnlockDay: null,
    levelStartGoal: R.startGoal, levelDays: 0, levelLastDay: null,
    history: [],
  };
}

// A new day: the day starts one step easier than the last day ended
export function startDay(R, p, now = new Date()) {
  if (p.lastDay === dayKey(now)) return p;
  const goal = p.dayEndGoal != null ? easierGoal(R, p.dayEndGoal) : p.goal;
  return { ...p, goal };
}

// The unlock test, all must be true; max one unlock a day; a level is never taken away
export function canUnlock(R, p, today) {
  return p.goodStreak >= R.goodRounds
    && p.unlocked < R.levels.length
    && p.lastUnlockDay !== today
    && p.levelDays >= R.minDaysOnLevel
    && goalSteps(R, p.goal) - goalSteps(R, p.levelStartGoal) >= R.minGoalSteps;
}

// One finished round. round: { level, successPct (0-1), eased, effort }. extra = fields for the history.
// Returns { progress, stars, unlockedLevel, practiceOffer }.
export function applyRound(R, p, round, now = new Date(), extra = {}) {
  const today = dayKey(now);
  const out = { ...p };
  const stars = starsFor({ finished: true, effort: round.effort });
  out.stars = p.stars + stars;
  if (p.lastDay !== today) out.days = p.days + 1; // days played only grows; no streak to lose
  out.lastDay = today;

  let unlockedLevel = null;
  if (round.level === p.unlocked) {
    if (p.levelLastDay !== today) { out.levelDays = p.levelDays + 1; out.levelLastDay = today; }
    const good = round.successPct >= R.goodPct && !round.eased;
    out.goodStreak = good ? p.goodStreak + 1 : 0;
    if (canUnlock(R, out, today)) {
      out.unlocked = p.unlocked + 1;
      out.goodStreak = 0;
      out.lastUnlockDay = today;
      out.levelDays = 0;
      out.levelLastDay = null;
      unlockedLevel = out.unlocked;
    }
  }
  // Practice offer after 3 hard rounds in a row; the child keeps the level
  out.hardStreak = round.successPct < R.hardPct ? p.hardStreak + 1 : 0;
  const practiceOffer = out.hardStreak >= R.hardRounds && round.level > 1;
  if (practiceOffer) out.hardStreak = 0;

  out.goal = nextGoal(R, p.goal, round.successPct);
  if (unlockedLevel) out.levelStartGoal = out.goal;
  out.dayEndGoal = out.goal;
  out.history = [...p.history, {
    date: now.toISOString(), level: round.level, successPct: round.successPct, eased: !!round.eased,
    goal: p.goal, stars, ...extra,
  }].slice(-R.historyMax);
  return { progress: out, stars, unlockedLevel, practiceOffer };
}

// Weekly parent card: the last 7 days
export function weeklySummary(R, p, now = new Date()) {
  const from = now.getTime() - 7 * 864e5;
  const week = p.history.filter((h) => Date.parse(h.date) >= from);
  const before = p.history.filter((h) => Date.parse(h.date) < from);
  return {
    week,
    rounds: week.length,
    days: new Set(week.map((h) => dayKey(new Date(h.date)))).size,
    successPct: week.length ? week.reduce((s, h) => s + h.successPct, 0) / week.length : null,
    longestStreak: week.reduce((m, h) => Math.max(m, h.longestStreak || 0), 0),
    goalSteps: goalSteps(R, p.goal),
    goalStepsWeekAgo: before.length ? goalSteps(R, before[before.length - 1].goal) : null,
  };
}

// Loaded progress made safe: a bad value must not crash a round
export function sanitizeProgress(R, p) {
  const out = { ...defaultProgress(R), ...(p || {}) };
  const u = Math.round(Number(out.unlocked));
  out.unlocked = Number.isFinite(u) ? Math.min(R.levels.length, Math.max(1, u)) : 1;
  if (!Number.isFinite(out.goal)) out.goal = R.startGoal;
  if (!Number.isFinite(out.levelStartGoal)) out.levelStartGoal = out.goal;
  for (const k of ['stars', 'days', 'goodStreak', 'hardStreak', 'levelDays']) {
    out[k] = Number.isFinite(out[k]) && out[k] >= 0 ? out[k] : 0;
  }
  if (!Array.isArray(out.history)) out.history = [];
  return out;
}

// ---- storage per child and game ------------------------------------------------------------------
export const progressKey = (game) => `brainarcade.${game}`;

export function loadProgress(R, game, childId, migrate = (p) => p) {
  try {
    const all = JSON.parse(localStorage.getItem(progressKey(game)) || 'null');
    const p = all?.byChild?.[childId];
    return sanitizeProgress(R, p ? migrate(p) : null);
  } catch {
    return defaultProgress(R);
  }
}

export function saveProgress(game, childId, p) {
  try {
    const all = JSON.parse(localStorage.getItem(progressKey(game)) || 'null') || { byChild: {} };
    all.byChild = { ...(all.byChild || {}), [childId]: p };
    localStorage.setItem(progressKey(game), JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// ---- arcade-wide daily limit ---------------------------------------------------------------------
// 3 rounds per game and 15 minutes of brain-game time per child per day, calibration included.
// A parent can change both. state: { limits: {roundsPerGame, minutes}, day, rounds: {game: n}, sec }
export const DAILY_KEY = 'brainarcade.dailyLimit';
export const DEFAULT_DAILY = { roundsPerGame: 3, minutes: 15 };
export const DAILY_BOUNDS = { roundsPerGame: [1, 10], minutes: [5, 60] };

const clampInt = (v, [lo, hi], dflt) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : dflt);
export function cleanLimits(l = {}) {
  return {
    roundsPerGame: clampInt(l.roundsPerGame, DAILY_BOUNDS.roundsPerGame, DEFAULT_DAILY.roundsPerGame),
    minutes: clampInt(l.minutes, DAILY_BOUNDS.minutes, DEFAULT_DAILY.minutes),
  };
}

// Usage of today (a new day starts at zero; the limits stay)
export function dailyToday(state, now = new Date()) {
  const s = state || {};
  const limits = cleanLimits(s.limits);
  if (s.day !== dayKey(now)) return { limits, day: dayKey(now), rounds: {}, sec: 0 };
  return { limits, day: s.day, rounds: { ...(s.rounds || {}) }, sec: Number.isFinite(s.sec) ? s.sec : 0 };
}

// May the child start a round of this game now? lastRound = this is the day's last round of this game.
export function dailyCheck(state, game, now = new Date()) {
  const s = dailyToday(state, now);
  const roundsLeft = Math.max(0, s.limits.roundsPerGame - (s.rounds[game] || 0));
  const secLeft = Math.max(0, s.limits.minutes * 60 - s.sec);
  const reason = roundsLeft <= 0 ? 'rounds' : secLeft <= 0 ? 'time' : null;
  return { ok: !reason, reason, roundsLeft, secLeft, lastRound: roundsLeft === 1, roundsDone: s.rounds[game] || 0 };
}

// Count a round and/or play time (calibration time: rounds 0)
export function addUsage(state, { game = null, rounds = 0, sec = 0 } = {}, now = new Date()) {
  const s = dailyToday(state, now);
  if (game && rounds) s.rounds[game] = (s.rounds[game] || 0) + rounds;
  if (Number.isFinite(sec) && sec > 0) s.sec = Math.round((s.sec + sec) * 10) / 10;
  return s;
}

export function loadDaily(childId) {
  try {
    const all = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
    return dailyToday(all?.byChild?.[childId]);
  } catch {
    return dailyToday(null);
  }
}

export function saveDaily(childId, state) {
  try {
    const all = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null') || { byChild: {} };
    all.byChild = { ...(all.byChild || {}), [childId]: state };
    localStorage.setItem(DAILY_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// Parent setting
export function setDailyLimits(childId, limits) {
  const s = loadDaily(childId);
  s.limits = cleanLimits({ ...s.limits, ...limits });
  saveDaily(childId, s);
  return s.limits;
}

// Load, add, save in one step (calibration time, or a game that keeps no daily state of its own)
export function recordDailyUsage(childId, usage) {
  const s = addUsage(loadDaily(childId), usage);
  saveDaily(childId, s);
  return s;
}
