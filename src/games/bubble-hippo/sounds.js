/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo sound, all made live with Web Audio (no files): a 64 bpm F-major pentatonic music box, a pad that
// breathes, a calm shimmer, duck-time music (octave up, double speed), soft effects, limiter + reverb.
// primeBubbleAudio() must run inside a tap (mobile browsers need a gesture). Everything is silent if audio is unavailable.
// Note: lib/chime.js keeps its AudioContext private, so this file owns one context; it still calls chime's primeAudio()
// in the same tap so the shared one is unlocked too.
import { primeAudio } from '../../lib/chime.js';

const BEAT = 60 / 64;
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// F major pentatonic (F G A C D): no note can clash with another
const PENTA = [53, 55, 57, 60, 62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86];
const CHORDS = [[53, 57, 60, 64], [50, 53, 57, 60], [46, 50, 53, 57], [48, 52, 55, 60]]; // Fmaj7, Dm7, Bbmaj7, C
const rnd = (a, b) => a + Math.random() * (b - a);

let ctx = null;
let g = null; // node graph, built once per context
let musicOn = false;
let next = 0;
let step = 0;
let mel = 7;
let pad = [];
let mode = { duck: false, breathK: null, shimmer: false, secret: false, live: true };
const mix = { music: true, sfx: true, voice: true };

function impulse(c, sec, decay) {
  const len = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function buildGraph(c) {
  const master = c.createGain();
  master.gain.value = 0.6;
  const comp = c.createDynamicsCompressor(); // the limiter: nothing gets loud
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  master.connect(comp);
  comp.connect(c.destination);
  const conv = c.createConvolver();
  conv.buffer = impulse(c, 3.4, 2.4);
  const rev = c.createGain();
  rev.gain.value = 0.55;
  rev.connect(conv);
  conv.connect(master);
  const bus = (v) => { const n = c.createGain(); n.gain.value = v; n.connect(master); n.connect(rev); return n; };
  const music = bus(0);
  const sfx = bus(0.8);
  const shim = bus(0);
  // warm pad: soft voices through a low-pass that opens with the breath
  const padF = c.createBiquadFilter();
  padF.type = 'lowpass';
  padF.frequency.value = 420;
  padF.Q.value = 0.5;
  const padG = c.createGain();
  padG.gain.value = 0;
  padF.connect(padG);
  padG.connect(music);
  return { master, music, sfx, shim, padF, padG };
}

/** Call synchronously from a tap/click handler. */
export function primeBubbleAudio() {
  try {
    primeAudio();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctx || ctx.state === 'closed') {
      ctx = new Ctx();
      g = buildGraph(ctx);
      pad = [];
      musicOn = false;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch { /* audio unavailable */ }
}

// ---------- building blocks ----------
function bell(f, t, vol, dur, dest, bright) {
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  o2.type = 'sine'; o2.frequency.value = f * (bright ? 3 : 2.01);
  g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(vol, t + 0.012); g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.008); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.35);
  o.connect(g1); o2.connect(g2);
  g1.connect(dest || g.sfx); g2.connect(dest || g.sfx);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}

function noise(t, dur, f0, f1, vol, type) {
  const len = Math.floor(ctx.sampleRate * dur);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = b;
  const f = ctx.createBiquadFilter();
  f.type = type || 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + dur * 0.3); gn.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(f); f.connect(gn); gn.connect(g.sfx);
  s.start(t);
}

function glide(t, f0, f1, dur, vol, type, lp) {
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const gn = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  f.type = 'lowpass'; f.frequency.value = lp || 900;
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.04); gn.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f); f.connect(gn); gn.connect(g.sfx);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

function wobble(o, t, hz, depth, dur) {
  const l = ctx.createOscillator();
  const lg = ctx.createGain();
  l.frequency.value = hz; lg.gain.value = depth;
  l.connect(lg); lg.connect(o.frequency);
  l.start(t); l.stop(t + dur);
}

const SFX = {
  launch() { const t = ctx.currentTime; [65, 69, 72, 77, 81].forEach((n, i) => bell(NOTE(n + 12), t + i * 0.11, 0.06, 2.2)); },
  rooster() { const t = ctx.currentTime; bell(NOTE(84), t, 0.07, 0.9, null, true); bell(NOTE(81), t + 0.28, 0.07, 1.2, null, true); noise(t + 0.55, 0.6, 600, 2400, 0.05); },
  toot() { const t = ctx.currentTime; const o = glide(t + 0.05, 120, 70, 0.45, 0.13, 'sine', 380); wobble(o, t, 16, 9, 0.5); },
  plink() { const t = ctx.currentTime; glide(t, rnd(1000, 1500), 500, 0.12, 0.025, 'sine', 3000); },
  chimes() { const t = ctx.currentTime; for (let i = 0; i < 4; i++) bell(NOTE(PENTA[10 + Math.floor(Math.random() * 5)] + 12), t + i * rnd(0.08, 0.16), 0.035, 2.5); },
  foamIn() { noise(ctx.currentTime, 1.2, 1800, 300, 0.05, 'lowpass'); },
  harp() { const t = ctx.currentTime; [60, 65, 69, 72, 77].forEach((n, i) => bell(NOTE(n + 12), t + i * 0.07, 0.05, 1.8)); },
  buzz() { const t = ctx.currentTime; const o = glide(t, 190, 200, 1.4, 0.025, 'sawtooth', 700); wobble(o, t, 7, 25, 1.5); },
  honk() { const t = ctx.currentTime; glide(t, 330, 300, 0.22, 0.05, 'square', 650); glide(t + 0.3, 320, 290, 0.26, 0.05, 'square', 650); },
  hintBell() { bell(NOTE(81), ctx.currentTime, 0.035, 1.2); },
};

