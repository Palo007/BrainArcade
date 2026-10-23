/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Small WebAudio sounds. primeTrainAudio() must run inside the START tap (mobile browsers need a gesture).
let ctx = null;

export function primeTrainAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctx || ctx.state === 'closed') ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* audio unavailable */ }
}

function tone(freq, start, dur, { type = 'square', vol = 0.08, slideTo = null } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  wagon: () => { tone(660, 0, 0.12); tone(990, 0.1, 0.18); },
  stop: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2)); },
  bell: () => { tone(1320, 0, 0.25, { type: 'triangle', vol: 0.07 }); tone(1320, 0.3, 0.25, { type: 'triangle', vol: 0.07 }); },
  horn: () => { tone(150, 0, 0.7, { type: 'sawtooth', vol: 0.06 }); tone(190, 0, 0.7, { type: 'sawtooth', vol: 0.05 }); },
  whoosh: () => { tone(900, 0, 0.5, { type: 'sawtooth', vol: 0.04, slideTo: 120 }); },
  lantern: () => { tone(880, 0, 0.3, { type: 'sine', vol: 0.08 }); },
  calm: () => { tone(784, 0, 0.15, { type: 'sine', vol: 0.06 }); },
};

export function playSound(name) {
  try {
    if (ctx?.state === 'running') SOUNDS[name]?.();
  } catch { /* audio unavailable */ }
}
