/* SPDX-License-Identifier: AGPL-3.0-or-later */
// All signal checks of Turbo Rex in one answer, in the same shape as the planned shared
// useSignalGate() of the Play Setup project: { state: 'ok'|'hint'|'hold'|'freeze', reason, hint }.
// When useSignalGate() lands (Play Setup Phase 3), the game calls it instead of readGate().
// Motion checks wait for Play Setup Phase 2; until then the phone's own tilt and the frontal spike
// hold stand in for them.
//   ok     - play as normal
//   hint   - keep playing, Rex shows the hint
//   hold   - keep the last focus value; no reward, no punishment (round time runs)
//   freeze - FREEZE FRAME: round time stops, nothing is scored or lost. Forehead muscle gives it.
//            A headband that came off gives a pause too, from useSignalPause.

export const TAP_HOLD_MS = 500; // a tap moves hands, head and eyes: the value is held this long
export const FREEZE_MIN_MS = 1500; // a freeze frame stays at least this long, so it does not flicker

const HINTS = {
  contact: 'Hold still. Checking the headband.',
  muscle: 'Freeze frame! Be a statue. Floppy face.',
  neck: 'Soft shoulders. Wiggle your jaw.',
  eyes: 'Open your eyes! Rex needs you.',
  tilt: 'Lift me up to your eyes!',
};

// stale  = no fresh frame; spike = a big frontal spike in the last second (or the headband is settling)
// checks = focusSignal createChecks() result; blink = the frame has a blink inside its window
// tap    = inside the hold after a tap; tilt = the phone is held too flat for 3 s (hint only)
export function readGate({ stale, spike, checks, blink, tap, tilt }) {
  const site = checks?.muscle ? checks.muscleSite : null;
  if (site === 'forehead' || site === 'both') return { state: 'freeze', reason: 'muscle', hint: HINTS.muscle };
  if (stale || spike) return { state: 'hold', reason: 'contact', hint: HINTS.contact };
  if (site === 'ears') return { state: 'hold', reason: 'neck', hint: HINTS.neck };
  if (checks?.eyes) return { state: 'hold', reason: 'eyes', hint: HINTS.eyes };
  if (blink) return { state: 'hold', reason: 'blink', hint: null };
  if (checks?.eyeMove) return { state: 'hold', reason: 'eyeMove', hint: null }; // kids follow pizzas: no nagging
  if (tap) return { state: 'hold', reason: 'tap', hint: null };
  if (tilt) return { state: 'hint', reason: 'tilt', hint: HINTS.tilt };
  return { state: 'ok', reason: null, hint: null };
}

// Hold reasons that only come from the signal (the parent's "main reason"); tap holds are the game's own
export const SIGNAL_REASONS = ['contact', 'neck', 'eyes', 'blink', 'eyeMove'];
