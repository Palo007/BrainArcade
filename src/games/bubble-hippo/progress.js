/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo progress per child: badge, goal, stars, Bubble Zoo, days played, history.
// Pure functions + localStorage (in try/catch). The goal is in z units of the child's own baseline:
// calm = meter z above the goal. Higher goal = harder. All limits are START values; the test day sets real ones.

export const STORE_KEY = 'brainarcade.bubbleHippo';
export const GOAL_STEP = 0.1; // z
export const START_GOAL = 0; // the goal line starts at the child's own normal
export const GOAL_MIN = -1.5;
export const GOAL_MAX = 3;
export const MAX_ROUNDS_PER_DAY = 3;
export const UNLOCK_STEPS = 3; // the goal must be this many steps above where the badge started
export const SAFETY_AT_S = 45; // one safety step inside a round, after this long
export const SAFETY_LOW = 0.4; // above-goal time below this = too hard
export const SAFETY_HIGH = 0.9; // above this = too easy
export const BETWEEN_UP = 0.8; // between rounds: above the goal more than this = one step up
export const HARD_PCT = 0.4; // a round below this is "hard"
export const HARD_ROUNDS_FOR_WARM = 3;
export const LAST_EASE_S = 20; // the last seconds of the day's last round are a little easier
export const SETTLE_START_S = 15;
export const DELAY_S = 2; // measured delay of the meter (about 1.5-2 s), to be set on the test day
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

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const clampGoal = (g) => Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(g * 100) / 100));
const stepsAbove = (goal, start) => Math.floor((goal - start) / GOAL_STEP + 1e-6);

export function defaultProgress() {
  return {
    unlocked: 1, goal: START_GOAL, dayEndGoal: null, lastDay: null, roundsToday: 0, firstDay: null,
    badgeDays: {}, badgeLastDay: {}, badgeStart: { 1: START_GOAL },
    settleGoal: SETTLE_START_S, cues: [], secretPcts: [],
    hardStreak: 0, warmBath: false, stars: 0, zoo: 0, golden: 0, days: 0,
    history: [],
  };
}

// Loaded progress with the new day applied: rounds reset, and the day starts one step easier.
export function startDay(p, now = new Date()) {
  const today = dayKey(now);
  if (p.lastDay === today) return p;
  const goal = p.dayEndGoal != null ? clampGoal(p.dayEndGoal - GOAL_STEP) : p.goal;
  return { ...p, roundsToday: 0, goal };
}

export const roundsLeftToday = (p, now = new Date()) =>
  Math.max(0, MAX_ROUNDS_PER_DAY - (p.lastDay === dayKey(now) ? p.roundsToday : 0));

// Inside a round the goal stays still, except for one safety step after 45 s (max 0.1 z):
// above the goal less than 40% = one step easier, more than 90% = one step harder. done = the step was used.
export function inRoundSafetyStep(goal, abovePct, elapsedS, done = false) {
  if (done || elapsedS < SAFETY_AT_S || !Number.isFinite(abovePct)) return goal;
  if (abovePct < SAFETY_LOW) return clampGoal(goal - GOAL_STEP);
  if (abovePct > SAFETY_HIGH) return clampGoal(goal + GOAL_STEP);
  return goal;
}

// The last 20 s of the day's last round are a little easier (one step), so the day ends with a win
export const finalStretchGoal = (goal, secLeft, lastRoundOfDay) =>
  lastRoundOfDay && secLeft <= LAST_EASE_S ? clampGoal(goal - GOAL_STEP) : goal;

