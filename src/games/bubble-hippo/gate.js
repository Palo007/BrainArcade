/* SPDX-License-Identifier: AGPL-3.0-or-later */
// All signal checks of Bubble Hippo in one answer, in the same shape as the planned shared
// useSignalGate() of the Play Setup project: { state: 'ok'|'hint'|'hold'|'freeze', reason, hint }.
// When useSignalGate() lands, the game calls it instead of readGate(); nothing else must change.
//   ok     - play as normal
//   hint   - keep playing, the hippo shows the hint
//   hold   - keep the last meter value; no reward, no punishment
//   freeze - bath break: round time does not count. Sleepy gives it here. A headband that came off gives it
//            too, from useSignalPause: the game timer stops, and after 60 s off the round ends (still a star).

export const GIGGLE_GAP_MS = 4000; // after a toot the hippo giggles: the meter is not read for this long

const HINTS = {
  contact: 'Hold still. Checking the headband.',
  sleepy: 'Reach up high like a giraffe!',
  muscle: 'Floppy jaw, like a hippo yawn.',
  eyes: 'Peek-a-boo! Open your eyes.',
  eyeMove: 'Eyes on the bubble.',
};

// giggle = true while inside the giggle gap after a toot (no hint: it is a happy pause, not a problem)
export function readGate({ stale, adjusting, checks, giggle }) {
  if (stale || adjusting) return { state: 'hold', reason: 'contact', hint: stale ? HINTS.contact : null };
  if (checks?.sleepy) return { state: 'freeze', reason: 'sleepy', hint: HINTS.sleepy };
  if (checks?.muscle) return { state: 'hold', reason: 'muscle', hint: HINTS.muscle };
  if (checks?.eyes) return { state: 'hold', reason: 'eyes', hint: HINTS.eyes };
  if (checks?.eyeMove) return { state: 'hold', reason: 'eyeMove', hint: HINTS.eyeMove };
  if (giggle) return { state: 'hold', reason: 'giggle', hint: null };
  return { state: 'ok', reason: null, hint: null };
}

// Play setup ('hands' | 'stand' | 'pc') saved by the Play Setup project, or null when not chosen.
// Read-only and tolerant, so the game works with or without that project.
export function readPlaySetup(childId) {
  try {
    const all = JSON.parse(localStorage.getItem('brainarcade.playSetup') || 'null');
    const v = all?.byChild?.[childId];
    return v === 'hands' || v === 'stand' || v === 'pc' ? v : null;
  } catch {
    return null;
  }
}
