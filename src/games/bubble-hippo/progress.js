/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo progress per child: badge, goal, stars, Bubble Zoo, days played, history.
// The rules are the shared ones (lib/progressRules.js); this file has the game's badge table, story, zoo
// and the game-only parts (settle goal, breath pacer, cues, secret bubble). The goal is in z units of the
// child's own baseline: calm = meter z above the goal. Higher goal = harder.
import * as rules from '../../lib/progressRules.js';
import { updateReference } from '../../lib/roundRecord.js';

export const GAME_KEY = 'bubbleHippo'; // localStorage 'brainarcade.bubbleHippo'
export const STORE_KEY = rules.progressKey(GAME_KEY);
export const GOAL_STEP = 0.1; // z
export const START_GOAL = 0; // the goal line starts at the child's own normal
export const GOAL_MIN = -1.5;
export const GOAL_MAX = 3;
export const SETTLE_START_S = 15;
export const DELAY_S = 2; // measured delay of the meter, to be set on the test day
export const SETTLE_MARGIN_S = 3;
export const SETTLE_STEP_S = 1;
export const SETTLE_OK_CUES = 2; // settled in 2 of the last 3 cues
export const SECRET_MIN_PCT = 0.5;
export const PACER_START = 12; // breaths per minute in week 1
export const PACER_FLOOR = 8;
export const ZOO_SIZE = 40;
export const GOLDEN_CHANCE = 0.15; // random surprise at a round end, not tied to calm

// Each badge adds one new thing. Features are cumulative. minDays = least play days on the badge (King has none).
export const BADGES = [
  { id: 1, name: 'DUCKLING', title: 'Big Bubble', sec: 60, minDays: 2, color: '#F6C85F', skill: 'Grow the bubble.' },
  { id: 2, name: 'FROG', title: 'Slow Breaths', sec: 90, minDays: 3, color: '#6CC7A0', skill: 'Breathe with the green ring.' },
  { id: 3, name: 'OTTER', title: 'Splash and Settle', sec: 120, minDays: 4, color: '#C98B5B', skill: 'Count the ducks, then settle.' },
  { id: 4, name: 'SEAL', title: 'Buzzy Fly', sec: 120, minDays: 4, color: '#8FA3B8', skill: 'Stay calm when something buzzes.' },
  { id: 5, name: 'WHALE', title: 'Secret Bubble', sec: 150, minDays: 5, color: '#4F7FD1', skill: 'Calm without a screen.' },
  { id: 6, name: 'HIPPO KING', title: 'Bath Boss', sec: 180, minDays: null, color: '#9B7FD8', skill: 'All skills together.' },
];
export const badgeFeatures = (id) => ({ breath: id >= 2, splash: id >= 3, pests: id >= 4, secret: id >= 5, king: id >= 6 });

// Shared rules with the game's own numbers, one set per badge because the minimum play days differ.
// Stars are for finishing only (no effort star). Day-end ease and safety net are the shared defaults.
export const RULES_BY_BADGE = BADGES.map((b) => rules.makeRules({
  levels: BADGES,
  goalStep: GOAL_STEP,
  startGoal: START_GOAL,
  goalMin: GOAL_MIN,
  goalMax: GOAL_MAX,
  harder: 1, // a higher z goal is harder
  minDaysOnLevel: b.minDays ?? Infinity,
}));
export const rulesFor = (badge) => RULES_BY_BADGE[Math.min(BADGES.length, Math.max(1, badge)) - 1];
export const RULES = RULES_BY_BADGE[0]; // goal scale, safety net and day-end ease are the same for every badge

// One bath world per badge, opened by the badge and not by a date
export const WORLDS = [
  { id: 'home-tub', name: 'Home Tub', note: 'Rubber ducks and a leaky tap.' },
  { id: 'hot-spring', name: 'Hot Spring', note: 'Snow, steam and snow monkeys.' },
  { id: 'mud-spa', name: 'Mud Spa', note: 'Pigs, mud bubbles and the stink.' },
  { id: 'jungle-waterfall', name: 'Jungle Waterfall', note: 'Frogs, toucans and mist.' },
  { id: 'moon-bath', name: 'Moon Bath', note: 'Low gravity. Bubbles float slow.' },
  { id: 'remix', name: 'Remix', note: 'You pick the bath.' },
];

// One read-aloud comic page per badge
export const STORY = [
  'Sir Honk the grumpy swan stole the hot water! Hippo only has a cold tub and a straw. Hippo blows one big, soft bubble.',
  'Who stole the hot water? Hippo follows wet footprints. Hippo breathes with the green ring, slow and soft. The footprints get warmer.',
  'The rooster crows! Ducks pop up. Hippo counts them all, then settles back into the bubble, easy as pie.',
  'A fly buzzes at Hippo\'s nose. A stinky sock peeks out of the foam. Hippo does not mind. Far away, something goes HONK.',
  'Foam covers the bubble. Hippo cannot see it. Hippo stays calm anyway, and the bubble is still there. HONK! Sir Honk is close.',
  'Sir Honk is tired of being grumpy. "How do you stay so calm?" he asks. Hippo shows him three soft breaths. Now they bathe together.',
];

