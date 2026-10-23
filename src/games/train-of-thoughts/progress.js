/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Train of Thoughts progress per child: line (level), goal, stars, passengers, days played, history.
// Pure functions + localStorage (in try/catch). The goal is in z units of the child's own warm-up:
// calm = busy z below the goal. Lower goal = harder.

export const STORE_KEY = 'brainarcade.trainOfThoughts';
export const GOAL_STEP = 0.1;
export const START_GOAL = 0.6; // day 1: about 70% calm at baseline level
export const GOAL_MIN = -2; // the CALM bar shows z from -2 to +2, so the goal mark stays on the bar
export const GOAL_MAX = 1.2;
export const MAX_ROUNDS_PER_DAY = 3;
export const WAGON_CALM_S = 5;
export const LANTERN_CALM_S = 10;

// Each line adds one new thing. Features are cumulative: wagons from 2, bells from 3, lanterns from 4, thunder from 5.
export const LINES = [
  { id: 1, name: 'SUNSET CITY', sec: 60, wagons: 0, skill: 'Slow the train.' },
  { id: 2, name: 'HARBOUR BRIDGE', sec: 75, wagons: 3, skill: '5 s calm drops a wagon.' },
  { id: 3, name: 'BELL CROSSING', sec: 90, wagons: 3, skill: 'Bells ring. Stay calm.' },
  { id: 4, name: 'FIREFLY NIGHT', sec: 120, wagons: 4, skill: '10 s calm lights a lantern.' },
  { id: 5, name: 'THUNDER TUNNEL', sec: 150, wagons: 4, skill: 'Thunder! Get calm again fast.' },
  { id: 6, name: 'MOON EXPRESS', sec: 180, wagons: 5, skill: 'You pick the route.' },
];
export const lineFeatures = (id) => ({ wagons: id >= 2, bells: id >= 3, lanterns: id >= 4, thunder: id >= 5 });

export const STORY = [
  'Brainy sits by the track. A noisy train comes: the Racing Thoughts Express. It is full of busy thoughts. Brainy breathes slowly. The train slows down.',
  'Now the train has wagons. Each wagon is a busy thought. When Brainy stays calm, a wagon lets go. A happy passenger hops off.',
  'Bells ring. Horns honk. Seagulls shout. Brainy hears them all, and stays calm anyway.',
  'It is night. Long calm lights the lanterns on the track. Who drives the train? Brainy sees a face in the window.',
  'KA-BOOM! Thunder! The driver is Captain Rush. He is always in a hurry. Brainy gets calm again, fast.',
  'The train flies to the moon. Captain Rush is tired. "How do you stay so calm?" he asks. Brainy shows him. Now they are friends.',
];

export const PASSENGERS = [
  'Tap-Dancing Sock', 'Pizza in Sunglasses', 'Sleepy Cloud', 'Burping Frog', 'Shy Robot', 'Disco Banana',
  'Tiny Dragon', 'Singing Toaster', 'Hiccup Ghost', 'Skating Penguin', 'Grumpy Cactus', 'Juggling Octopus',
  'Moon Cat', 'Bubble Fish', 'Space Hamster', 'Karate Carrot', 'Giggling Cupcake', 'Pirate Parrot',
  'Wobbly Jelly', 'Rocket Snail', 'Wizard Mouse', 'Sneezing Llama', 'Kite Turtle', 'Drum Bear',
  'Painter Fox', 'Lazy Lion', 'Bouncy Ball', 'Comet Puppy', 'Owl Detective', 'Golden Wagon Cat',
];

export const TWISTS = ['none', 'none', 'snow', 'party-hat', 'ducks', 'big-moon'];

const TALK_IDEAS = [
  'Ask: what does Brainy do when the bell rings?',
  'Ask: which passenger is the silliest?',
  'Ask: how does your body feel when the train slows down?',
  'Ask: what busy thought would you put in a wagon today?',
];

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const clampGoal = (g) => Math.min(GOAL_MAX, Math.max(GOAL_MIN, Math.round(g * 100) / 100));
export const goalLevel = (goal) => Math.round((START_GOAL - goal) / GOAL_STEP); // steps calmer than day 1

export function defaultProgress() {
  return {
    unlocked: 1, goal: START_GOAL, dayEndGoal: null, lastDay: null, roundsToday: 0,
    goodStreak: 0, hardStreak: 0, stars: 0, passengers: 0, days: 0, lastUnlockDay: null,
    history: [],
  };
}

// Loaded progress with the new day applied: rounds reset, and the day starts one step easier.
export function startDay(p, now = new Date()) {
  const today = dayKey(now);
  if (p.lastDay === today) return p;
  const goal = p.dayEndGoal != null ? clampGoal(p.dayEndGoal + GOAL_STEP) : p.goal;
  return { ...p, roundsToday: 0, goal };
}

// Main loop between rounds: aim for 75-85% calm.
export function nextGoal(goal, calmPct) {
  if (calmPct > 0.85) return clampGoal(goal - GOAL_STEP);
  if (calmPct < 0.75) return clampGoal(goal + GOAL_STEP);
  return goal;
}

