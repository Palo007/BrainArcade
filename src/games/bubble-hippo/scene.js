/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Bubble Hippo canvas art, ported from the playable mock-up. Draws only; the React game owns all logic.
// HiDPI is the caller's job: scale the context so drawing coordinates are W x H (800 x 380).
//
// `view` (plain object, built by the game each frame; every field optional, missing = off/zero):
//   phase     'baseline'|'warmup'|'calm'|'duck'|'answer'|'settle'|'break'|'result'
//             duck and answer show the duck-time look (ducks, "DUCK TIME" meter, no bubble); break = bath-break
//             overlay; result = round-done overlay; the rest show the calm look (hippo blows the bubble).
//   meter     0..1  calm meter level (smoothed here). Not drawn in duck time or when secret.
//   goal      0..1  goal line on the meter. Leave out (null) in baseline: no goal line, no calm face/fizz.
//   bubble    0..1  bubble size on the straw (smoothed here). Never pops; shrinks slowly.
//   secret    bool  foam hides ALL feedback: meter, bubble size, goal, calm face, cheek puff, shimmer halo,
//                   fizz, duck wobble. Face stays neutral.
//   breath    {on, k, inhale?}  green breathing ring; k 0..1 is the pacer wave. inhale is optional (else
//                   it follows whether k is rising). Ring is hidden while secret.
//   ducks     count of ducks popped so far this duck time. Each increase pops one duck up for 1.4 s
//             (the game plays the plink). Set back to 0 after duck time.
//   pests     array of 'fly'|'sock'|'swan' currently in the scene
//   hint      string  hint bubble above the hippo's head ('' = none)
//   gate      'ok'|'hint'|'hold'|'freeze'  small status pill, top left (omit = no pill)
//   msg       string  banner text (fades after msgSecs, default 2.5, when the text changes)
//   msgSecs   number  banner seconds
//   hudLines  [line1, line2]  small info box, top, left of the hippo (e.g. badge name and time)
//   breakText string  line under "BATH BREAK" (phase 'break')
//   resultLines  array of strings under "Round done!" (phase 'result'); stars are always 3
//   badge     0..5  badge index (Duckling..Hippo King); colours the dot in the HUD box
//   world     0..5  world id (Home Tub, Hot Spring, Mud Spa, Jungle Waterfall, Moon Bath, Remix): water tint
//   bathBomb  'banana'|'bubblegum'|'cheese'|'socks'|null  bath bomb: water tint + little floating bits
//   zoo       number  bubble friends collected (shelf shows the last 5, "?" for empty slots)
//   sleepy    bool  eyes closed, "o" mouth, "zZ"
//   fizz      bool  optional: force fizzy water + duck wobble; default = calm look, meter well below goal
//   paused    bool  paused overlay
import { t } from '../../lib/i18n.js';

export const W = 800;
export const H = 380;

const WATER = 270;
const HX = 300;
const HY = 262;
const TAU = Math.PI * 2;
const EMOJI = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const FD = '"Fredoka","Arial Rounded MT Bold",sans-serif';
const ATK = '"Atkinson Hyperlegible",sans-serif';
const PASS = ['🐸', '🦨', '🐟', '🐷', '🦆', '🐌', '🦥', '🐙'];
const BADGE_COLORS = ['#F6C85F', '#6CC7A0', '#C98B5B', '#8FA3B8', '#4F7FD1', '#9B7FD8'];
const WORLD_WATER = ['#A6DDEF', '#F2C9C0', '#C9A98A', '#9ADBC0', '#9AB0F0', '#C7B4F0'];
const BOMB_TINT = { banana: '#F7E58F', bubblegum: '#F7B2D0', cheese: '#F3D27A', socks: '#B9C4A0' };
const BOMB_BITS = { banana: '🍌', bubblegum: '🫧', cheese: '🧀', socks: '🧦' };

const rnd = (a, b) => a + Math.random() * (b - a);

let ctx = null; // set for the length of one drawScene call
let S = null; // the scene being drawn
let V = null; // the view being drawn

/** Visual/animation state only. */
export function createScene() {
  return {
    t: 0,
    shown: 0.45,
    bubbleShown: 0.15,
    ear: 0,
    flying: [],
    toots: [],
    spark: [],
    ducks: [],
    duckCount: 0,
    amb: Array.from({ length: 12 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(2, 6), v: rnd(6, 16), w: rnd(0, 6) })),
    bp: { x: HX + 150, y: HY - 130 }, // bubble centre, updated while drawing (launch + foam start here)
    tip: { x: HX - 8 + 128, y: HY - 64 - 18 }, // straw tip
    prevK: 0,
    inhale: true,
    prevPhase: '',
    lastMsg: '',
    msgT: 0,
    msgDur: 2.5,
    friendNo: 0,
    room: null,
    roomScale: 0,
  };
}

/** Bubble friend floats away. `friend` is an emoji string (optional; cycles through a default set). */
export function triggerLaunch(scene, friend) {
  const p = friend || PASS[(scene.friendNo++ + 3) % PASS.length];
  const bp = scene.bp;
  scene.flying.push({ x: bp.x, y: bp.y, r: 60, p, vy: -30, w: rnd(0, 6) });
  scene.ear = 1;
  for (let i = 0; i < 12; i++) {
    scene.spark.push({ x: bp.x + rnd(-40, 40), y: bp.y + rnd(-40, 40), vx: rnd(-40, 40), vy: rnd(-50, 0), life: rnd(0.8, 1.6), h: Math.random() < 0.3 });
  }
}