// The Bubble Zoo: one friend for each finished round, the shelf only grows
export const ZOO = [
  'Burping Frog', 'Tooting Skunk', 'Sneezing Sloth', 'Hiccuping Pig', 'Giggling Goat', 'Snoring Owl',
  'Wobbly Walrus', 'Dancing Duck', 'Grumpy Goldfish', 'Sock-Eating Llama', 'Bubble-Blowing Bat', 'Tickled Turtle',
  'Yodeling Yak', 'Slippery Seal', 'Dizzy Dolphin', 'Sleepy Snail', 'Burping Whale', 'Muddy Monkey',
  'Cheesy Mouse', 'Tap-Dancing Crab', 'Singing Sponge', 'Hiccup Hedgehog', 'Splashy Penguin', 'Lazy Lobster',
  'Giggling Giraffe', 'Wiggly Worm', 'Soapy Squirrel', 'Jelly Jellyfish', 'Pirate Pigeon', 'Fizzy Flamingo',
  'Stinky Stork', 'Tiny Tiger', 'Moon Moose', 'Bouncy Beaver', 'Sneaky Sheep', 'Noodle Newt',
  'Rubber Rhino', 'Tutu Toad', 'Foamy Fox', 'Golden Gnu',
];

// Bath bombs: color and a smell joke
export const BATH_BOMBS = [
  { id: 'banana', name: 'Banana', color: '#F6D55C', joke: 'Smells like a monkey\'s lunch.' },
  { id: 'bubble-gum', name: 'Bubble-gum', color: '#F49AC1', joke: 'Pop! Pink foam everywhere.' },
  { id: 'old-cheese', name: 'Old cheese', color: '#E8C46A', joke: 'Phew! Even the ducks hold their noses.' },
  { id: 'dads-socks', name: 'Dad\'s socks', color: '#8FA36B', joke: 'The fly flew away. So did the sock.' },
];

export const dayKey = rules.dayKey;

export const goalLevel = (goal) => rules.goalSteps(RULES, goal); // steps harder than day 1
export const startDay = (p, now) => rules.startDay(rulesFor(p.unlocked), p, now);

export function defaultProgress() {
  return {
    ...rules.defaultProgress(RULES),
    firstDay: null, settleGoal: SETTLE_START_S, cues: [], secretPcts: [], warmBath: false, zoo: 0, golden: 0, ref: null,
  };
}

// Settle goal (seconds): starts at 15 and shrinks 1 s per round in which half the settles were inside it,
// toward measured delay + 3 s, never lower. times = the round's settle times in seconds.
export function settleGoal(current, times = []) {
  const floor = DELAY_S + SETTLE_MARGIN_S;
  const cur = Math.max(floor, Number.isFinite(current) ? current : SETTLE_START_S);
  if (!times.length) return cur;
  const ok = times.filter((t) => t <= cur).length;
  return ok * 2 >= times.length ? Math.max(floor, cur - SETTLE_STEP_S) : cur;
}

// Breath pacer in breaths per minute: 12 in week 1, one slower each week of play, never below 8. A fixed plan.
export function pacerRate(weeks) {
  const w = Number.isFinite(weeks) ? Math.max(0, Math.floor(weeks)) : 0;
  return Math.max(PACER_FLOOR, PACER_START - w);
}

// Whole weeks since the first play day
export function playWeeks(p, now = new Date()) {
  if (!p.firstDay) return 0;
  const [y, m, d] = p.firstDay.split('-').map(Number);
  return Math.max(0, Math.floor((now - new Date(y, m - 1, d)) / (7 * 864e5)));
}

// Days played on the Whale badge, for the growing secret bubble (max 5 counts)
export const whaleDaysOf = (p) => (p.unlocked > 5 ? 5 : p.unlocked === 5 ? p.levelDays : 0);

// The extra unlock conditions on top of the shared ones. From Otter on: settled in 2 of the last 3 cues.
// From Whale on: secret time above the goal at least half.
export function extraUnlockOk(badge, cues, secretPcts) {
  if (badge >= 3 && (cues || []).filter(Boolean).length < SETTLE_OK_CUES) return false;
  if (badge >= 5) {
    const s = secretPcts || [];
    if (!s.length || s.reduce((a, b) => a + b, 0) / s.length < SECRET_MIN_PCT) return false;
  }
  return true;
}

