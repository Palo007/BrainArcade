/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Train of Thoughts progress per child: line (level), goal, stars, passengers, days played, history.
// The rules are the shared ones (lib/progressRules.js); this file has the game's level table, story and
// passengers. The goal is in z units of the child's own warm-up: calm = busy z below the goal.
// Lower goal = harder.
import * as rules from '../../lib/progressRules.js';
import { updateReference } from '../../lib/roundRecord.js';

export const GAME_KEY = 'trainOfThoughts'; // localStorage 'brainarcade.trainOfThoughts'
export const STORE_KEY = rules.progressKey(GAME_KEY);
export const GOAL_STEP = 0.1;
export const START_GOAL = 0.6; // day 1: about 70% calm at baseline level
export const WAGON_CALM_S = 5;
export const LANTERN_CALM_S = 10;

// Each line adds one new thing. Features are cumulative: wagons from 2, bells from 3, lanterns from 4, thunder from 5.
// Texts are keys (games.tot.line<id>Name / Skill); the screen resolves them with t() when it draws.
export const LINES = [
  { id: 1, nameKey: 'games.tot.line1Name', sec: 60, wagons: 0, skillKey: 'games.tot.line1Skill' },
  { id: 2, nameKey: 'games.tot.line2Name', sec: 75, wagons: 3, skillKey: 'games.tot.line2Skill' },
  { id: 3, nameKey: 'games.tot.line3Name', sec: 90, wagons: 3, skillKey: 'games.tot.line3Skill' },
  { id: 4, nameKey: 'games.tot.line4Name', sec: 120, wagons: 4, skillKey: 'games.tot.line4Skill' },
  { id: 5, nameKey: 'games.tot.line5Name', sec: 150, wagons: 4, skillKey: 'games.tot.line5Skill' },
  { id: 6, nameKey: 'games.tot.line6Name', sec: 180, wagons: 5, skillKey: 'games.tot.line6Skill' },
];
export const lineFeatures = (id) => ({ wagons: id >= 2, bells: id >= 3, lanterns: id >= 4, thunder: id >= 5 });

// Shared rules with Train's own numbers. To keep the game as it was before the move, Train does not
// (yet) use the minimum play days, the 3-steps-harder unlock test or the unscored last 20 s.
export const RULES = rules.makeRules({
  levels: LINES,
  goalStep: GOAL_STEP,
  startGoal: START_GOAL,
  goalMin: -2, // the CALM bar shows z from -2 to +2, so the goal mark stays on the bar
  goalMax: 1.2,
  harder: -1,
  minDaysOnLevel: 0,
  minGoalSteps: -Infinity,
  dayEndScored: true,
});

export const STORY = [1, 2, 3, 4, 5, 6].map((i) => `games.tot.story${i}`); // text keys
export const PASSENGERS = Array.from({ length: 30 }, (_, i) => `games.tot.passenger${i + 1}`); // text keys

export const TWISTS = ['none', 'none', 'snow', 'party-hat', 'ducks', 'big-moon'];

const TALK_IDEAS = [1, 2, 3, 4].map((i) => `games.tot.talk${i}`); // text keys

export const goalLevel = (goal) => rules.goalSteps(RULES, goal); // steps calmer than day 1
export const startDay = (p, now) => rules.startDay(RULES, p, now);

export function defaultProgress() {
  return { ...rules.defaultProgress(RULES), passengers: 0, ref: null };
}

// round: { line, calmPct, longestStreak, eased, wagonsDropped, trainsStopped, bounceBackS, heldPct, sec, anyCalm5,
//          baseMu, baseSd, busyByMin }
export function finishRound(p, round, now = new Date()) {
  const res = rules.applyRound(RULES, p, {
    level: round.line, successPct: round.calmPct, eased: round.eased, effort: round.anyCalm5,
  }, now, {
    longestStreak: round.longestStreak, wagons: round.wagonsDropped, stopped: round.trainsStopped,
    bounceBackS: round.bounceBackS, heldPct: round.heldPct, sec: round.sec,
    // Raw busy value (log beta/alpha): warm-up mean/SD and per-minute means. The goal is relative to each
    // day's warm-up, so these are what show real change across days.
    baseMu: round.baseMu, baseSd: round.baseSd, rawByMin: round.busyByMin,
  });
  const out = res.progress;
  const newPassengers = [];
  for (let i = 0; i < round.wagonsDropped; i++) newPassengers.push(PASSENGERS[(p.passengers + i) % PASSENGERS.length]);
  out.passengers = p.passengers + round.wagonsDropped;
  out.ref = updateReference(p.ref, out.history, now);
  return { ...res, newPassengers, unlockedLine: res.unlockedLevel };
}

// Praise that names the act
// Praise lines as { key, vars }: the screen turns them into text with t(key, vars).
export function praiseFor(round) {
  const out = [];
  if (round.wagonsDropped > 0) out.push({ key: 'games.tot.praiseWagons', vars: { n: round.wagonsDropped } });
  if (round.trainsStopped > 0) out.push(round.trainsStopped > 1 ? { key: 'games.tot.praiseStoppedN', vars: { n: round.trainsStopped } } : { key: 'games.tot.praiseStopped' });
  if (round.bellCalm > 0) out.push({ key: 'games.tot.praiseBell' });
  if (round.lanterns > 0) out.push({ key: 'games.tot.praiseLanterns', vars: { n: round.lanterns } });
  if (round.thunderCalm > 0) out.push({ key: 'games.tot.praiseThunder' });
  if (Number.isFinite(round.bounceBackS)) {
    const s = Math.max(1, Math.round(round.bounceBackS));
    out.push({ key: 'games.tot.praiseBounce', vars: { n: s } });
  }
  if (round.longestStreak >= 3) out.push({ key: 'games.tot.praiseStreak', vars: { n: Math.round(round.longestStreak) } });
  if (!out.length) out.push({ key: 'games.tot.praiseDefault' });
  return out.slice(0, 3);
}

export function weeklyCard(p, now = new Date()) {
  const w = rules.weeklySummary(RULES, p, now);
  return {
    rounds: w.rounds,
    days: w.days,
    calmPct: w.successPct,
    longestStreak: w.longestStreak,
    goalLevel: w.goalSteps,
    goalLevelWeekAgo: w.goalStepsWeekAgo,
    newPassengers: w.week.reduce((s, h) => s + (h.wagons || 0), 0),
    talk: TALK_IDEAS[Math.floor(now.getTime() / (7 * 864e5)) % TALK_IDEAS.length],
  };
}

// History saved before the move used line / calmPct / busyByMin
const migrateEntry = (h) => ({
  ...h,
  level: h.level ?? h.line,
  successPct: h.successPct ?? h.calmPct,
  rawByMin: h.rawByMin ?? h.busyByMin,
});
const migrate = (p) => ({ ...p, history: Array.isArray(p.history) ? p.history.map(migrateEntry) : [] });

export function loadProgress(childId) {
  return { passengers: 0, ref: null, ...rules.loadProgress(RULES, GAME_KEY, childId, migrate) };
}
export const saveProgress = (childId, p) => rules.saveProgress(GAME_KEY, childId, p);
