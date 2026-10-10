/* SPDX-License-Identifier: AGPL-3.0-or-later */
// FOCUS BALL — Mendi-style fNIRS neurofeedback game with a shared Session Report.
// Ball height follows the forehead oxygenation index (dHbO - dHbR) from the Muse S Athena.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFnirs } from '../../hooks/useFnirs.js';
import { computeSessionMetrics } from '../../lib/sessionMetrics.js';
import { recordSession, loadSessions, isCheckInDue } from '../../lib/sessionStore.js';
import { GameStartPanel, OptionLabel, startChip } from '../../components/GameStartPanel.jsx';
import { SessionReport } from '../../components/SessionReport.jsx';
import '../../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };
const GOAL = 0.62;
const REST = 0.3;
const START_SCALE = 0.35; // µM of oxygenation index that moves the ball from rest to the top
const BEST_KEY = 'brainarcade.focusBall.best';
const LENGTHS = [2, 3, 5, 10];
const CUES = ['Count back by 3s', 'Stay calm and focused'];
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const saveBest = (v) => {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // ignore (private mode)
  }
};
// Soft drone that rises with the ball + chimes when the streak multiplier grows
function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  let suspendTimer = 0;
  const master = ctx.createGain();
  master.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;
  filter.connect(master).connect(ctx.destination);
  const oscs = [1, 1.5, 2.002].map((ratio) => {
    const o = ctx.createOscillator();
    o.type = ratio === 1 ? 'sine' : 'triangle';
    const g = ctx.createGain();
    g.gain.value = ratio === 1 ? 0.6 : 0.18;
    o.connect(g).connect(filter);
    o.start();
    return { o, ratio };
  });
  return {
    ctx,
    set(height, muted) {
      const t = ctx.currentTime;
      const base = 110 * 2 ** (height * 1.5);
      oscs.forEach(({ o, ratio }) => o.frequency.setTargetAtTime(base * ratio, t, 0.25));
      filter.frequency.setTargetAtTime(400 + height * 2400, t, 0.3);
      master.gain.setTargetAtTime(muted ? 0 : 0.05 + height * 0.07, t, 0.3);
    },
    tick(muted) {
      if (muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 440;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.3);
    },
    chime(muted, step = 0) {
      if (muted) return;
      const t = ctx.currentTime;
      [0, 2].forEach((offset, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = PENTATONIC[(step + offset) % PENTATONIC.length];
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 1.2);
        o.connect(g).connect(ctx.destination);
        o.start(t + i * 0.09);
        o.stop(t + i * 0.09 + 1.3);
      });
    },
    resume() {
      clearTimeout(suspendTimer);
      ctx.resume().catch(() => {});
    },
    suspend() {
      clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => ctx.suspend().catch(() => {}), 400); // let the drone fade out first
    },
    close() {
      clearTimeout(suspendTimer);
      ctx.close().catch(() => {});
    },
  };
}

const SCROLL_PX_S = 60; // world scroll speed (css px/s)
const STAR_LIFE = 6; // seconds a spawned star stays visible
const BRAIN = ['01100110', '11011011', '11111111', '11011011', '11111111', '01111110', '00011000'];
const STAR_GLYPH = ['00100', '01110', '11111', '01110', '01010'];
const CLOUD = [[2, 0, 3, 1], [1, 1, 5, 1], [0, 2, 8, 2]];

// v (0..1) -> screen y: v=0 near bottom (85%), v=1 near top (15%)
const ballScreenY = (lift, h) => h * (0.85 - lift * 0.55); // top stays at 30% so the ball never hides under the HUD

function offscreen(size) {
  const o = document.createElement('canvas');
  o.width = Math.max(1, Math.ceil(size));
  o.height = o.width;
  return o;
}

// Pre-rendered glows (rebuilt on resize); drawn scaled instead of creating gradients every frame.
function buildFx(w, h, dpr) {
  const r = 15 * dpr;
  const rb = r * 3.4;
  const halo = (col) => {
    const o = offscreen(2 * rb);
    const g = o.getContext('2d');
    const cx = o.width / 2;
    const gr = g.createRadialGradient(cx, cx, r * 0.4, cx, cx, cx);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(210,235,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, o.width, o.height);
    return o;
  };
  const refBr = 0.2 * Math.min(w, h);
  const glow = offscreen(2 * refBr * 1.8);
  const gg = glow.getContext('2d');
  const gc = glow.width / 2;
  const gr = gg.createRadialGradient(gc, gc, refBr * 0.5, gc, gc, refBr * 1.8);
  gr.addColorStop(0, 'rgba(160,220,255,0.35)');
  gr.addColorStop(1, 'rgba(160,220,255,0)');
  gg.fillStyle = gr;
  gg.fillRect(0, 0, glow.width, glow.height);
  return { haloOn: halo('rgba(210,235,255,0.5)'), haloOff: halo('rgba(150,150,170,0.35)'), glow, refBr };
}

