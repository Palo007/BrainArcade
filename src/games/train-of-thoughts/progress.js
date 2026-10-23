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
export const LINES = [
  { id: 1, name: 'SUNSET CITY', sec: 60, wagons: 0, skill: 'Slow the train.' },
  { id: 2, name: 'HARBOUR BRIDGE', sec: 75, wagons: 3, skill: '5 s calm drops a wagon.' },
  { id: 3, name: 'BELL CROSSING', sec: 90, wagons: 3, skill: 'Bells ring. Stay calm.' },
  { id: 4, name: 'FIREFLY NIGHT', sec: 120, wagons: 4, skill: '10 s calm lights a lantern.' },
  { id: 5, name: 'THUNDER TUNNEL', sec: 150, wagons: 4, skill: 'Thunder! Get calm again fast.' },
  { id: 6, name: 'MOON EXPRESS', sec: 180, wagons: 5, skill: 'You pick the route.' },
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