/** The small toot joke: a few bubbles rise from the water by the hippo's tail side. */
export function triggerToot(scene) {
  for (let i = 0; i < 10; i++) {
    scene.toots.push({ x: HX - 80 + rnd(-24, 24), y: WATER + rnd(0, 12), r: rnd(4, 11), vy: rnd(-55, -25), life: 1.9 });
  }
}

function animate(dt) {
  S.t += dt;
  if (S.ear > 0) S.ear = Math.max(0, S.ear - dt * 1.2);
  S.amb.forEach((b) => {
    b.y -= b.v * dt;
    b.w += dt;
    if (b.y < -10) { b.y = H + 10; b.x = rnd(0, W); }
  });
  S.flying.forEach((b) => { b.y += b.vy * dt; b.w += dt; });
  S.flying = S.flying.filter((b) => b.y > -90);
  S.toots.forEach((b) => { b.y += b.vy * dt; b.life -= dt; });
  S.toots = S.toots.filter((b) => b.life > 0);
  S.spark.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
  S.spark = S.spark.filter((p) => p.life > 0);
  S.ducks.forEach((d) => { d.life -= dt; });
  S.ducks = S.ducks.filter((d) => d.life > 0);
}

// ---------- helpers ----------
function soft(fn, lift) {
  ctx.save();
  ctx.shadowColor = 'rgba(70,52,120,.18)';
  ctx.shadowOffsetY = lift == null ? 3 : lift;
  ctx.shadowBlur = 6;
  fn();
  ctx.restore();
}
function fillE(x, y, a, b, fill, rot) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, a, b, rot || 0, 0, TAU); ctx.fill(); }
function rad(x, y, r, c0, c1) { const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function star(x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = i % 2 ? r * 0.32 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
function heart(x, y, s, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + s * 0.35); ctx.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s, x, y - s * 0.45); ctx.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.35, x, y + s * 0.35); ctx.fill(); }
function pill(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill(); }

// ---------- static room, painted once per pixel scale ----------
function paintRoom(c) {
  let g = c.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, '#F6E3EE'); g.addColorStop(1, '#EDE6F6'); c.fillStyle = g; c.fillRect(0, 0, W, 170);
  c.fillStyle = 'rgba(255,255,255,.55)'; // wallpaper: tiny stars and dots
  for (let y = 14; y < 160; y += 26) {
    for (let x = (y / 26 % 2) * 22 + 10; x < W; x += 44) {
      if ((x + y) % 3 === 0) { c.save(); c.translate(x, y); c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2; const r = i % 2 ? 1.6 : 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); c.restore(); }
      else { c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill(); }
    }
  }
  // window with the night sky and moon
  c.save(); c.shadowColor = 'rgba(70,52,120,.2)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(462, 22, 136, 128, [68, 68, 10, 10]); c.fill(); c.restore();
  g = c.createLinearGradient(0, 30, 0, 140); g.addColorStop(0, '#3E3C7E'); g.addColorStop(1, '#8E7CC6');
  c.fillStyle = g; c.beginPath(); c.roundRect(472, 32, 116, 108, [58, 58, 6, 6]); c.fill();
  c.fillStyle = 'rgba(255,243,196,.25)'; c.beginPath(); c.arc(548, 64, 26, 0, TAU); c.fill();
  c.fillStyle = '#FFF3C4'; c.beginPath(); c.arc(548, 64, 15, 0, TAU); c.fill();
  c.fillStyle = '#7266B4'; c.beginPath(); c.arc(555, 59, 13, 0, TAU); c.fill();
  c.fillStyle = '#FFF8DE'; [[492, 58, 1.6], [512, 44, 1.2], [500, 96, 1.4], [570, 112, 1.3], [528, 118, 1], [580, 86, 1.1], [488, 124, 1.2]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); });
  c.fillStyle = '#FFFFFF'; c.fillRect(528, 32, 4, 108); c.fillRect(472, 88, 116, 4);
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(454, 146, 152, 10, 5); c.fill();
  // curtains with scallops
  ['#F7B9CC', '#F7B9CC'].forEach((col, i) => {
    const x0 = i ? 590 : 446; const dir = i ? 1 : -1;
    c.fillStyle = col; c.beginPath(); c.moveTo(x0 - dir * 4, 16);
    c.quadraticCurveTo(x0 + dir * 22, 80, x0 + dir * 6, 150); c.lineTo(x0 + dir * 26, 150); c.quadraticCurveTo(x0 + dir * 34, 70, x0 + dir * 26, 16); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 30; y < 140; y += 18) { c.beginPath(); c.arc(x0 + dir * 17, y, 2, 0, TAU); c.fill(); }
  });
  c.fillStyle = '#E79BB3'; c.beginPath(); c.roundRect(436, 12, 188, 8, 4); c.fill();
  // towel on a hook
  c.fillStyle = '#C9A06A'; c.beginPath(); c.arc(640, 128, 5, 0, TAU); c.fill();
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(622, 130, 36, 62, 8); c.fill();
  c.fillStyle = '#9FD8C8'; [140, 156, 172].forEach((y) => c.fillRect(622, y, 36, 5));
  // tiles, with a soft shine on each
  c.fillStyle = '#F3C9D6'; c.fillRect(0, 166, W, 10);
  c.fillStyle = 'rgba(255,255,255,.7)'; for (let x = 8; x < W; x += 16) { c.beginPath(); c.arc(x, 171, 2, 0, TAU); c.fill(); }
  c.fillStyle = '#BFE2D8'; c.fillRect(0, 176, W, H - 176);
  for (let y = 178, row = 0; y < H; y += 34, row++) {
    for (let x = (row % 2) * -22; x < W; x += 44) {
      const tg = c.createLinearGradient(0, y, 0, y + 30); tg.addColorStop(0, '#D8F1EA'); tg.addColorStop(1, '#C7E9DF');
      c.fillStyle = tg; c.beginPath(); c.roundRect(x + 2, y + 2, 40, 30, 6); c.fill();
      c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.roundRect(x + 6, y + 5, 14, 4, 2); c.fill();
    }
  }
  // floor and bath mat
  c.fillStyle = '#EBD6C3'; c.fillRect(0, 352, W, 28);
  c.fillStyle = 'rgba(160,120,90,.18)'; for (let x = 0; x < W; x += 60) c.fillRect(x, 352, 2, 28);
  c.fillStyle = '#F7B9CC'; c.beginPath(); c.roundRect(560, 356, 130, 18, 9); c.fill();
  c.fillStyle = 'rgba(255,255,255,.6)'; for (let x = 570; x < 690; x += 12) { c.beginPath(); c.arc(x, 365, 2.2, 0, TAU); c.fill(); }
  // shelf (Bubble Zoo) and a little plant
  c.fillStyle = '#E5B98C'; c.beginPath(); c.roundRect(24, 96, 264, 12, 5); c.fill();
  c.fillStyle = '#D0A273'; c.fillRect(40, 108, 8, 14); c.fillRect(264, 108, 8, 14);
  c.fillStyle = '#F2A98E'; c.beginPath(); c.roundRect(258, 74, 24, 22, [3, 3, 8, 8]); c.fill();
  c.fillStyle = '#7CC8A0'; [[264, 66, -0.5], [276, 64, 0.5], [270, 58, 0]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, 5, 11, r, 0, TAU); c.fill(); });
  // warm glow from the window
  g = c.createRadialGradient(530, 90, 10, 530, 90, 320); g.addColorStop(0, 'rgba(255,240,210,.35)'); g.addColorStop(1, 'rgba(255,240,210,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

function drawRoom() {
  const scale = ctx.getTransform ? Math.max(1, Math.round(ctx.getTransform().a * 4) / 4) : 1;
  if (!S.room || S.roomScale !== scale) {
    S.room = null;
    S.roomScale = scale;
    try {
      if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = Math.round(W * scale);
        cv.height = Math.round(H * scale);
        const c = cv.getContext('2d');
        if (c) { c.setTransform(scale, 0, 0, scale, 0, 0); paintRoom(c); S.room = cv; }
      }
    } catch { S.room = null; }
  }
  if (S.room) ctx.drawImage(S.room, 0, 0, W, H);
  else paintRoom(ctx);
}

