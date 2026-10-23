/* SPDX-License-Identifier: AGPL-3.0-or-later */
// All signal checks of Train of Thoughts in one answer, in the same shape as the planned shared
// useSignalGate() of the Play Setup project: { state: 'ok'|'hint'|'hold'|'freeze', reason, hint }.
// When useSignalGate() lands, the game calls it instead of readGate(); nothing else must change.
//   ok     - play as normal
//   hint   - keep playing, Brainy shows the hint
//   hold   - keep the last CALM value; the 5 s calm clock pauses (no reset); no reward, no punishment
//   freeze - pause the game; round time does not count. Today this comes from useSignalPause (bad forehead
//            contact): the game timer stops, so readGate() never returns it.

// Hints are text keys; the screen shows t(hint).
const HINTS = {
  contact: 'games.tot.hintContact',
  muscle: 'games.tot.hintMuscle',
  eyes: 'games.tot.hintEyes',
  sleepy: 'games.tot.hintSleepy',
};

export function readGate({ stale, adjusting, frontalSpike, checks }) {
  if (stale || adjusting || frontalSpike) return { state: 'hold', reason: 'contact', hint: stale ? HINTS.contact : null };
  if (checks?.muscle) return { state: 'hold', reason: 'muscle', hint: HINTS.muscle };
  if (checks?.eyes) return { state: 'hold', reason: 'eyes', hint: HINTS.eyes };
  if (checks?.sleepy) return { state: 'hold', reason: 'sleepy', hint: HINTS.sleepy };
  if (checks?.tense) return { state: 'hint', reason: 'muscle', hint: HINTS.muscle };
  return { state: 'ok', reason: null, hint: null };
}