// round: { line, calmPct, longestStreak, eased, wagonsDropped, trainsStopped, bounceBackS, heldPct, sec, anyCalm5, bellCalm }
export function finishRound(p, round, now = new Date()) {
  const today = dayKey(now);
  const out = { ...p };
  const stars = 1 + (round.anyCalm5 ? 1 : 0); // for finishing and for effort, never for score
  out.stars = p.stars + stars;
  const newPassengers = [];
  for (let i = 0; i < round.wagonsDropped; i++) newPassengers.push(PASSENGERS[(p.passengers + i) % PASSENGERS.length]);
  out.passengers = p.passengers + round.wagonsDropped;
  if (p.lastDay !== today) out.days = p.days + 1;
  out.lastDay = today;
  out.roundsToday = (p.lastDay === today ? p.roundsToday : 0) + 1;

  // Unlock: 2 good rounds in a row on the top line; max one new line a day; never taken away
  let unlockedLine = null;
  if (round.line === p.unlocked) {
    const good = round.calmPct >= 0.7 && !round.eased;
    out.goodStreak = good ? p.goodStreak + 1 : 0;
    if (out.goodStreak >= 2 && p.unlocked < LINES.length && p.lastUnlockDay !== today) {
      out.unlocked = p.unlocked + 1;
      out.goodStreak = 0;
      out.lastUnlockDay = today;
      unlockedLine = out.unlocked;
    }
  }
  // Practice offer after 3 hard rounds in a row (the child keeps the line)
  out.hardStreak = round.calmPct < 0.4 ? p.hardStreak + 1 : 0;
  const practiceOffer = out.hardStreak >= 3 && round.line > 1;
  if (practiceOffer) out.hardStreak = 0;

  out.goal = nextGoal(p.goal, round.calmPct);
  out.dayEndGoal = out.goal;
  out.history = [...p.history, {
    date: now.toISOString(), line: round.line, calmPct: round.calmPct, longestStreak: round.longestStreak,
    goal: p.goal, wagons: round.wagonsDropped, stopped: round.trainsStopped, bounceBackS: round.bounceBackS,
    heldPct: round.heldPct, sec: round.sec,
    // Raw busy value (log beta/alpha): warm-up mean/SD and per-minute means. The goal is relative to each
    // day's warm-up, so these are what show real change across days.
    baseMu: round.baseMu, baseSd: round.baseSd, busyByMin: round.busyByMin,
  }].slice(-200);
  return { progress: out, stars, newPassengers, unlockedLine, practiceOffer };
}

// Praise that names the act
export function praiseFor(round) {
  const out = [];
  if (round.wagonsDropped > 0) out.push(`You let ${round.wagonsDropped} wagon${round.wagonsDropped > 1 ? 's' : ''} go!`);
  if (round.trainsStopped > 0) out.push(round.trainsStopped > 1 ? `You stopped the train ${round.trainsStopped} times!` : 'You stopped the train!');
  if (round.bellCalm > 0) out.push('You stayed calm when the bell rang!');
  if (round.lanterns > 0) out.push(`You lit ${round.lanterns} lantern${round.lanterns > 1 ? 's' : ''}!`);
  if (round.thunderCalm > 0) out.push('You stayed calm in the thunder!');
  if (Number.isFinite(round.bounceBackS)) {
    const s = Math.max(1, Math.round(round.bounceBackS));
    out.push(`You got calm again in ${s} second${s > 1 ? 's' : ''}!`);
  }
  if (round.longestStreak >= 3) out.push(`You stayed calm for ${Math.round(round.longestStreak)} seconds in a row!`);
  if (!out.length) out.push('You finished the round. Well done for trying!');
  return out.slice(0, 3);
}

// Weekly parent card: the last 7 days
export function weeklyCard(p, now = new Date()) {
  const from = now.getTime() - 7 * 864e5;
  const week = p.history.filter((h) => Date.parse(h.date) >= from);
  const before = p.history.filter((h) => Date.parse(h.date) < from);
  const avg = week.length ? week.reduce((s, h) => s + h.calmPct, 0) / week.length : null;
  return {
    rounds: week.length,
    days: new Set(week.map((h) => dayKey(new Date(h.date)))).size,
    calmPct: avg,
    longestStreak: week.reduce((m, h) => Math.max(m, h.longestStreak || 0), 0),
    goalLevel: goalLevel(p.goal),
    goalLevelWeekAgo: before.length ? goalLevel(before[before.length - 1].goal) : null,
    newPassengers: week.reduce((s, h) => s + (h.wagons || 0), 0),
    talk: TALK_IDEAS[Math.floor(now.getTime() / (7 * 864e5)) % TALK_IDEAS.length],
  };
}

export function loadProgress(childId) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const p = all?.byChild?.[childId];
    if (!p) return defaultProgress();
    const out = { ...defaultProgress(), ...p };
    const u = Math.round(Number(out.unlocked));
    out.unlocked = Number.isFinite(u) ? Math.min(LINES.length, Math.max(1, u)) : 1; // a bad value must not crash a round
    if (!Array.isArray(out.history)) out.history = [];
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