function zooShelf() {
  const n = Math.max(0, Math.floor(V.zoo || 0));
  ctx.font = '600 11px ' + FD; ctx.fillStyle = '#8C7A6A'; ctx.textAlign = 'left'; ctx.fillText(t('hippo.scene.zoo'), 30, 124);
  for (let i = 0; i < 5; i++) {
    const x = 34 + i * 44; const y = 52;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.roundRect(x, y + 6, 34, 38, [6, 6, 10, 10]); ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,200,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#D9A877'; ctx.beginPath(); ctx.roundRect(x + 5, y, 24, 8, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(x + 5, y + 14, 3, 20);
    const idx = n - 5 + i; // friend number, 0-based
    ctx.textAlign = 'center';
    if (idx >= 0) { ctx.font = '19px ' + EMOJI; ctx.fillStyle = '#26283B'; ctx.fillText(PASS[(idx + 3) % PASS.length], x + 17, y + 33); }
    else { ctx.font = '700 15px ' + FD; ctx.fillStyle = 'rgba(140,122,106,.5)'; ctx.fillText('?', x + 17, y + 31); }
  }
  ctx.textAlign = 'left';
}

function ambient() {
  S.amb.forEach((b) => {
    const x = b.x + Math.sin(b.w) * 10;
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, TAU); ctx.fill();
  });
  // steam from the bath
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x0 = 180 + i * 150; const ph = S.t * 0.6 + i * 2;
    ctx.beginPath(); for (let y = 0; y < 70; y += 6) ctx.lineTo(x0 + Math.sin(ph + y * 0.08) * 8, WATER - 20 - y); ctx.stroke();
  }
}

// ---------- state derived once per frame ----------
function look() {
  const phase = V.phase || 'calm';
  const duckTime = phase === 'duck' || phase === 'answer';
  const calmish = !duckTime && phase !== 'break' && phase !== 'result';
  const secret = !!V.secret;
  const hasGoal = typeof V.goal === 'number';
  const goal = hasGoal ? V.goal : 0.55;
  const sleepy = !!V.sleepy;
  const calmPhase = (phase === 'calm' || phase === 'warmup' || phase === 'settle');
  const overGoal = hasGoal && S.shown > goal && !secret;
  const fizzy = !secret && calmPhase && (V.fizz === true || (hasGoal && S.shown < goal - 0.12));
  const breathOn = !!(V.breath && V.breath.on) && calmPhase && !secret;
  const k = V.breath && typeof V.breath.k === 'number' ? V.breath.k : 0;
  return { phase, duckTime, calmish, secret, hasGoal, goal, sleepy, calmPhase, overGoal, fizzy, breathOn, k };
}
let L = null;