// round: { badge, warm, sec, calmPct (above the goal, 0-1), eased, longestHold, settleTimes[], ducksRight,
//          ducksTotal, secretPct, pestCalmPct, noPestCalmPct, heldPct, rawByMin[], setup, baseMu, baseMad }
// The round gets its star for finishing, also when it ended early. rnd is for tests.
export function finishRound(p, round, now = new Date(), rnd = Math.random) {
  const today = dayKey(now);
  const times = round.settleTimes || [];
  const cues = times.length ? [...(p.cues || []), ...times.map((t) => t <= p.settleGoal)].slice(-3) : (p.cues || []);
  const secretPcts = Number.isFinite(round.secretPct) ? [...(p.secretPcts || []), round.secretPct].slice(-3) : (p.secretPcts || []);

  // When an extra condition is not met, rules that cannot unlock are passed in
  const base = rulesFor(p.unlocked);
  const R = extraUnlockOk(p.unlocked, cues, secretPcts) ? base : { ...base, goodRounds: Infinity };
  const res = rules.applyRound(R, p, {
    level: round.badge, successPct: round.calmPct, eased: round.eased, effort: false,
  }, now, {
    longestStreakS: round.longestHold, settleTimes: times, ducksRight: round.ducksRight, ducksTotal: round.ducksTotal,
    secretPct: round.secretPct, pestCalmPct: round.pestCalmPct, noPestCalmPct: round.noPestCalmPct,
    heldPct: round.heldPct, sec: round.sec, setup: round.setup, warm: round.warm || undefined,
    // Raw calm value (log ratio): warm-up median / MAD and per-minute means, for real change across days
    baseMu: round.baseMu, baseMad: round.baseMad, rawByMin: round.rawByMin,
  });
  const out = res.progress;

  const friend = p.zoo < ZOO_SIZE ? ZOO[p.zoo] : null;
  out.zoo = friend ? p.zoo + 1 : p.zoo;
  const golden = rnd() < GOLDEN_CHANCE;
  out.golden = p.golden + (golden ? 1 : 0);
  out.firstDay = p.firstDay || today;
  out.cues = cues;
  if (times.length) out.settleGoal = settleGoal(p.settleGoal, times);
  out.secretPcts = secretPcts;
  // 3 hard rounds in a row: offer a warm bath on the badge below (the child keeps the badge).
  // A warm bath round itself is not counted as hard.
  let warmBath = false;
  if (round.warm) { out.hardStreak = p.hardStreak; out.warmBath = false; }
  else { warmBath = res.practiceOffer; if (warmBath) out.warmBath = true; }
  out.ref = updateReference(p.ref, out.history, now);
  return { progress: out, stars: res.stars, friend, golden, unlockedBadge: res.unlockedLevel, warmBath };
}

// ---- storage: the shared key and shape; progress saved before the move had its own fields -------------
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

// History saved before the move used badge / calmPct / longestHold
const migrateEntry = (h) => (h && typeof h === 'object' ? {
  ...h,
  level: h.level ?? h.badge,
  successPct: h.successPct ?? h.calmPct,
  longestStreakS: h.longestStreakS ?? h.longestHold,
} : null);

// Old shape: badgeDays / badgeLastDay / badgeStart per badge, roundsToday, firstDay. Map what maps, drop the rest.
// The shared fields (levelDays, levelStartGoal, levelLastDay) come from the entries of the badge now open.
export function migrate(p) {
  const old = p && typeof p === 'object' ? p : {};
  const isOld = old.badgeDays && typeof old.badgeDays === 'object' && !('levelDays' in old);
  const history = Array.isArray(old.history) ? old.history.map(migrateEntry).filter(Boolean) : [];
  const out = { ...old, history };
  if (!isOld) return out;
  const u = Math.round(num(old.unlocked, 1));
  const open = Number.isFinite(u) ? Math.min(BADGES.length, Math.max(1, u)) : 1;
  out.levelDays = num(old.badgeDays?.[open], 0);
  out.levelLastDay = old.badgeLastDay?.[open] ?? null;
  out.levelStartGoal = num(old.badgeStart?.[open], START_GOAL);
  delete out.badgeDays; delete out.badgeLastDay; delete out.badgeStart; delete out.roundsToday;
  return out;
}

// Loaded progress made safe: a bad value must not crash a round
export function loadProgress(childId) {
  const p = { ...defaultProgress(), ...rules.loadProgress(RULES, GAME_KEY, childId, migrate) };
  if (!Array.isArray(p.cues)) p.cues = [];
  if (!Array.isArray(p.secretPcts)) p.secretPcts = [];
  p.settleGoal = num(p.settleGoal, SETTLE_START_S);
  p.zoo = Math.max(0, num(p.zoo, 0));
  p.golden = Math.max(0, num(p.golden, 0));
  if (typeof p.firstDay !== 'string') p.firstDay = null;
  p.warmBath = !!p.warmBath;
  return p;
}
export const saveProgress = (childId, p) => rules.saveProgress(GAME_KEY, childId, p);
