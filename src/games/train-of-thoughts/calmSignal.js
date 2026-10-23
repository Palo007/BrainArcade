/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Train of Thoughts' own calm number, made from the shared fast signal (lib/fastSignal.js):
// busy = log(beta / alpha) on the forehead (AF7/AF8), with the child's own bands and beta capped at 25 Hz.
// The flags (stale, blink, muscle, eyes closed, sleepy) come from the shared module too.
import { signalBaseline } from '../../lib/fastSignal.js';

export const busyOf = (frame) => Math.log(frame.frontal.beta / frame.frontal.alpha);

// Play-pose baseline from the warm-up frames (eyes open, watching the train):
// mean / SD of busy for the z (as before the move), plus the quiet levels the shared flags need
export function makeBaseline(frames) {
  if (!frames.length) return null;
  const busy = frames.map(busyOf);
  const mu = busy.reduce((a, b) => a + b, 0) / busy.length;
  const sd = Math.sqrt(busy.reduce((a, b) => a + (b - mu) ** 2, 0) / busy.length);
  return {
    ...signalBaseline(frames),
    mu,
    sd: Math.max(sd, 0.15), // a floor, so a very still warm-up does not make the bar jumpy
    n: frames.length,
  };
}