// ---------- the hippo ----------
function hippo() {
  const k = L.k;
  const calmFace = L.calmPhase && L.hasGoal && S.shown > L.goal + 0.1 && !L.secret;
  const closed = L.sleepy;
  const bob = (V.breath && V.breath.on && L.calmPhase ? -4 * k : Math.sin(S.t * 1.4) * 1.5) + (L.sleepy ? 6 : 0);
  const hx = HX - 8; const hy = HY - 64 + bob;
  const flick = S.ear > 0 ? Math.sin(S.ear * 20) * 0.35 : 0; // ears flick on a launch
  [[-50, -58, -0.4 - flick], [22, -64, 0.3 + flick]].forEach(([dx, dy, r]) => {
    soft(() => fillE(hx + dx, hy + dy, 17, 14, '#A898E4', r));
    fillE(hx + dx, hy + dy + 1, 9, 7, '#F6B6CB', r);
  });
  // head
  soft(() => { ctx.fillStyle = rad(hx, hy, 92, '#C9BEF7', '#9A89DE'); ctx.beginPath(); ctx.ellipse(hx, hy, 92, 70, 0, 0, TAU); ctx.fill(); }, 4);
  // shower cap with dots and a frill
  ctx.save(); ctx.beginPath(); ctx.ellipse(hx, hy, 92, 70, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = '#FF9EBB'; ctx.beginPath(); ctx.ellipse(hx - 6, hy - 64, 84, 42, -0.05, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  [[-50, -62], [-20, -74], [12, -70], [40, -60], [-34, -46], [0, -50], [30, -42], [-62, -40]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(hx + dx, hy + dy, 4, 0, TAU); ctx.fill(); });
  ctx.fillStyle = '#FFC3D5';
  for (let i = 0; i <= 12; i++) { const a = 0.1 * Math.PI + i * (0.8 * Math.PI / 12); ctx.beginPath(); ctx.arc(hx - 6 + Math.cos(a) * 84, hy - 64 + Math.sin(a) * 42, 7, 0, TAU); ctx.fill(); }
  ctx.restore();
  // eyes
  [[hx - 30, hy - 8], [hx + 14, hy - 12]].forEach(([x, y]) => {
    if (closed) {
      ctx.strokeStyle = '#2B2550'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y - 2, 11, 0.25, Math.PI - 0.25); ctx.stroke();
      [-0.5, 0, 0.5].forEach((o) => { ctx.beginPath(); ctx.moveTo(x + Math.cos(Math.PI / 2 + o) * 11, y - 2 + Math.sin(Math.PI / 2 + o) * 11); ctx.lineTo(x + Math.cos(Math.PI / 2 + o) * 15, y - 2 + Math.sin(Math.PI / 2 + o) * 15); ctx.stroke(); });
      return;
    }
    const big = L.duckTime ? 1.12 : 1;
    fillE(x, y, 15 * big, 17 * big, '#FFFFFF');
    fillE(x + 2, y + 2, 10 * big, 11.5 * big, '#2B2550');
    fillE(x + 2, y + 4, 6 * big, 6 * big, '#4A3F86');
    fillE(x - 2, y - 3, 4.2, 4.6, '#FFFFFF');
    fillE(x + 6, y + 7, 1.8, 1.8, '#FFFFFF');
    if (calmFace) star(x + 5, y - 2, 3.5 + Math.sin(S.t * 3) * 0.8, 'rgba(255,255,255,.95)');
  });
  // blush with sparkle
  [[hx - 66, hy + 14], [hx + 36, hy + 8]].forEach(([x, y]) => { fillE(x, y, 13, 8, 'rgba(255,150,180,.55)'); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; [-4, 0, 4].forEach((o) => { ctx.beginPath(); ctx.moveTo(x + o - 2, y + 3); ctx.lineTo(x + o + 2, y - 3); ctx.stroke(); }); });
  // snout, nostrils, smile, two little teeth
  soft(() => { ctx.fillStyle = rad(hx + 48, hy + 26, 70, '#DDD5FB', '#B7AAEC'); ctx.beginPath(); ctx.ellipse(hx + 48, hy + 26, 70, 44, -0.05, 0, TAU); ctx.fill(); }, 3);
  fillE(hx + 32, hy + 10, 6, 4.5, '#7A68C2', -0.3); fillE(hx + 68, hy + 8, 6, 4.5, '#7A68C2', 0.3);
  fillE(hx + 31, hy + 9, 2, 1.4, 'rgba(255,255,255,.6)');
  const blowing = L.calmish && !L.sleepy;
  S.tip = { x: hx + 128, y: hy - 18 };
  ctx.strokeStyle = '#5B4A9E'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (L.sleepy) { ctx.beginPath(); ctx.ellipse(hx + 50, hy + 40, 9, 11, 0, 0, TAU); ctx.stroke(); }
  else if (blowing) {
    // pursed lips around a striped bubble straw; the cheek puffs while the bubble grows
    const puff = L.overGoal && V.gate !== 'hold' ? 1.25 : 1;
    fillE(hx + 92, hy + 26, 14 * puff, 11 * puff, 'rgba(255,150,180,.35)');
    ctx.strokeStyle = '#F28CAB'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(hx + 62, hy + 36); ctx.quadraticCurveTo(hx + 112, hy + 30, S.tip.x, S.tip.y); ctx.stroke();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 8; ctx.lineCap = 'butt'; ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(hx + 62, hy + 36); ctx.quadraticCurveTo(hx + 112, hy + 30, S.tip.x, S.tip.y); ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'round';
    fillE(hx + 56, hy + 36, 9, 8, '#9C7FD6'); fillE(hx + 56, hy + 36, 5, 4.5, '#5B4A9E');
  } else {
    ctx.beginPath(); ctx.arc(hx + 50, hy + 30, 18, 0.35, Math.PI - 0.35); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(hx + 43, hy + 45, 6, 6, 2); ctx.roundRect(hx + 51, hy + 45, 6, 6, 2); ctx.fill();
  }
  if (calmFace && !closed) { const p = (S.t * 0.5) % 1; ctx.save(); ctx.globalAlpha = 1 - p; heart(hx - 70, hy - 70 - p * 40, 7, '#FF9EBB'); ctx.font = '600 18px ' + FD; ctx.fillStyle = '#7F6FC4'; ctx.fillText('♪', hx + 74, hy - 66 - ((p + 0.5) % 1) * 40); ctx.restore(); }
  if (L.sleepy) { ctx.font = '600 22px ' + FD; ctx.fillStyle = '#7F6FC4'; ctx.fillText('z', hx + 70, hy - 70 - (S.t * 12 % 12)); ctx.font = '600 30px ' + FD; ctx.fillText('Z', hx + 90, hy - 92 - (S.t * 12 % 12)); }
  return { hx, hy };
}