// Main loop between rounds: above the goal more than 80% of the time = one step harder
export function nextGoal(goal, abovePct) {
  return abovePct > BETWEEN_UP ? clampGoal(goal + GOAL_STEP) : goal;
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

// The next badge opens when BOTH: enough play days on this badge AND real progress (goal 3 steps above where
// the badge started). From Otter on also: settled in 2 of the last 3 cues. From Whale on also: secret time
// above the goal at least half. Never taken away, King is the top.
export function canUnlock(p) {
  const badge = BADGES[p.unlocked - 1];
  if (!badge || badge.minDays == null || p.unlocked >= BADGES.length) return false;
  if ((p.badgeDays?.[p.unlocked] || 0) < badge.minDays) return false;
  const start = p.badgeStart?.[p.unlocked] ?? START_GOAL;
  if (stepsAbove(p.goal, start) < UNLOCK_STEPS) return false;
  if (p.unlocked >= 3 && (p.cues || []).filter(Boolean).length < SETTLE_OK_CUES) return false;
  if (p.unlocked >= 5) {
    const s = p.secretPcts || [];
    if (!s.length || s.reduce((a, b) => a + b, 0) / s.length < SECRET_MIN_PCT) return false;
  }
  return true;
}

// round: { badge, warm, sec, goal (end of round, after any safety step), calmPct (above the goal), longestHold,
//          settleTimes[], ducksRight, ducksTotal, secretPct, pestCalmPct, noPestCalmPct, setup, baseMu, baseMad }
// The round gets its star for finishing, also when it ended early. rnd is for tests.
export function finishRound(p, round, now = new Date(), rnd = Math.random) {
  const today = dayKey(now);
  const newDay = p.lastDay !== today;
  const out = { ...p };
  const stars = 1; // for finishing, never for score
  out.stars = p.stars + stars;
  const friend = p.zoo < ZOO_SIZE ? ZOO[p.zoo] : null;
  if (friend) out.zoo = p.zoo + 1;
  const golden = rnd() < GOLDEN_CHANCE;
  out.golden = p.golden + (golden ? 1 : 0);
  if (newDay) out.days = p.days + 1;
  out.firstDay = p.firstDay || today;
  out.lastDay = today;
  out.roundsToday = (newDay ? 0 : p.roundsToday) + 1;
  out.badgeDays = { ...p.badgeDays };
  out.badgeLastDay = { ...p.badgeLastDay };
  if (out.badgeLastDay[round.badge] !== today) {
    out.badgeDays[round.badge] = (out.badgeDays[round.badge] || 0) + 1;
    out.badgeLastDay[round.badge] = today;
  }

  out.goal = nextGoal(Number.isFinite(round.goal) ? round.goal : p.goal, round.calmPct);
  out.dayEndGoal = out.goal;
  const times = round.settleTimes || [];
  if (times.length) {
    out.cues = [...(p.cues || []), ...times.map((t) => t <= p.settleGoal)].slice(-3);
    out.settleGoal = settleGoal(p.settleGoal, times);
  }
  if (Number.isFinite(round.secretPct)) out.secretPcts = [...(p.secretPcts || []), round.secretPct].slice(-3);

  // 3 hard rounds in a row: offer a warm bath on the badge below (the child keeps the badge)
  let warmBath = false;
  if (round.warm) out.warmBath = false;
  else {
    out.hardStreak = round.calmPct < HARD_PCT ? p.hardStreak + 1 : 0;
    warmBath = out.hardStreak >= HARD_ROUNDS_FOR_WARM && round.badge > 1;
    if (warmBath) { out.hardStreak = 0; out.warmBath = true; }
  }

  // Unlock: only from a round on the top badge
  let unlockedBadge = null;
  if (round.badge === p.unlocked && canUnlock(out)) {
    out.unlocked = p.unlocked + 1;
    out.badgeStart = { ...p.badgeStart, [out.unlocked]: out.goal };
    unlockedBadge = out.unlocked;
  }
  out.history = [...p.history, {
    date: now.toISOString(), badge: round.badge, sec: round.sec, calmPct: round.calmPct, longestHold: round.longestHold,
    goal: p.goal, endGoal: round.goal, settleTimes: times, ducksRight: round.ducksRight, ducksTotal: round.ducksTotal,
    secretPct: round.secretPct, pestCalmPct: round.pestCalmPct, noPestCalmPct: round.noPestCalmPct,
    setup: round.setup, baseMu: round.baseMu, baseMad: round.baseMad,
  }].slice(-200);
  return { progress: out, stars, friend, golden, unlockedBadge, warmBath };
}

export function loadProgress(childId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const p = all?.byChild?.[childId];
    if (!p) return defaultProgress();
    const out = { ...defaultProgress(), ...p };
    const u = Math.round(Number(out.unlocked));
    out.unlocked = Number.isFinite(u) ? Math.min(BADGES.length, Math.max(1, u)) : 1; // a bad value must not crash a round
    if (!Array.isArray(out.history)) out.history = [];
    if (!Array.isArray(out.cues)) out.cues = [];
    if (!Array.isArray(out.secretPcts)) out.secretPcts = [];
    for (const k of ['badgeDays', 'badgeLastDay', 'badgeStart']) {
      if (!out[k] || typeof out[k] !== 'object') out[k] = k === 'badgeStart' ? { 1: START_GOAL } : {};
    }
    return out;
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(childId, p) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || { byChild: {} };
    all.byChild = { ...(all.byChild || {}), [childId]: p };
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
