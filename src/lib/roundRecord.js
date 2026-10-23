/* SPDX-License-Identifier: AGPL-3.0-or-later */
// One record per round, the same for every brain game. The parent report and the Training Journal read it
// from the session history (sessionStore.recordSession), so the fields go into the session row.
//   game, level, setup        - which game, which level, play setup ('hands' | 'stand' | 'pc')
//   rawByMin                  - the game's raw number, mean per minute (shows real change across days)
//   zByMin                    - the same against the child's FIXED first-week reference (median / MAD)
//   goal                      - goal steps harder than day 1 (progressRules.goalSteps)
//   successPct                - % of usable time on the good side of the goal (0-100)
//   longestStreakS            - longest run on the good side, seconds
//   heldPct, frozenPct        - % of the round held by the signal gate / frozen (paused)
//   stars                     - stars won in this round
import { robustStats, robustZ } from './fastSignal.js';

export const ROUND_FIELDS = [
  'game', 'level', 'setup', 'rawByMin', 'zByMin', 'goal', 'successPct', 'longestStreakS', 'heldPct', 'frozenPct', 'stars',
];
export const REFERENCE_DAYS = 7;

const pct = (v) => (Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) : undefined);
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);

// The fixed reference: robust stats of all per-minute raw values in the child's first 7 days of this game.
// It is provisional (fixed: false) during the first week and never changes after it.
// entries: [{ date, rawByMin: [..] }] (oldest first)
export function updateReference(ref, entries, now = new Date()) {
  if (ref?.fixed) return ref;
  const list = (entries || []).filter((e) => e && Array.isArray(e.rawByMin) && Number.isFinite(Date.parse(e.date)));
  if (!list.length) return ref || null;
  const first = Math.min(...list.map((e) => Date.parse(e.date)));
  const end = first + REFERENCE_DAYS * 864e5;
  const stats = robustStats(list.filter((e) => Date.parse(e.date) < end).flatMap((e) => e.rawByMin), 0.05);
  if (!stats) return ref || null;
  return { ...stats, from: new Date(first).toISOString(), fixed: now.getTime() >= end };
}

export function makeRoundRecord({
  game, level, setup = null, rawByMin = [], ref = null, goal, successPct, longestStreakS, heldPct, frozenPct, stars,
}) {
  const raw = (rawByMin || []).map(r3);
  return {
    game,
    level,
    setup: setup || undefined,
    rawByMin: raw,
    zByMin: ref ? raw.map((v) => (v == null ? null : r3(robustZ(v, ref)))) : [],
    goal,
    successPct: pct(successPct),
    longestStreakS: Number.isFinite(longestStreakS) ? Math.round(longestStreakS) : undefined,
    heldPct: pct(heldPct),
    frozenPct: pct(frozenPct),
    stars,
  };
}

// Session-row fields (sessionStore.recordSession adds game, date, child and setup itself).
// timeAbovePct and flowSec are the names the report and the journal already read.
export function toSessionFields(rec) {
  const list = (a) => (a && a.length ? a.map((v) => (v == null ? '' : v)).join(' ') : undefined);
  return {
    level: rec.level,
    goal: rec.goal,
    successPct: rec.successPct,
    timeAbovePct: rec.successPct,
    longestStreakS: rec.longestStreakS,
    flowSec: rec.longestStreakS,
    heldPct: rec.heldPct,
    frozenPct: rec.frozenPct,
    stars: rec.stars,
    rawByMin: list(rec.rawByMin),
    zByMin: list(rec.zByMin),
  };
}