function paws() {
  const y = WATER + 2;
  [[HX - 88, y], [HX + 70, y - 2]].forEach(([x, yy]) => {
    soft(() => { ctx.fillStyle = rad(x, yy, 22, '#C9BEF7', '#A595E2'); ctx.beginPath(); ctx.ellipse(x, yy, 22, 15, 0, 0, TAU); ctx.fill(); }, 2);
    ctx.strokeStyle = 'rgba(91,74,158,.5)'; ctx.lineWidth = 2; [-8, 0, 8].forEach((o) => { ctx.beginPath(); ctx.moveTo(x + o, yy + 4); ctx.lineTo(x + o, yy + 12); ctx.stroke(); });
  });
}

// ---------- tub, water, foam, duck ----------
function tub() {
  const world = Math.max(0, Math.min(WORLD_WATER.length - 1, Math.floor(V.world || 0)));
  ctx.fillStyle = WORLD_WATER[world]; ctx.beginPath(); ctx.roundRect(116, WATER - 6, 456, 30, 14); ctx.fill();
  const tint = BOMB_TINT[V.bathBomb];
  if (tint) { ctx.globalAlpha = 0.45; ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(116, WATER - 6, 456, 30, 14); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const x = 150 + i * 110 + Math.sin(S.t * 0.8 + i) * 10; ctx.beginPath(); ctx.moveTo(x, WATER + 8); ctx.quadraticCurveTo(x + 14, WATER + 4, x + 28, WATER + 8); ctx.stroke(); }
  // foam clusters
  for (let i = 0; i < 26; i++) {
    const x = 120 + i * 18; const r = 10 + 5 * Math.sin(i * 2.1) + 2 * Math.sin(S.t * 0.7 + i); const y = WATER + 4 - Math.abs(Math.sin(i * 1.3)) * 6;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E4EEFB');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, TAU); ctx.fill();
  }
  if (BOMB_BITS[V.bathBomb]) { ctx.font = '16px ' + EMOJI; for (let i = 0; i < 3; i++) ctx.fillText(BOMB_BITS[V.bathBomb], 150 + i * 150 + Math.sin(S.t * 0.9 + i * 2) * 14, WATER - 2 + Math.sin(S.t * 1.3 + i) * 2); }
  if (L.fizzy) { // fizzy water: a soft nudge
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(140 + ((i * 67 + S.t * 70) % 420), WATER - 8 - (i % 3) * 6 - Math.abs(Math.sin(S.t * 6 + i)) * 5, 2.5, 0, TAU); ctx.fill(); }
  }
  // clawfoot tub body
  soft(() => {
    const g = ctx.createLinearGradient(0, WATER + 14, 0, WATER + 110); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#E3E9F5');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(98, WATER + 16); ctx.lineTo(590, WATER + 16);
    ctx.bezierCurveTo(588, WATER + 80, 560, WATER + 102, 500, WATER + 104); ctx.lineTo(188, WATER + 104);
    ctx.bezierCurveTo(128, WATER + 102, 100, WATER + 80, 98, WATER + 16); ctx.fill();
  }, 6);
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(90, WATER + 8, 508, 16, 8); ctx.fill();
  ctx.fillStyle = '#F2C86B'; ctx.beginPath(); ctx.roundRect(110, WATER + 26, 468, 4, 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.roundRect(140, WATER + 40, 120, 6, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.roundRect(140, WATER + 52, 50, 4, 2); ctx.fill();
  [[180, WATER + 104], [508, WATER + 104]].forEach(([x, y]) => {
    const g = ctx.createLinearGradient(0, y, 0, y + 24); g.addColorStop(0, '#F8D98A'); g.addColorStop(1, '#D9A445');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.quadraticCurveTo(x - 16, y + 18, x - 20, y + 22); ctx.lineTo(x + 20, y + 22); ctx.quadraticCurveTo(x + 16, y + 18, x + 12, y); ctx.fill();
    ctx.fillStyle = '#E6B457'; [-14, -5, 4, 13].forEach((o) => { ctx.beginPath(); ctx.arc(x + o, y + 22, 4, 0, TAU); ctx.fill(); });
  });
  heart(530, WATER + 62, 10, 'rgba(247,185,204,.9)'); // little heart on the tub
  duck();
  if (hasPest('sock')) { ctx.font = '30px ' + EMOJI; ctx.fillText('🧦', 150, WATER + 6 + Math.sin(S.t * 2) * 3); ctx.font = '600 12px ' + FD; ctx.fillStyle = '#6E9F5B'; ctx.fillText(t('hippo.scene.stinky'), 144, WATER - 26 + Math.sin(S.t * 3) * 2); }
}

function duck() {
  ctx.save(); ctx.translate(505, WATER - 8 + Math.sin(S.t * 1.2) * 2.5); ctx.rotate(L.fizzy ? Math.sin(S.t * 5) * 0.35 : Math.sin(S.t * 1.2) * 0.06);
  soft(() => { ctx.fillStyle = rad(0, 0, 22, '#FFE58A', '#F3BE3E'); ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, TAU); ctx.fill(); }, 2);
  ctx.fillStyle = rad(9, -18, 12, '#FFE58A', '#F3BE3E'); ctx.beginPath(); ctx.arc(9, -18, 12, 0, TAU); ctx.fill();
  fillE(-4, -2, 10, 6, '#F0B532', -0.3);
  fillE(23, -15, 7, 3.5, '#F08A5D'); fillE(22, -12, 6, 2.5, '#E0704A');
  fillE(12, -21, 2.8, 3.2, '#2B2550'); fillE(11, -22, 1, 1, '#FFFFFF');
  fillE(15, -13, 3.5, 2, 'rgba(255,140,160,.6)');
  ctx.restore();
}