// Two looks, picked from the local clock when the game opens (day 7:00-19:00).
// Colour strings are cached here (no per-frame string building).
const skyBands = (a, b) => Array.from({ length: 8 }, (_, k) => rgb(mix(a, b, k / 7)));
const THEMES = {
  night: {
    sky: skyBands([43, 58, 77], [61, 74, 92]),
    stars: true,
    moon: true,
    cloud: 'rgba(150,165,190,0.28)',
    mountain: 'rgb(31,41,58)',
    snow: 'rgba(200,210,230,0.45)',
    hills: 'rgb(22,30,44)',
    hillTop: 'rgb(30,42,58)',
    flowers: null,
    trail: Array.from({ length: 20 }, (_, i) => `rgba(255,255,255,${(i / 19).toFixed(3)})`),
    goal: 'rgba(255,255,255,0.22)',
  },
  day: {
    sky: skyBands([92, 164, 230], [196, 228, 246]),
    sun: true,
    cloud: 'rgba(255,255,255,0.9)',
    mountain: 'rgb(124,146,178)',
    snow: 'rgb(245,248,255)',
    hills: 'rgb(86,160,82)',
    hillTop: 'rgb(122,190,96)',
    flowers: ['rgb(255,236,110)', 'rgb(255,255,255)', 'rgb(240,120,160)', 'rgb(170,140,240)'],
    trail: Array.from({ length: 20 }, (_, i) => `rgba(255,255,255,${(0.35 + (0.65 * i) / 19).toFixed(3)})`),
    trailEdge: 'rgba(30,50,80,0.55)',
    goal: 'rgba(30,40,60,0.35)',
  },
};
const sceneTheme = () => {
  const hr = new Date().getHours();
  return hr >= 7 && hr < 19 ? THEMES.day : THEMES.night;
};
// Triangle wave 0..1..0 (sharp pixel mountain peaks)
const tri = (x) => 1 - 2 * Math.abs((x - Math.floor(x)) - 0.5);
const STAR_ALPHA = Array.from({ length: 16 }, (_, i) => `rgba(255,255,255,${(0.15 + (0.65 * i) / 15).toFixed(3)})`);
const GOLD_ALPHA = Array.from({ length: 20 }, (_, i) => `rgba(255,216,74,${(i / 19).toFixed(3)})`);
const plateauCache = new Map();
function plateauStyle(v) {
  const q = Math.round(clamp(v, 0, 1) * 32);
  let e = plateauCache.get(q);
  if (!e) {
    const vq = q / 32;
    e = {
      bands: Array.from({ length: 4 }, (_, k) => rgb(plateauColor(vq, (k + 0.5) / 4))),
      top: rgb(mix(plateauColor(vq, 0), [255, 255, 255], 0.35)),
    };
    plateauCache.set(q, e);
  }
  return e;
}

function makeScene(w, h, dpr) {
  const rand = (a, b) => a + Math.random() * (b - a);
  return {
    dpr,
    theme: sceneTheme(),
    fx: buildFx(w, h, dpr),
    stars: Array.from({ length: 60 }, () => ({ x: Math.floor(rand(0, w)), y: Math.floor(rand(0, h * 0.6)), big: Math.random() < 0.2, p: rand(0, 6.28) })),
    clouds: [
      { x: rand(0, w), y: h * 0.14, u: 7, v: 6 },
      { x: rand(0, w), y: h * 0.3, u: 5, v: 4 },
      { x: rand(0, w), y: h * 0.22, u: 9, v: 3 },
    ],
  };
}

// Chunky filled disc built from square blocks (pixel look)
function pixelDisc(c, cx, cy, r, px) {
  for (let j = -r; j <= r; j += px) {
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - j * j)) / px) * px;
    c.fillRect(Math.round(cx - hw), Math.round(cy + j - px / 2), Math.round(2 * hw), px);
  }
}

function drawBitmap(c, rows, x, y, px) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i += 1) if (row[i] === '1') c.fillRect(Math.round(x + i * px), Math.round(y + j * px), px, px);
  });
}

