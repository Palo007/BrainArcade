/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Turbo Rex sound, all made live with Web Audio (no files), from the proposal mock-up: soft music that follows
// the brain (a slow lullaby when Rex is sleepy, faster with soft drums when he zooms), burps, chimes, BLEH.
// C pentatonic melody on C-Am-F-G, so no note sounds wrong. A limiter keeps everything soft.
// primeRexAudio() must run inside a tap (mobile browsers need a gesture). Everything is silent if audio is unavailable.
// lib/chime.js keeps its AudioContext private, so this file owns one; it calls chime's primeAudio() in the same tap.
import { primeAudio } from '../../lib/chime.js';

const PROG = [48, 45, 41, 43]; // C, Am, F, G
const MINOR = new Set([45]);
const PENTA = [0, 2, 4, 7, 9];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

let A = null;
let g = null; // { master, music, sfx, lp, noise }
let timer = null;
let next = 0;
let step = 0;
let melo = 76;
let musicOn = false;
let mode = { energy: 0.4, frozen: false, live: true };
const mix = { music: true, sfx: true, voice: true };

function buildGraph(c) {
  const master = c.createGain();
  master.gain.value = 0.5;
  const comp = c.createDynamicsCompressor(); // the limiter: nothing gets loud
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp);
  comp.connect(c.destination);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.4;
  lp.connect(master);
  const music = c.createGain();
  music.gain.value = 0;
  music.connect(lp);
  const sfx = c.createGain();
  sfx.gain.value = 0.7;
  sfx.connect(master);
  const noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { master, music, sfx, lp, noise };
}

/** Call synchronously from a tap/click handler. */
export function primeRexAudio() {
  try {
    primeAudio();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!A || A.state === 'closed') {
      A = new Ctx();
      g = buildGraph(A);
      musicOn = false;
    }
    if (A.state === 'suspended') A.resume().catch(() => {});
  } catch { /* audio unavailable */ }
}

function tone(f, t, dur, type, gain, bus, attack = 0.01) {
  const o = A.createOscillator();
  const gn = A.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(gain, t + attack);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn); gn.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  return o;
}
function hat(t, gain) {
  const s = A.createBufferSource();
  const f = A.createBiquadFilter();
  const gn = A.createGain();
  s.buffer = g.noise; f.type = 'highpass'; f.frequency.value = 7000;
  gn.gain.setValueAtTime(gain, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f); f.connect(gn); gn.connect(g.music); s.start(t); s.stop(t + 0.06);
}
function kick(t) {
  const o = A.createOscillator();
  const gn = A.createGain();
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
  gn.gain.setValueAtTime(0.32, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(gn); gn.connect(g.music); o.start(t); o.stop(t + 0.2);
}

// One eighth note. e = energy 0..1: low = lullaby (slow, low melody), high = drums and a walking bass
function schedule(s, t, e, spb) {
  const bar = Math.floor(s / 8) % 4;
  const beat = s % 8;
  const root = PROG[bar];
  const chord = [0, MINOR.has(root) ? 3 : 4, 7];
  const bus = g.music;
  if (beat === 0) chord.forEach((c) => tone(hz(root + 12 + c), t, spb * 8.5, 'sine', 0.045, bus, 0.25));
  if (beat === 0 || beat === 4) tone(hz(root - 12), t, spb * 1.8, 'triangle', 0.16, bus);
  if (e > 0.6 && beat === 6) tone(hz(root - 5), t, spb * 0.9, 'triangle', 0.11, bus);
  if (e > 0.45 && (beat === 0 || beat === 4)) kick(t);
  if (e > 0.7 && beat % 2 === 1) hat(t, 0.035);
  const sleepy = e < 0.3;
  const chance = sleepy ? (beat % 4 === 0 ? 0.7 : 0) : 0.25 + 0.5 * e;
  if (Math.random() < chance) {
    const steps = [];
    for (let o = 0; o < 2; o++) PENTA.forEach((p) => steps.push(72 + o * 12 + p));
    let i = steps.indexOf(melo);
    if (i < 0) i = 4;
    i = Math.max(0, Math.min(steps.length - 1, i + Math.floor(Math.random() * 5) - 2));
    melo = steps[i];
    tone(hz(sleepy ? melo - 12 : melo), t, sleepy ? 0.9 : 0.28, 'triangle', sleepy ? 0.06 : 0.075, bus, 0.008);
  }
}

function tick() {
  try {
    if (!A || !g || !musicOn || A.state !== 'running') return;
    const e = mode.frozen || !mode.live ? 0.1 : mode.energy;
    const spb = 60 / (88 + 26 * e) / 2; // eighth notes; faster when Rex zooms
    const now = A.currentTime;
    g.lp.frequency.setTargetAtTime(mode.frozen ? 500 : 900 + 3200 * e, now, 0.3);
    g.music.gain.setTargetAtTime(mix.music ? (mode.live ? 0.55 : 0.15) : 0, now, 0.3);
    if (next < now - 0.5) next = now + 0.1; // tab was asleep: do not replay the missed notes
    while (next < now + 0.12) { schedule(step, next, e, spb); next += spb; step++; }
  } catch { /* audio unavailable */ }
}

export function startMusic() {
  try {
    if (!A || !g || musicOn) return;
    if (A.state === 'suspended') A.resume().catch(() => {});
    musicOn = true;
    next = A.currentTime + 0.1; step = 0;
    if (!timer) timer = setInterval(tick, 25);
  } catch { /* audio unavailable */ }
}

export function stopMusic() {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    musicOn = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (A && g) g.music.gain.setTargetAtTime(0, A.currentTime, 0.2);
  } catch { /* audio unavailable */ }
}