/** name: launch | rooster | toot | plink | chimes | foamIn | harp | buzz | honk | hintBell */
export function playSfx(name) {
  try {
    if (!mix.sfx || !ctx || ctx.state !== 'running') return;
    SFX[name]?.();
  } catch { /* audio unavailable */ }
}

// ---------- music ----------
export function startMusic() {
  try {
    if (!ctx || !g || musicOn) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    pad = CHORDS[0].map((n, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = NOTE(n - 12);
      o.detune.value = (i - 1.5) * 4;
      const og = ctx.createGain();
      og.gain.value = 0.05;
      o.connect(og); og.connect(g.padF);
      o.start();
      return o;
    });
    next = now + 0.2; step = 0; mel = 7;
    musicOn = true;
    applyMode();
  } catch { /* audio unavailable */ }
}

export function stopMusic() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    if (!ctx || !g || !musicOn) return;
    musicOn = false;
    const now = ctx.currentTime;
    g.music.gain.setTargetAtTime(0, now, 0.3);
    g.shim.gain.setTargetAtTime(0, now, 0.3);
    const old = pad;
    pad = [];
    old.forEach((o) => { try { o.stop(now + 1.6); } catch { /* already stopped */ } });
  } catch { /* audio unavailable */ }
}

function applyMode() {
  const now = ctx.currentTime;
  const useBreath = typeof mode.breathK === 'number';
  const k = useBreath ? mode.breathK : 0;
  g.music.gain.setTargetAtTime(mix.music ? (mode.live ? 0.9 : 0.2) : 0, now, 0.5);
  g.padF.frequency.setTargetAtTime(useBreath ? 300 + 650 * k : 520, now, 0.25);
  g.padG.gain.setTargetAtTime(useBreath ? 0.5 + 0.5 * k : 0.7, now, 0.3);
  g.shim.gain.setTargetAtTime(mix.music && mode.shimmer && !mode.secret ? 0.9 : 0, now, 0.7);
}

/** Call every game tick. duck: duck time; breathK: 0..1 pacer wave or null; shimmer: meter above goal; secret: shimmer off; live (optional, default true): false when paused/frozen. */
export function setMusicMode(m = {}) {
  mode = {
    duck: !!m.duck,
    breathK: typeof m.breathK === 'number' ? m.breathK : null,
    shimmer: !!m.shimmer,
    secret: !!m.secret,
    live: m.live !== false,
  };
  try {
    if (!ctx || !g || !musicOn || ctx.state !== 'running') return;
    applyMode();
    const now = ctx.currentTime;
    if (next < now - 0.5) next = now + 0.1; // tab was asleep: do not replay the missed notes
    const duck = mode.duck;
    while (next < now + 0.3) {
      const t = next;
      const s = step;
      const chord = CHORDS[Math.floor(s / 8) % 4];
      if (s % 8 === 0) pad.forEach((o, i) => o.frequency.setTargetAtTime(NOTE(chord[i] - 12), t, 0.4));
      if (mode.live && mix.music) {
        if (s % 2 === 0 || duck || Math.random() < 0.35) {
          if (Math.random() < 0.78) {
            mel = Math.max(0, Math.min(PENTA.length - 1, mel + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
            if (s % 8 === 0) { const tone = PENTA.findIndex((n) => (n - chord[0]) % 12 === 0); if (tone >= 0 && Math.abs(tone - mel) < 4) mel = tone; }
            bell(NOTE(PENTA[mel] + (duck ? 12 : 0)), t, duck ? 0.06 : 0.075, 2.4, g.music);
          }
        }
        if (s % 4 === 2) bell(NOTE(chord[1 + ((s / 4) % 3 | 0)] + 24), t + BEAT * 0.5, 0.04, 3, g.shim, true);
        if (duck) bell(NOTE(chord[0] + 12), t + BEAT * 0.5, 0.03, 0.25, g.music, true);
      }
      step++;
      next += duck && mode.live ? BEAT / 2 : BEAT;
    }
  } catch { /* audio unavailable */ }
}

/** Parent toggles. Pass any of { music, sfx, voice } booleans. */
export function setMix(m = {}) {
  if (typeof m.music === 'boolean') mix.music = m.music;
  if (typeof m.sfx === 'boolean') mix.sfx = m.sfx;
  if (typeof m.voice === 'boolean') {
    mix.voice = m.voice;
    if (!m.voice) { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }
  }
  try { if (ctx && g && musicOn) applyMode(); } catch { /* audio unavailable */ }
}

// ---------- voice (stand-in: the browser voice; the app would use recorded lines) ----------
export function say(text) {
  try {
    if (!mix.voice || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    const clean = String(text).replace(/[^\w\s!?.,'-]/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.9; u.pitch = 1.25; u.volume = 0.8;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voice unavailable */ }
}