// Eased ball height at world x (hist is ordered by x)
function surfaceY(hist, wx) {
  const last = hist.length - 1;
  if (wx >= hist[last].x) return hist[last].y;
  if (wx <= hist[0].x) return hist[0].y;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (hist[mid].x <= wx) lo = mid;
    else hi = mid;
  }
  return hist[lo].y;
}

// Plateau colour: cool teal/green when low, warm yellow-green/orange/red when high
const COOL = [[43, 179, 192], [143, 227, 160]];
const WARM = [[200, 216, 106], [242, 163, 58], [224, 87, 79]];
function plateauColor(v, f) {
  const cool = mix(COOL[0], COOL[1], f);
  const warm = f < 0.5 ? mix(WARM[0], WARM[1], f * 2) : mix(WARM[1], WARM[2], (f - 0.5) * 2);
  return mix(cool, warm, clamp((v - 0.35) / 0.4, 0, 1));
}

function draw(c, scene, s, t) {
  const { width: w, height: h } = c.canvas;
  const dpr = scene.dpr;
  c.imageSmoothingEnabled = false;
  const step = 4 * dpr;
  const lift = s.ballY;
  const worldX = s.worldX || 0;
  const hist = s.hist || [{ x: 0, y: lift }];
  const bx = Math.round(w / 2);
  const by = Math.round(ballScreenY(lift, h));

  const th = scene.theme;
  // Sky (calm, banded)
  const bands = 8;
  for (let k = 0; k < bands; k += 1) {
    c.fillStyle = th.sky[k];
    c.fillRect(0, Math.floor((k * h) / bands), w, Math.ceil(h / bands) + 1);
  }
  if (th.stars) {
    scene.stars.forEach((st) => {
      c.fillStyle = STAR_ALPHA[Math.round(Math.sin(t * 1.5 + st.p) ** 2 * 15)];
      const z = (st.big ? 3 : 2) * dpr;
      c.fillRect(st.x, st.y, z, z);
    });
  }
  if (th.moon) {
    // Faint moon, partly off the right edge
    c.fillStyle = 'rgba(225,230,200,0.2)';
    pixelDisc(c, w - 8 * dpr, h * 0.2, 40 * dpr, 4 * dpr);
    c.fillStyle = 'rgba(120,130,110,0.18)';
    c.fillRect(w - 40 * dpr, h * 0.2 - 12 * dpr, 8 * dpr, 8 * dpr);
    c.fillRect(w - 28 * dpr, h * 0.2 + 8 * dpr, 4 * dpr, 4 * dpr);
  }
  if (th.sun) {
    // Pixel sun with a soft rim, upper right (clear of the HUD)
    c.fillStyle = 'rgba(255,240,170,0.45)';
    pixelDisc(c, w * 0.82, h * 0.24, 34 * dpr, 4 * dpr);
    c.fillStyle = 'rgb(255,226,110)';
    pixelDisc(c, w * 0.82, h * 0.24, 24 * dpr, 4 * dpr);
  }

  // Clouds (drift slowly)
  scene.clouds.forEach((cl) => {
    const u = cl.u * dpr;
    const span = w + 16 * u;
    const x = ((((cl.x + t * cl.v * dpr - worldX * 0.1 * dpr) % span) + span) % span) - 8 * u;
    c.fillStyle = th.cloud;
    CLOUD.forEach(([dx, dy, cw, ch]) => c.fillRect(Math.round(x + dx * u), Math.round(cl.y + dy * u), cw * u, ch * u));
  });

  // Snowy mountains, far away (0.1x scroll): sharp pixel peaks, white caps
  const ms = 6 * dpr;
  const moff = ((worldX * 0.1) % 6) * dpr;
  const snowLine = h * 0.4;
  for (let x = -moff; x < w; x += ms) {
    const wx = Math.floor((x / dpr + worldX * 0.1) / 6) * 6;
    const peak = Math.max(tri(wx / 300), 0.75 * tri(wx / 190 + 0.35));
    const y = Math.round((h * 0.56 - h * 0.34 * peak) / ms) * ms;
    c.fillStyle = th.mountain;
    c.fillRect(Math.round(x), y, ms + 1, h - y);
    if (y < snowLine) {
      c.fillStyle = th.snow;
      c.fillRect(Math.round(x), y, ms + 1, Math.min(3 * ms, Math.round(((snowLine - y) * 0.45) / ms) * ms + ms));
    }
  }

  // Rolling hills / meadow (0.3x scroll), lighter grass edge and a few flowers by day
  const hs = 6 * dpr;
  const off = ((worldX * 0.3) % 6) * dpr;
  for (let x = -off; x < w; x += hs) {
    const wx = Math.floor((x / dpr + worldX * 0.3) / 6) * 6;
    const y = Math.round((h * 0.6 + Math.sin(wx * 0.004) * h * 0.06 + Math.sin(wx * 0.011 + 1) * h * 0.03) / hs) * hs;
    c.fillStyle = th.hills;
    c.fillRect(Math.round(x), y, hs + 1, h - y);
    c.fillStyle = th.hillTop;
    c.fillRect(Math.round(x), y, hs + 1, hs);
    if (th.flowers) {
      const k = ((wx * 7919) % 97 + 97) % 97; // stable per world column
      if (k < 14) {
        c.fillStyle = th.flowers[k % th.flowers.length];
        c.fillRect(Math.round(x + hs / 4), y + hs * (2 + (k % 5)), Math.round(3 * dpr), Math.round(3 * dpr));
      }
    }
  }

  // Past: only a fading white trail line (the scenery stays visible below it)
  let prevY = null;
  for (let wc = Math.floor(worldX / 4) * 4; ; wc -= 4) {
    const sx = Math.round(bx - (worldX - wc) * dpr);
    if (sx < -step) break;
    const y = Math.round(ballScreenY(surfaceY(hist, wc), h) / step) * step;
    const a = clamp(1 - (bx - sx) / bx, 0.05, 1);
    c.fillStyle = th.trail[Math.round(a * 19)];
    const top = prevY === null ? y : Math.min(y, prevY);
    const bot = prevY === null ? y : Math.max(y, prevY);
    if (th.trailEdge) {
      // dark edge under the white line so it reads on a bright sky
      const fill = c.fillStyle;
      c.fillStyle = th.trailEdge;
      c.fillRect(sx, top + 2 * dpr, step + 1, bot - top + 2 * dpr);
      c.fillStyle = fill;
    }
    c.fillRect(sx, top - dpr, step + 1, bot - top + 3 * dpr);
    prevY = y;
  }

  // Present: plateau (flat top at ball height, steep stepped slope down-left), banded gradient
  const slopeX = bx - Math.round((0.04 * w) / step) * step;
  c.save();
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(w, by);
  c.lineTo(w, h);
  c.lineTo(slopeX, h);
  for (let xi = slopeX; xi < bx; xi += step) {
    const ey = Math.round((by + ((h - by) * (bx - (xi + step))) / (bx - slopeX)) / step) * step;
    c.lineTo(xi, ey);
    c.lineTo(xi + step, ey);
  }
  c.closePath();
  c.clip();
  const nb = 4;
  const bh = (h - by) / nb;
  const pl = plateauStyle(lift);
  for (let k = 0; k < nb; k += 1) {
    c.fillStyle = pl.bands[k];
    c.fillRect(slopeX - 1, Math.round(by + k * bh), w - slopeX + 2, Math.ceil(bh) + 1);
  }
  c.fillStyle = pl.top;
  c.fillRect(slopeX - 1, by, w - slopeX + 2, Math.round(3 * dpr));
  c.restore();

  // Goal line (faint)
  c.fillStyle = th.goal;
  c.fillRect(0, Math.round(ballScreenY(GOAL, h)), w, Math.max(1, Math.round(1.5 * dpr)));

  // Stars earned (attached to world x, sitting on the terrain surface)
  (s.stars || []).forEach((st) => {
    const age = s.elapsed - st.born;
    const sx = bx - (worldX - st.wx) * dpr;
    const spx = 5 * dpr;
    const sy = ballScreenY(surfaceY(hist, st.wx), h) - 5 * spx - 4 * dpr - Math.sin(t * 4 + st.wx) * dpr;
    c.fillStyle = GOLD_ALPHA[Math.round(clamp(1 - age / STAR_LIFE, 0, 1) * 19)];
    drawBitmap(c, STAR_GLYPH, sx - 2.5 * spx, sy, spx);
  });

  const pulse = 1 + Math.sin(t * 3) * 0.05;
  if (s.breath !== undefined && s.breath >= 0) {
    // Calibration: breathing pixel circle
    const m = Math.min(w, h);
    const br = lerp(0.1, 0.2, s.breath) * m;
    const cy = h * 0.4;
    c.globalCompositeOperation = 'lighter';
    const gsz = scene.fx.glow.width * (br / scene.fx.refBr);
    c.drawImage(scene.fx.glow, bx - gsz / 2, cy - gsz / 2, gsz, gsz);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgb(120,170,210)';
    pixelDisc(c, bx, cy, br + 9 * dpr, 6 * dpr);
    c.fillStyle = 'rgb(235,245,255)';
    pixelDisc(c, bx, cy, br, 6 * dpr);
    return;
  }

  // Ball: white glowing pixel orb, chunky outline, brain glyph
  const r = 15 * dpr;
  const px = 3 * dpr;
  c.globalCompositeOperation = 'lighter';
  const halo = s.paused ? scene.fx.haloOff : scene.fx.haloOn;
  const hsz = halo.width * pulse;
  c.drawImage(halo, bx - hsz / 2, by - hsz / 2, hsz, hsz);
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = s.paused ? 'rgb(110,115,130)' : 'rgb(110,150,205)';
  pixelDisc(c, bx, by, r + px, px);
  c.fillStyle = s.paused ? 'rgb(190,192,200)' : 'rgb(255,255,255)';
  pixelDisc(c, bx, by, r, px);
  c.fillStyle = 'rgb(120,140,190)';
  drawBitmap(c, BRAIN, bx - 8 * dpr, by - 7 * dpr, 2 * dpr);
}