/** energy: 0..1 (how fast Rex goes); frozen: freeze frame; live (default true): false when paused. */
export function setMusicMode(m = {}) {
  mode = {
    energy: Number.isFinite(m.energy) ? Math.min(1, Math.max(0, m.energy)) : mode.energy,
    frozen: !!m.frozen,
    live: m.live !== false,
  };
}

/** kind: burp | bigburp | chime | bleh | freeze | ding | hint */
export function playSfx(kind) {
  try {
    if (!mix.sfx || !A || !g || A.state !== 'running') return;
    const t = A.currentTime + 0.01;
    const bus = g.sfx;
    if (kind === 'burp' || kind === 'bigburp') { // low saw that wobbles, through a soft filter
      const big = kind === 'bigburp';
      const o = A.createOscillator();
      const f = A.createBiquadFilter();
      const gn = A.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 520;
      const pts = big ? [120, 82, 104, 70, 92, 60] : [115, 85, 98, 72];
      pts.forEach((p, i) => o.frequency.linearRampToValueAtTime(p, t + i * 0.07));
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(big ? 0.42 : 0.3, t + 0.03);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + pts.length * 0.07 + 0.08);
      o.connect(f); f.connect(gn); gn.connect(bus); o.start(t); o.stop(t + pts.length * 0.07 + 0.1);
    } else if (kind === 'chime') {
      [84, 88, 91, 96].forEach((m, i) => tone(hz(m), t + i * 0.07, 0.4, 'sine', 0.09, bus));
    } else if (kind === 'ding') {
      tone(hz(91), t, 0.5, 'sine', 0.08, bus);
    } else if (kind === 'bleh') {
      const o = tone(330, t, 0.45, 'square', 0.05, bus);
      o.frequency.linearRampToValueAtTime(140, t + 0.4);
    } else if (kind === 'freeze') {
      const o = tone(700, t, 0.6, 'sine', 0.07, bus, 0.05);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    } else if (kind === 'hint') {
      [79, 84].forEach((m, i) => tone(hz(m), t + i * 0.12, 0.35, 'sine', 0.06, bus));
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
}

// Voice (stand-in: the browser voice; the app would use recorded lines)
export function say(text) {
  try {
    if (!mix.voice || typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    const clean = String(text).replace(/[^\w\s!?.,'-]/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1; u.pitch = 1.3; u.volume = 0.8;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* voice unavailable */ }
}