const hasPest = (name) => Array.isArray(V.pests) && V.pests.includes(name);

// ---------- bubbles ----------
function bubbleAt(x, y, r, a) {
  ctx.save(); ctx.globalAlpha = a == null ? 1 : a;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(0.75, 'rgba(210,235,255,.12)'); g.addColorStop(1, 'rgba(190,170,250,.32)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  const lg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  lg.addColorStop(0, 'rgba(255,170,210,.9)'); lg.addColorStop(0.35, 'rgba(160,220,255,.9)'); lg.addColorStop(0.65, 'rgba(190,255,210,.9)'); lg.addColorStop(1, 'rgba(255,225,150,.9)');
  ctx.strokeStyle = lg; ctx.lineWidth = Math.max(2, r * 0.06); ctx.stroke();
  if (r > 14) {
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(2, r * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 3.55, 4.35); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x + r * 0.42, y + r * 0.45, r * 0.07, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.roundRect(x + r * 0.25, y - r * 0.55, r * 0.22, r * 0.2, 3); ctx.fill();
  }
  ctx.restore();
}

function cloud(cx, cy, rx, ry) {
  soft(() => { ctx.fillStyle = '#FBFDFF'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.fill(); }, 3);
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 + S.t * 0.15; const px = cx + Math.cos(a) * rx * 0.92; const py = cy + Math.sin(a) * ry * 0.92;
    ctx.fillStyle = '#FBFDFF'; ctx.beginPath(); ctx.arc(px, py, Math.min(rx, ry) * 0.32, 0, TAU); ctx.fill();
  }
}

