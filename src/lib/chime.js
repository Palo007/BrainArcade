/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Soft two-note WebAudio chime ("open your eyes now"). Safe to call anywhere; silent if audio is unavailable.
// Mobile browsers only allow audio started from a user gesture: primeAudio() creates/resumes ONE shared
// AudioContext inside the START click handler, playChime() later reuses it (no new context per chime).
let shared = null;

/** Call synchronously from a click/tap handler. */
export function primeAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!shared || shared.state === 'closed') shared = new Ctx();
    if (shared.state === 'suspended') shared.resume().catch(() => {});
  } catch { /* audio unavailable */ }
}

export function playChime() {
  try {
    primeAudio(); // no-op when already primed; best effort if never primed
    const ctx = shared;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    [[659.25, 0], [880, 0.28]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + delay);
      gain.gain.linearRampToValueAtTime(0.18, t0 + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 1);
    });
  } catch { /* audio unavailable */ }
}