export function FocusBall() {
  const { supported, data, resetBaseline } = useFnirs();
  const [phase, setPhase] = useState('intro'); // intro | calibrate | countdown | play | report
  const [cue, setCue] = useState(CUES[0]);
  const [session, setSession] = useState(null); // settings of the running session (check-in overrides never touch the menu settings)
  const [minutes, setMinutes] = useState(3);
  const [hud, setHud] = useState({ points: 0, timeLeft: 180, mult: 1, paused: false, progress: 0, activity: 0, goalSec: 0, hint: 'still' });
  const [count, setCount] = useState(3);
  const [breathLabel, setBreathLabel] = useState('BREATHE IN');
  const calStartRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(readBest);
  const [report, setReport] = useState(null);

  const canvasRef = useRef(null);
  const dataRef = useRef(null);
  const mutedRef = useRef(muted);
  const phaseRef = useRef(phase);
  const audioRef = useRef(null);
  const stateRef = useRef(null);
  const checkInDue = useMemo(() => phase === 'intro' && isCheckInDue(loadSessions()), [phase]);
  const sessionRef = useRef({ cue, minutes, checkIn: false });
  const sawResetRef = useRef(false);

  dataRef.current = data;
  mutedRef.current = muted;
  phaseRef.current = phase;

  // Calibration done -> play. Wait for a fresh not-ready snapshot (old ones still say "ready").
  useEffect(() => {
    if (phase !== 'calibrate' || !data) return;
    if (!data.baselineReady) sawResetRef.current = true;
    else if (sawResetRef.current) {
      const durationSec = sessionRef.current.minutes * 60;
      stateRef.current = {
        ballY: REST, scale: START_SCALE, points: 0, streakSec: 0, mult: 1, elapsed: 0, durationSec,
        above: false, paused: false, done: false, samples: [], sampleAcc: 0, chimeStep: 0, ptsAcc: 0,
        worldX: 0, hist: [{ x: -2000, y: REST }, { x: 0, y: REST }], stars: [], aboveSec: 0, starAcc: 1.5, goalSec: 0, activity: 0,
      };
      setHud({ points: 0, timeLeft: durationSec, mult: 1, paused: false, progress: 0, activity: 0, goalSec: 0, hint: 'still' });
      setCount(3);
      setPhase('countdown');
    }
  }, [phase, data]);

  // Calibration: breathing label (4 s in / 4 s out)
  useEffect(() => {
    if (phase !== 'calibrate') return undefined;
    const id = setInterval(() => setBreathLabel(((performance.now() - calStartRef.current) / 1000) % 8 < 4 ? 'BREATHE IN' : 'BREATHE OUT'), 250);
    return () => clearInterval(id);
  }, [phase]);

  // 3-2-1 countdown (1 s each, soft tick) before the world starts scrolling
  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    let n = 3;
    audioRef.current?.tick(mutedRef.current);
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        audioRef.current?.chime(mutedRef.current, 0);
        setPhase('play');
        return;
      }
      setCount(n);
      audioRef.current?.tick(mutedRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Game loop (timer) + drawing (rAF)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const c = canvas.getContext('2d');
    let scene = null;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      scene = makeScene(canvas.width, canvas.height, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    // Re-run resize when the device pixel ratio changes (zoom, moving between monitors)
    let mq = null;
    const onDprChange = () => {
      resize();
      bindDpr();
    };
    const bindDpr = () => {
      mq?.removeEventListener('change', onDprChange);
      mq = window.matchMedia ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`) : null;
      mq?.addEventListener('change', onDprChange);
    };
    bindDpr();

    const idle = { ballY: REST, above: false, paused: false };
    let lastTick = performance.now();
    let hudTick = 0;
    const finish = (s) => {
      if (s.done) return;
      s.done = true;
      audioRef.current?.set(0, true);
      audioRef.current?.suspend();
      const { cue: usedCue, minutes: mins, checkIn: isCheckIn } = sessionRef.current;
      const metrics = computeSessionMetrics(s.samples, { goal: GOAL, durationSec: s.durationSec });
      if (metrics.okSec < 0.3 * s.durationSec) {
        // Too little usable signal: nothing saved, no score, not counted toward best
        setReport({ insufficient: true });
        setPhase('report');
        return;
      }
      const points = Math.round(s.points);
      const prevBest = readBest();
      const isNewBest = metrics.score > prevBest;
      if (isNewBest) {
        saveBest(metrics.score);
        setBest(metrics.score);
      }
      const id = recordSession('focus-ball', { durationSec: mins * 60, playedSec: Math.round(s.elapsed), cue: usedCue, points, ...metrics, ...(isCheckIn ? { checkIn: true } : {}) });
      setReport({ metrics, points, isNewBest, samples: s.samples, id });
      setPhase('report');
    };
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - lastTick) / 1000);
      lastTick = now;
      const s = stateRef.current;
      if (phaseRef.current !== 'play' || !s || s.done) {
        idle.ballY = REST + Math.sin(now / 1250) * 0.03;
        if (phaseRef.current === 'calibrate') {
          const cyc = ((now - calStartRef.current) / 1000) % 8; // 4 s in, 4 s out
          const p = cyc < 4 ? cyc / 4 : 1 - (cyc - 4) / 4;
          idle.breath = p * p * (3 - 2 * p);
        } else idle.breath = -1;
        return;
      }
      const d = dataRef.current;
      const q = [d?.left?.quality, d?.right?.quality];
      const lost = !d || !d.available || !d.baselineReady || q.includes('no-light');
      s.paused = lost || q.some((x) => x === 'motion' || x === 'saturated');
      s.hint = lost ? 'headband' : 'still';
      const oxy = Number.isFinite(d?.oxy) ? d.oxy : 0;
      if (!s.paused) s.scale = Math.max(s.scale, oxy * 0.9); // grows on upswings only, never shrinks
      const target = s.paused ? s.ballY : clamp(REST + 0.7 * (oxy / s.scale), 0.03, 0.97);
      s.ballY = lerp(s.ballY, target, 1 - Math.exp(-dt * 1.2)); // ~1 s easing
      s.above = !s.paused && s.ballY >= GOAL;
      // Scaled game value (oxygenation index relative to the player's own range), not a medical measurement.
      if (!s.paused) s.activity = (oxy / s.scale) * 100;

      // Side-scrolling world: constant scroll, paused while signal quality is bad
      if (!s.paused) {
        s.worldX += SCROLL_PX_S * dt;
        s.hist.push({ x: s.worldX, y: s.ballY });
      } else s.hist[s.hist.length - 1].y = s.ballY;
      const keep = (canvasRef.current?.clientWidth || 1600) / 2 + 100;
      while (s.hist.length > 2 && s.worldX - s.hist[1].x > keep) s.hist.shift();

      if (!s.paused) {
        s.elapsed += dt;
        if (s.above) {
          s.goalSec += dt;
          s.aboveSec += dt;
          if (s.aboveSec > 1) {
            s.starAcc += dt;
            if (s.starAcc >= 1.5) {
              s.starAcc = 0;
              s.stars.push({ wx: s.worldX - 28, born: s.elapsed });
              audioRef.current?.chime(mutedRef.current, ++s.chimeStep);
            }
          }
        } else {
          s.aboveSec = 0;
          s.starAcc = 1.5;
        }
        if (s.stars.length) s.stars = s.stars.filter((st) => s.elapsed - st.born < STAR_LIFE);
        if (s.above) {
          s.streakSec += dt;
          const mult = Math.min(5, 1 + Math.floor(s.streakSec / 10));
          if (mult > s.mult) audioRef.current?.chime(mutedRef.current, ++s.chimeStep);
          s.mult = mult;
          s.ptsAcc += dt;
          while (s.ptsAcc >= 1) {
            s.ptsAcc -= 1;
            s.points += s.mult;
          }
        } else {
          s.streakSec = 0; // streak resets when the ball is below the line (not on bad quality)
          s.mult = 1;
        }
        s.sampleAcc += dt;
      }
      if (s.sampleAcc >= 0.25) {
        s.sampleAcc = 0;
        s.samples.push({ t: s.elapsed, v: s.ballY, ok: !s.paused });
      }
      audioRef.current?.set(s.ballY, mutedRef.current || s.paused);
      if ((hudTick += dt) > 0.25) {
        hudTick = 0;
        const next = {
          points: Math.round(s.points),
          timeLeft: Math.max(0, Math.ceil(s.durationSec - s.elapsed)),
          mult: s.mult,
          paused: s.paused,
          progress: Math.round(clamp(s.elapsed / s.durationSec, 0, 1) * 100) / 100,
          activity: Math.round(s.activity * 10) / 10,
          goalSec: Math.floor(s.goalSec),
          hint: s.hint,
        };
        setHud((prev) => (Object.keys(next).every((k) => prev[k] === next[k]) ? prev : next));
      }
      if (s.elapsed >= s.durationSec) finish(s);
    };
    const timer = setInterval(tick, 33);

    let raf;
    const frame = (now) => {
      const live = (phaseRef.current === 'play' || phaseRef.current === 'countdown') && stateRef.current;
      draw(c, scene, live ? stateRef.current : idle, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      mq?.removeEventListener('change', onDprChange);
    };
  }, []);

  // Silence the drone whenever we are back on the menu / report
  useEffect(() => {
    if (phase === 'intro' || phase === 'report') audioRef.current?.suspend();
  }, [phase]);

  useEffect(() => () => audioRef.current?.close(), []);

  const begin = () => {
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current?.resume();
    resetBaseline();
    sawResetRef.current = false;
    calStartRef.current = performance.now();
    setBreathLabel('BREATHE IN');
    setPhase('calibrate');
  };

  // Check-in values apply to this session only; the menu settings (cue/minutes) are left alone.
  const startWith = (next) => {
    sessionRef.current = next;
    setSession(next);
    begin();
  };
  const startCheckIn = () => startWith({ cue: CUES[1], minutes: 2, checkIn: true });
  const startNormal = () => startWith({ cue, minutes, checkIn: false });
  const stop = () => {
    stateRef.current = null; // abandon without saving
    audioRef.current?.set(0, true);
    setPhase('intro');
  };

  const panel = 'border-4 border-[var(--nes-yellow)] bg-black/75 px-6 py-5 text-center text-white max-w-lg';
  const btn = 'border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black';

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={FONT}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div>
          <h2 className="text-2xl text-[var(--nes-yellow)] [text-shadow:2px_2px_0_#000]">FOCUS BALL</h2>
          {phase === 'play' && <p className="text-xs text-white mt-2 [text-shadow:1px_1px_0_#000]">{session?.cue}</p>}
        </div>
      </div>

      {phase === 'play' && (
        <>
          {/* Session progress bar (thin, pixel) */}
          <div className="absolute top-0 inset-x-0 h-2 bg-black/60 border-b-2 border-white/30 pointer-events-none">
            <div className="h-full bg-[var(--nes-yellow)] transition-all duration-300" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </div>
          {/* HUD row: centered, below the title row / top-right badges */}
          <div className="absolute top-4 phone-port:top-20 left-1/2 -translate-x-1/2 short-land:left-52 short-land:translate-x-0 short-land:gap-3 short-land:px-3 flex items-center gap-5 border-2 border-white/40 bg-black/55 px-4 py-2 text-xs text-white pointer-events-none whitespace-nowrap">
            <span>↗ <span className="text-[var(--nes-green)]">{hud.activity >= 0 ? '+' : ''}{Math.round(hud.activity)}%</span></span>
            <span>★ <span className="text-[var(--nes-yellow)]">{Math.floor(hud.goalSec)}s</span></span>
            <span>
              ⚡ <span className="text-[var(--nes-yellow)]">{Math.round(hud.points)}</span>
              {hud.mult > 1 && <span className="ml-1 text-[9px] text-[var(--nes-yellow)]">x{hud.mult}</span>}
            </span>
            <span className="text-[9px] text-gray-300">
              {Math.floor(hud.timeLeft / 60)}:{String(hud.timeLeft % 60).padStart(2, '0')}
            </span>
          </div>
          {/* Neural activity card (scaled game value, above SOUND button) */}
          <div className="absolute bottom-[4.5rem] right-6 flex items-center gap-3 border-4 border-[var(--nes-yellow)] bg-black/75 px-3 py-2 pointer-events-none">
            <svg width="24" height="21" viewBox="0 0 8 7" shapeRendering="crispEdges" aria-hidden="true">
              {BRAIN.flatMap((row, j) => [...row].map((ch, i) => (ch === '1' ? <rect key={`${i}-${j}`} x={i} y={j} width="1" height="1" fill="#ffd84a" /> : null)))}
            </svg>
            <div>
              <p className="text-[8px] text-gray-300">NEURAL ACTIVITY</p>
              <p className="text-sm text-[var(--nes-yellow)] mt-1">{hud.activity >= 0 ? '+' : ''}{hud.activity.toFixed(1)}%</p>
            </div>
          </div>
        </>
      )}

      {phase === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span aria-live="polite" className="text-8xl text-[var(--nes-yellow)]" style={{ textShadow: '6px 6px 0 #000' }}>{count}</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-6 right-6 border-2 border-white/60 bg-black/60 px-3 py-2 text-[10px] text-white"
      >
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>

      {(phase === 'calibrate' || phase === 'countdown' || phase === 'play') && (
        <button
          type="button"
          onClick={stop}
          className="absolute bottom-6 left-6 border-2 border-white/60 bg-black/60 px-3 py-2 text-[10px] text-white hover:bg-white hover:text-black"
        >
          STOP
        </button>
      )}

      <div aria-live="polite" className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
        {phase === 'play' && hud.paused && (
          <div className="border-2 border-[var(--nes-yellow)] bg-black/70 px-4 py-2 text-xs text-[var(--nes-yellow)] whitespace-nowrap">
            {hud.hint === 'headband' ? 'CHECK HEADBAND' : 'HOLD STILL'}
          </div>
        )}
      </div>

      {phase === 'intro' && (
        <GameStartPanel
          title="FOCUS BALL"
          onStart={supported ? startNormal : undefined}
          best={best}
          signalNote="Only the fNIRS sensors matter here."
        >
          {!supported ? (
            <p className="text-xs leading-relaxed mb-3">This game needs a Muse S Athena (fNIRS light sensors).</p>
          ) : (
            <>
              {checkInDue && (
                <div className="border-4 border-[var(--nes-green)] bg-[var(--nes-green)]/15 px-3 py-3 mb-4">
                  <p className="text-xs text-[var(--nes-green)] mb-2">CHECK-IN DUE</p>
                  <p className="text-[9px] text-gray-200 leading-relaxed mb-3">A short re-test to see how your focus is growing.</p>
                  <button type="button" onClick={startCheckIn} className={btn}>Start check-in (2 min)</button>
                </div>
              )}
              <p className="text-sm leading-relaxed mb-3">Focus on the ball and keep it above the line.</p>
              <p className="text-[9px] text-gray-300 leading-relaxed mb-4">Your brain is slow to show change: wait 3-6 seconds.</p>
              <OptionLabel>PICK YOUR FOCUS TRICK</OptionLabel>
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {CUES.map((cc) => (
                  <button key={cc} type="button" className={startChip(cue === cc)} onClick={() => setCue(cc)}>{cc}</button>
                ))}
              </div>
              <OptionLabel>SESSION LENGTH</OptionLabel>
              <div className="flex gap-2 justify-center mb-5">
                {LENGTHS.map((m) => (
                  <button key={m} type="button" className={startChip(minutes === m)} onClick={() => setMinutes(m)}>{m} min</button>
                ))}
              </div>
            </>
          )}
        </GameStartPanel>
      )}

      <div className="absolute inset-0 flex items-center justify-center px-4 pt-24 pb-4 pointer-events-none">
        {phase === 'calibrate' && (
          <div className={`${panel} absolute bottom-24 left-1/2 -translate-x-1/2`}>
            <p className="text-sm text-[var(--nes-yellow)] mb-3">{breathLabel}</p>
            <div className="h-3 w-64 mx-auto border-2 border-[var(--nes-yellow)]">
              <div className="h-full bg-[var(--nes-yellow)]" style={{ width: `${Math.round((data?.baselineProgress || 0) * 100)}%` }} />
            </div>
            {!data?.available && <p className="text-[9px] text-gray-400 mt-3">Waiting for light sensors…</p>}
          </div>
        )}

        {phase === 'report' && report && (
          <div className="pointer-events-auto max-h-full w-full flex justify-center">
            <SessionReport
              metrics={report.metrics}
              points={report.points}
              bestScore={best}
              isNewBest={report.isNewBest}
              samples={report.samples}
              sessionId={report.id}
              insufficient={!!report.insufficient}
              onPlayAgain={() => setPhase('intro')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