function bubbleArea() {
  // the bubble sits on the tip of the straw in the hippo's mouth
  // secret: fixed size, so the foam position and size give nothing away
  const r = L.secret ? 40 : 16 + 44 * Math.min(1, S.bubbleShown);
  const tip = S.tip;
  const bx = tip.x + r * 0.5; const by = tip.y - r * 0.86;
  S.bp = { x: bx, y: by };
  if (L.calmish && !L.secret) {
    bubbleAt(bx, by, r);
    if (S.bubbleShown > 0.75) { for (let i = 0; i < 4; i++) { const a = S.t * 0.8 + i * TAU / 4; star(bx + Math.cos(a) * (r + 16), by + Math.sin(a) * (r + 16), 5 + 2 * Math.sin(S.t * 3 + i), 'rgba(255,214,120,.95)'); } }
  }
  if (L.calmish && L.secret) { bubbleAt(bx, by, r); }
  if (L.breathOn) {
    const k = L.k;
    ctx.strokeStyle = 'rgba(108,199,160,.85)'; ctx.lineWidth = 3; ctx.setLineDash([2, 8]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(bx, by, r + 12 + 16 * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 14px ' + FD; const txt = S.inhale ? t('hippo.scene.in') : t('hippo.scene.out');
    const tw = ctx.measureText(txt).width;
    pill(bx + r + 34, by - 14, tw + 22, 26, 'rgba(255,255,255,.85)');
    ctx.fillStyle = '#2F7D5D'; ctx.fillText(txt, bx + r + 45, by + 4);
  }
  if (hasPest('fly')) {
    const a = S.t * 5; const fx = HX + 70 + Math.cos(a) * 30; const fy = HY - 120 + Math.sin(a * 1.3) * 14;
    ctx.font = '22px ' + EMOJI; ctx.fillText('🪰', fx, fy);
    ctx.strokeStyle = 'rgba(92,99,120,.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(HX + 80, HY - 126, 34, a, a + 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 13px ' + FD; ctx.fillStyle = '#5C6378'; ctx.fillText(t('hippo.scene.bzzz'), HX + 112, HY - 150);
  }
  if (hasPest('swan')) {
    ctx.font = '42px ' + EMOJI; ctx.fillText('🦢', 34, WATER - 2);
    pill(28, WATER - 78, 74, 28, '#FFFFFF'); ctx.font = '700 16px ' + FD; ctx.fillStyle = '#E46F5B'; ctx.fillText(t('hippo.scene.honk'), 38, WATER - 58);
  }
}

// ---------- meter: a little glass bubble tube ----------
function meter() {
  const x = 706; const y = 58; const h = 222; const w = 44;
  soft(() => { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.roundRect(x - 6, y - 6, w + 12, h + 12, 28); ctx.fill(); }, 4);
  ctx.fillStyle = '#F28CAB'; ctx.beginPath(); ctx.roundRect(x + 6, y - 18, w - 12, 14, 6); ctx.fill();
  if (L.duckTime) { // duck time: the meter does not score the brain
    ctx.fillStyle = '#FFF3E4'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill();
    // one duck only: several here would be counted with the real ducks
    ctx.font = '40px ' + EMOJI; ctx.textAlign = 'center';
    ctx.fillText('🦆', x + w / 2, y + h / 2 + 14 + Math.sin(S.t * 3) * 4);
    pill(x - 20, y + h + 14, w + 40, 24, '#F58A6B');
    ctx.font = '700 12px ' + FD; ctx.fillStyle = '#FFFFFF'; ctx.fillText(t('hippo.scene.duckTime'), x + w / 2, y + h + 31); ctx.textAlign = 'left';
    return;
  }
  if (L.secret) { // foam hides everything: empty tube, no goal line, no level
    ctx.fillStyle = '#F1F5FB'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill();
    cloud(x + w / 2, y + h / 2, 46, h / 2 + 18);
    const c = S.bp;
    cloud(c.x, c.y, 80, 74);
    ctx.fillStyle = '#7F6FC4'; ctx.textAlign = 'center'; ctx.font = '700 15px ' + FD;
    ctx.fillText(t('hippo.scene.secret'), c.x, c.y - 4); ctx.fillText(t('hippo.scene.bubble'), c.x, c.y + 14);
    ctx.font = '700 32px ' + FD; ctx.fillText('?', x + w / 2, y + h / 2 + 10); ctx.textAlign = 'left';
    return;
  }
  const fh = h * S.shown;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.clip();
  ctx.fillStyle = '#F1F5FB'; ctx.fillRect(x, y, w, h);
  const lg = ctx.createLinearGradient(0, y + h - fh, 0, y + h);
  lg.addColorStop(0, '#A9E3F2'); lg.addColorStop(1, '#6FB6DE');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x, y + h - fh);
  for (let i = 0; i <= w; i += 4) ctx.lineTo(x + i, y + h - fh + Math.sin(S.t * 3 + i * 0.3) * 2);
  ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 7; i++) { const by = y + h - ((i * 31 + S.t * 24) % Math.max(1, fh)); ctx.beginPath(); ctx.arc(x + 9 + (i * 11 % 28), by, 2.5 + (i % 3), 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x + 7, y + 10, 5, h - 20);
  ctx.restore();
  if (L.hasGoal) {
    const gy = y + h - h * L.goal;
    ctx.strokeStyle = '#5B4A9E'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(x - 10, gy); ctx.lineTo(x + w + 10, gy); ctx.stroke(); ctx.setLineDash([]);
    star(x - 18, gy, 8, '#F6C85F');
    ctx.font = '600 11px ' + FD; ctx.fillStyle = '#5B4A9E'; ctx.textAlign = 'right'; ctx.fillText(t('hippo.scene.goal'), x - 30, gy + 4);
  }
  ctx.textAlign = 'center';
  pill(x - 14, y + h + 14, w + 28, 24, '#7F6FC4');
  ctx.font = '700 13px ' + FD; ctx.fillStyle = '#FFFFFF'; ctx.fillText(t('hippo.scene.calm'), x + w / 2, y + h + 31);
  ctx.textAlign = 'left';
}

// ---------- top bar, hints, banners ----------
function hud(head) {
  const colors = { ok: '#4FAE88', hint: '#5A9BD0', hold: '#E2A53A', freeze: '#E0705C' };
  if (colors[V.gate]) {
    soft(() => pill(14, 12, 96, 28, colors[V.gate]), 2);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(30, 26, 5, 0, TAU); ctx.fill();
    ctx.font = '700 13px ' + FD; ctx.fillText(t(`hippo.scene.gate.${V.gate}`), 42, 31);
  }
  if (Array.isArray(V.hudLines) && V.hudLines.length) {
    const [l1, l2 = ''] = V.hudLines.map(String);
    ctx.font = '600 12px ' + ATK;
    const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width);
    pill(440 - tw - 14, 10, tw + 24, 42, 'rgba(255,255,255,.78)');
    if (typeof V.badge === 'number') { ctx.fillStyle = BADGE_COLORS[Math.max(0, Math.min(5, Math.floor(V.badge)))]; ctx.beginPath(); ctx.arc(440 - tw - 2, 20, 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#4A4466'; ctx.textAlign = 'right'; ctx.fillText(l1, 440, 27); ctx.fillText(l2, 440, 44); ctx.textAlign = 'left';
  }
  if (V.hint) {
    ctx.font = '600 15px ' + FD;
    const w = ctx.measureText(V.hint).width + 28; const x = Math.max(12, head.hx - 150); const y = 106;
    soft(() => { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(x, y, w, 34, 17); ctx.moveTo(x + 120, y + 34); ctx.lineTo(x + 140, y + 48); ctx.lineTo(x + 146, y + 34); ctx.fill(); }, 3);
    ctx.fillStyle = '#3B3560'; ctx.fillText(V.hint, x + 14, y + 22);
  }
  if (S.msgT > 0 && S.lastMsg) {
    ctx.font = '700 21px ' + FD;
    const tw2 = ctx.measureText(S.lastMsg).width; const cx = 360;
    const a = Math.min(1, S.msgT * 2); const dy = (1 - a) * -8;
    ctx.save(); ctx.globalAlpha = a;
    soft(() => pill(cx - tw2 / 2 - 22, 56 + dy, tw2 + 44, 40, '#FFF1C9'), 3);
    star(cx - tw2 / 2 - 8, 76 + dy, 6, '#F6C85F'); star(cx + tw2 / 2 + 8, 76 + dy, 6, '#F6C85F');
    ctx.fillStyle = '#4A3B2A'; ctx.textAlign = 'center'; ctx.fillText(S.lastMsg, cx, 83 + dy); ctx.textAlign = 'left';
    ctx.restore();
  }
}

function sparkles() {
  S.spark.forEach((p) => {
    const a = Math.min(1, p.life);
    ctx.save(); ctx.globalAlpha = a;
    if (p.h) heart(p.x, p.y, 8, '#FF9EBB'); else star(p.x, p.y, 6, '#FFD978');
    ctx.restore();
  });
}

function overlays() {
  if (L.phase === 'break') {
    ctx.fillStyle = 'rgba(246,250,255,.86)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) bubbleAt((i * 97 + S.t * 12) % W, H - ((i * 53 + S.t * 20) % H), 6 + (i % 4) * 4, 0.7);
    ctx.fillStyle = '#5B4A9E'; ctx.textAlign = 'center';
    ctx.font = '700 32px ' + FD; ctx.fillText(t('hippo.scene.bathBreak'), W / 2, 168);
    ctx.font = '600 17px ' + FD; ctx.fillStyle = '#3B3560'; ctx.fillText(V.breakText || '', W / 2, 202);
    ctx.font = '15px ' + ATK; ctx.fillText(t('hippo.scene.timeNo'), W / 2, 228); ctx.textAlign = 'left';
  }
  if (L.phase === 'result') {
    ctx.fillStyle = 'rgba(62,60,126,.72)'; ctx.fillRect(0, 0, W, H);
    sparkles();
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
    ctx.font = '700 32px ' + FD; ctx.fillText(t('hippo.scene.roundDone'), W / 2, 140);
    for (let i = 0; i < 3; i++) star(W / 2 - 40 + i * 40, 172, 15, '#FFD978');
    const lines = Array.isArray(V.resultLines) ? V.resultLines : [];
    ctx.font = '600 17px ' + ATK;
    lines.slice(0, 3).forEach((s, i) => ctx.fillText(String(s), W / 2, 214 + i * 28));
    ctx.textAlign = 'left';
  }
  if (V.paused && L.phase !== 'result') {
    ctx.fillStyle = 'rgba(62,60,126,.42)'; ctx.fillRect(0, 0, W, H);
    soft(() => pill(W / 2 - 130, H / 2 - 28, 260, 56, '#FFFFFF'), 4);
    ctx.fillStyle = '#5B4A9E'; ctx.font = '700 22px ' + FD; ctx.textAlign = 'center';
    ctx.fillText(t('hippo.scene.paused'), W / 2, H / 2 + 8); ctx.textAlign = 'left';
  }
}

/**
 * Draw one frame. `dt` is seconds since the last frame; the scene advances its own animation clock.
 * The context must already be scaled so that W x H units fill the canvas.
 */
export function drawScene(c, scene, view, dt) {
  ctx = c; S = scene; V = view || {};
  try {
    const step = Math.max(0, Math.min(0.1, dt || 0));
    animate(step);
    // ease the displayed values
    const e = Math.min(1, step * 6);
    S.shown += ((typeof V.meter === 'number' ? V.meter : S.shown) - S.shown) * e;
    S.bubbleShown += ((typeof V.bubble === 'number' ? V.bubble : S.bubbleShown) - S.bubbleShown) * e;
    // breath direction when the game does not say
    const k = V.breath && typeof V.breath.k === 'number' ? V.breath.k : 0;
    if (V.breath && typeof V.breath.inhale === 'boolean') S.inhale = V.breath.inhale;
    else if (Math.abs(k - S.prevK) > 1e-4) S.inhale = k > S.prevK;
    S.prevK = k;
    // duck pops: each increase of the count pops one duck
    const dn = Math.max(0, Math.floor(V.ducks || 0));
    if (dn < S.duckCount) S.ducks = [];
    for (let i = S.duckCount; i < dn; i++) S.ducks.push({ x: rnd(150, 560), life: 1.4 });
    S.duckCount = dn;
    // banner
    const msg = V.msg || '';
    if (msg !== S.prevMsg) { S.prevMsg = msg; if (msg) { S.lastMsg = msg; S.msgT = V.msgSecs || 2.5; } }
    if (S.msgT > 0) S.msgT = Math.max(0, S.msgT - step);
    // confetti when the result appears
    if (V.phase === 'result' && S.prevPhase !== 'result') {
      for (let i = 0; i < 24; i++) S.spark.push({ x: rnd(80, W - 80), y: rnd(60, 300), vx: rnd(-20, 20), vy: rnd(-30, 10), life: rnd(1.5, 3.5), h: Math.random() < 0.3 });
    }
    S.prevPhase = V.phase;

    L = look();
    drawRoom();
    zooShelf();
    ambient();
    S.flying.forEach((b) => { const x = b.x + Math.sin(b.w * 2) * 8; bubbleAt(x, b.y, b.r, 0.95); ctx.font = '38px ' + EMOJI; ctx.textAlign = 'center'; ctx.fillText(b.p, x, b.y + 13); ctx.textAlign = 'left'; });
    const head = hippo();
    S.toots.forEach((b) => bubbleAt(b.x, b.y, b.r, Math.min(1, b.life)));
    if (S.toots.length) { ctx.font = '700 22px ' + FD; ctx.fillStyle = '#9A6FC4'; ctx.fillText(t('hippo.scene.toot'), HX - 150, WATER - 34 - (1.9 - S.toots[0].life) * 10); }
    tub();
    paws();
    S.ducks.forEach((d) => { const pop = Math.sin(Math.min(1, (1.4 - d.life) / 1.4) * Math.PI); ctx.font = '34px ' + EMOJI; ctx.fillText('🦆', d.x, WATER - 4 - pop * 46); });
    bubbleArea();
    meter();
    if (L.phase !== 'result') sparkles();
    hud(head);
    overlays();
  } finally {
    ctx = null; S = null; V = null; L = null;
  }
}
