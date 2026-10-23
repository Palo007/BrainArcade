/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Turbo Rex drawing: Dino Town, Rex on his skateboard, the snack lane, the snail, the HUD. Canvas 2D, made in code
// from the proposal mock-up (bright, chunky cartoon art). The scene is 800 x 380 units; the game scales it.
// drawScene() reads a plain view object from the game and keeps only looks in its own state (scroll, particles,
// floating text): nothing here changes the game.
// Eye rule: every item flies in ONE lane at Rex's eye height at a steady speed (the game sets x); round twists
// and new worlds must never move the lane.

export const W = 800;
export const H = 380;
export const GROUND = 292;
export const REX_X = 185;
export const LANE_Y = GROUND - 128; // Rex's eye height
export const MOUTH_X = REX_X + 84;
export const SPAWN_X = W + 40;

const FD = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
const FM = '"Atkinson Hyperlegible Mono Variable", "Atkinson Hyperlegible Mono", monospace';
export const BELT_COLORS = ['#FFFFFF', '#F5D83A', '#F39A2B', '#3FA34D', '#3B82C4', '#1C1C1C'];
const CONFETTI = ['#FF6B5A', '#FFD23F', '#5CC46A', '#4FB3F2', '#C38BFF'];

let ctx = null; // set at the start of each drawScene call
let T = 0; // scene time, for wobbles

export function createScene() {
  return { t: 0, off: 0, speed: 120, energy: 0.45, parts: [], fx: [], snail: null, dustIn: 0, eat: 0, bleh: 0, banner: null };
}

// ---------- triggers from the game ----------
export function sceneFx(s, text, x, y, color, size = 22) {
  s.fx.push({ text, x, y, color, size, t: 1.2, max: 1.2, rot: (Math.random() - 0.5) * 0.25 });
}
function burst(s, x, y, n, colors, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (o.speed || 160) * (0.4 + Math.random() * 0.8);
    const life = (o.life || 1) * (0.7 + Math.random() * 0.5);
    s.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up ?? 60), life, max: life, c: colors[i % colors.length],
      r: o.r || 4, kind: o.kind || 'dot', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, g: o.g ?? 320,
    });
  }
}
export function sceneEat(s, x, y, big, points) {
  s.eat = 0.55;
  sceneFx(s, big ? 'BUUUURP!' : 'BURP!', REX_X + 70, GROUND - 175, '#FFE066', big ? 34 : 26);
  if (points) sceneFx(s, `+${points}`, x, y - 24, '#B9F5C4');
  burst(s, x, y, 12, ['#FFC94D', '#E2483D', '#D98B3A'], { r: 3.5, speed: 140 });
}
export function sceneBleh(s, x, y) {
  s.bleh = 0.8;
  sceneFx(s, 'BLEH!', x, y - 30, '#9BE07A', 30);
  burst(s, x, y, 9, ['rgba(140,205,90,.75)', 'rgba(170,220,110,.7)'], { kind: 'puff', g: -20, up: 30, speed: 50, life: 1.2, r: 14 });
}
export function sceneCombo(s, text = 'FOCUS COMBO!') {
  sceneFx(s, text, REX_X + 30, GROUND - 205, '#FFE066', 24);
  burst(s, REX_X + 30, GROUND - 170, 26, CONFETTI, { kind: 'confetti', speed: 230, up: 120, life: 1.3 });
}
export function sceneParty(s) {
  for (let i = 0; i < 3; i++) burst(s, 200 + i * 200, 120, 24, CONFETTI, { kind: 'confetti', speed: 260, up: 140, life: 1.6 });
}
export function sceneBanner(s, text, t = 2) { s.banner = { text, t }; }

// ---------- drawing helpers ----------
const wrap = (v, a, b) => ((((v - a) % (b - a)) + (b - a)) % (b - a)) + a;
function mix(a, b, k) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function ell(x, y, rx, ry, fill, stroke, lw = 3, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function label(text, x, y, size, fill, align = 'center', font = FD, lw = 6) {
  ctx.font = `bold ${size}px ${font}`; ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
  ctx.strokeStyle = '#1C2A2E'; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function star(x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function face(x, y, s, mood) { // tiny cute face for food and socks
  const dark = '#2B1D1A';
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(x - 7 * s, y, 3.2 * s, 0, 7); ctx.arc(x + 7 * s, y, 3.2 * s, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - 6 * s, y - 1.2 * s, 1.1 * s, 0, 7); ctx.arc(x + 8 * s, y - 1.2 * s, 1.1 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = dark; ctx.lineWidth = 2 * s; ctx.lineCap = 'round'; ctx.beginPath();
  if (mood === 'happy') ctx.arc(x, y + 3 * s, 5 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  else { // grumpy: frown + angry brows
    ctx.arc(x, y + 11 * s, 5 * s, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.moveTo(x - 11 * s, y - 7 * s); ctx.lineTo(x - 4 * s, y - 4 * s); ctx.moveTo(x + 11 * s, y - 7 * s); ctx.lineTo(x + 4 * s, y - 4 * s);
  }
  ctx.stroke();
  if (mood === 'happy') {
    ctx.fillStyle = 'rgba(255,120,140,.45)';
    ctx.beginPath(); ctx.arc(x - 12 * s, y + 5 * s, 3.5 * s, 0, 7); ctx.arc(x + 12 * s, y + 5 * s, 3.5 * s, 0, 7); ctx.fill();
  }
}

// ---------- Dino Town ----------
function drawTown(s, up, sleepyFace) {
  const e = s.energy;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, mix('#8C8CCB', '#4FB3F2', e)); sky.addColorStop(1, mix('#F4D7EA', '#D4F2FF', e));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // sun with a face (sunglasses when Rex zooms)
  const sx = 455, sy = 62;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(s.t * 0.3); ctx.fillStyle = 'rgba(255,224,138,.8)';
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(-6, -42); ctx.lineTo(0, -58); ctx.lineTo(6, -42); ctx.fill(); }
  ctx.restore();
  ell(sx, sy, 36, 36, '#FFD23F', '#F2A900', 3);
  if (up) {
    ctx.fillStyle = '#1C2A2E'; rr(sx - 26, sy - 12, 22, 13, 5); ctx.fill(); rr(sx + 4, sy - 12, 22, 13, 5); ctx.fill(); ctx.fillRect(sx - 5, sy - 9, 10, 3);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(sx - 22, sy - 10, 6, 3); ctx.fillRect(sx + 8, sy - 10, 6, 3);
  } else {
    ctx.strokeStyle = '#8A5A00'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(sx - 12, sy - 4, 6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.moveTo(sx + 18, sy - 4); ctx.arc(sx + 12, sy - 4, 6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  }
  ctx.strokeStyle = '#8A5A00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy + 8, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ell(sx - 22, sy + 8, 6, 4, 'rgba(255,120,90,.45)'); ell(sx + 22, sy + 8, 6, 4, 'rgba(255,120,90,.45)');
  // clouds with faces
  for (let i = 0; i < 4; i++) {
    const k = 0.8 + (i % 2) * 0.35, x = wrap(i * 240 - s.off * 0.05, -160, W + 160), y = 46 + (i % 3) * 24;
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath();
    [[0, 0, 22], [26, -12, 27], [54, 0, 20], [28, 8, 22]].forEach(([dx, dy, r]) => { ctx.moveTo(x + dx * k + r * k, y + dy * k); ctx.arc(x + dx * k, y + dy * k, r * k, 0, 7); });
    ctx.fill();
    ctx.fillStyle = '#5B6B8C'; ctx.strokeStyle = '#5B6B8C'; ctx.lineWidth = 2;
    if (sleepyFace) { ctx.beginPath(); ctx.moveTo(x + 18 * k, y); ctx.lineTo(x + 24 * k, y); ctx.moveTo(x + 32 * k, y); ctx.lineTo(x + 38 * k, y); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x + 21 * k, y, 2.2, 0, 7); ctx.arc(x + 35 * k, y, 2.2, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.arc(x + 28 * k, y + 4 * k, 4 * k, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  }
  // pigeons, high in the sky (far from the snack lane)
  ctx.strokeStyle = '#3A3F5C'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = wrap(s.t * 35 + i * 300 - s.off * 0.08, -40, W + 40), y = 96 + i * 12 + Math.sin(s.t * 2 + i) * 5, f = Math.sin(s.t * 9 + i * 2) * 5;
    ctx.beginPath(); ctx.moveTo(x - 9, y - f); ctx.quadraticCurveTo(x - 4, y - 3, x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 9, y - f); ctx.stroke();
  }
  // far mountains with snow
  for (let i = 0; i < 9; i++) {
    const cx = wrap(i * 150 - s.off * 0.08, -160, W + 160), h = 85 + (i % 3) * 32, base = GROUND - 45;
    ctx.fillStyle = mix('#9C9ACB', '#A8BCEB', e); ctx.beginPath(); ctx.moveTo(cx - 115, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx + 115, base); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(cx - 30, base - h + 26); ctx.lineTo(cx, base - h); ctx.lineTo(cx + 30, base - h + 26);
    ctx.lineTo(cx + 14, base - h + 20); ctx.lineTo(cx, base - h + 30); ctx.lineTo(cx - 14, base - h + 20); ctx.fill();
  }
  const hill = (par, amp, base, color) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, GROUND);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - amp * Math.sin((x + s.off * par) / 110) - amp * 0.4 * Math.sin((x + s.off * par) / 47));
    ctx.lineTo(W, GROUND); ctx.fill();
  };
  hill(0.18, 20, GROUND - 52, mix('#86BFA0', '#93D69F', e));
  hill(0.3, 14, GROUND - 26, mix('#6FAE84', '#7CC68A', e));
  // lollipop trees
  for (let i = 0; i < 8; i++) {
    const x = wrap(i * 125 - s.off * 0.3, -60, W + 60), y = GROUND - 30 - 14 * Math.sin((x + s.off * 0.3) / 110);
    ctx.fillStyle = '#8A5A3B'; rr(x - 4, y - 30, 8, 32, 3); ctx.fill();
    ell(x, y - 46, 22, 22, '#4FAE5E'); ell(x - 6, y - 52, 10, 9, '#73CB80');
    if (i % 3 === 0) { ctx.fillStyle = '#E2483D'; [[-10, -40], [8, -50], [4, -34]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(x + a, y + b, 3.5, 0, 7); ctx.fill(); }); }
  }
  // Dino Town houses, and the pizza van
  const HC = ['#FFB4A2', '#A0D8EF', '#FFE28A', '#C9B6EB', '#B5EAD7'];
  for (let i = 0; i < 5; i++) {
    const w = 70 + (i % 2) * 18, h = 52 + (i % 3) * 12, x = wrap(i * 215 - s.off * 0.5, -120, W + 120), b = GROUND - 6;
    ctx.fillStyle = HC[i]; rr(x, b - h, w, h, 4); ctx.fill();
    ctx.fillStyle = '#7A8496'; ctx.fillRect(x + w - 22, b - h - 24, 10, 20);
    ctx.fillStyle = '#E3685A'; ctx.beginPath(); ctx.moveTo(x - 8, b - h + 2); ctx.lineTo(x + w / 2, b - h - 30); ctx.lineTo(x + w + 8, b - h + 2); ctx.fill();
    ctx.fillStyle = '#6B4A3A'; rr(x + w / 2 - 9, b - 24, 18, 24, [9, 9, 0, 0]); ctx.fill();
    ctx.fillStyle = up ? '#FFF6C9' : '#FFE07A'; rr(x + 8, b - h + 10, 14, 14, 3); ctx.fill(); rr(x + w - 22, b - h + 10, 14, 14, 3); ctx.fill();
    for (let k = 0; k < 3; k++) { // chimney smoke
      const p = (s.t * 0.5 + k / 3 + i * 0.2) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`; ctx.beginPath(); ctx.arc(x + w - 17 + p * 14, b - h - 30 - p * 30, 4 + p * 7, 0, 7); ctx.fill();
    }
  }
  const vx = wrap(620 - s.off * 0.5, -160, W + 160), vb = GROUND - 6;
  ctx.fillStyle = '#FFFFFF'; rr(vx, vb - 44, 96, 36, 8); ctx.fill(); ctx.strokeStyle = '#1C2A2E'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#E2483D'; rr(vx + 70, vb - 36, 22, 18, 4); ctx.fill();
  ctx.font = `bold 13px ${FD}`; ctx.textAlign = 'center'; ctx.fillStyle = '#E2483D'; ctx.fillText('PIZZA', vx + 36, vb - 20);
  ell(vx + 20, vb - 6, 8, 8, '#1C2A2E'); ell(vx + 76, vb - 6, 8, 8, '#1C2A2E');
  // sidewalk, road, flower strip
  ctx.fillStyle = '#EDE6D3'; ctx.fillRect(0, GROUND - 8, W, 14);
  ctx.fillStyle = '#D5CCB4'; for (let x = -(s.off % 40); x < W; x += 40) ctx.fillRect(x, GROUND - 8, 2, 14);
  ctx.fillStyle = '#5A5F6E'; ctx.fillRect(0, GROUND + 6, W, H - GROUND - 6);
  ctx.fillStyle = '#FFE27A'; for (let x = -(s.off % 80); x < W; x += 80) { rr(x, GROUND + 40, 44, 6, 3); ctx.fill(); }
  ctx.fillStyle = '#7CCB6B'; ctx.fillRect(0, H - 16, W, 16);
  const FC = ['#FF8FB1', '#FFD23F', '#FFFFFF', '#C38BFF'];
  for (let i = 0; i < 16; i++) {
    const x = wrap(i * 57 - s.off * 1.1, -20, W + 20), y = H - 9;
    ctx.fillStyle = FC[i % 4]; for (let p = 0; p < 5; p++) { const a = p * 1.256; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#F5A623'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
  }
  if (up) { // wind lines
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = GROUND - 120 + i * 20, x = REX_X - 80 - ((s.t * 600 + i * 47) % 70);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 46, y); ctx.stroke();
    }
  }
}

// ---------- Rex ----------
function spike(px, py, ang, size, color) {
  const nx = Math.cos(ang), ny = Math.sin(ang), tx = -ny, ty = nx;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(px + tx * size * 0.6, py + ty * size * 0.6); ctx.lineTo(px + nx * size * 1.3, py + ny * size * 1.3); ctx.lineTo(px - tx * size * 0.6, py - ty * size * 0.6); ctx.fill();
}
function drawRex(s, { up, sleepy, frozen, dance }) {
  const mood = s.bleh > 0 ? 'bleh' : s.eat > 0 ? 'eat' : sleepy ? 'sleepy' : up || dance ? 'happy' : 'calm';
  const BODY = '#5CC46A', LINE = '#2E7D3A', SPK = '#3E9E4E';
  const bob = frozen ? 0 : dance ? Math.abs(Math.sin(s.t * 7)) * -14 : Math.sin(s.t * (up ? 16 : 3)) * (up ? 2.5 : 1.2);
  ctx.save(); ctx.translate(REX_X, GROUND);
  // skateboard with a flame and spinning wheels
  ctx.fillStyle = '#FF6B5A'; rr(-72, -27, 148, 13, 7); ctx.fill(); ctx.strokeStyle = '#B83B2E'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.moveTo(-50, -15); ctx.quadraticCurveTo(-30, -30, -22, -15); ctx.quadraticCurveTo(-12, -26, -2, -15); ctx.closePath(); ctx.fill();
  for (const wx of [-46, 52]) {
    ell(wx, -8, 9.5, 9.5, '#FFD23F', '#1C2A2E', 3);
    ctx.save(); ctx.translate(wx, -8); ctx.rotate(-s.off / 9); ctx.strokeStyle = '#1C2A2E'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke(); ctx.restore();
  }
  ctx.translate(0, bob);
  if (dance) ctx.rotate(Math.sin(s.t * 7) * 0.08);
  // tail with spikes
  ctx.fillStyle = BODY; ctx.strokeStyle = LINE; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-26, -74); ctx.quadraticCurveTo(-92, -76, -120, -46 + Math.sin(s.t * 6) * 4); ctx.quadraticCurveTo(-78, -48, -22, -46); ctx.closePath(); ctx.fill(); ctx.stroke();
  [[-58, -70, -1.75], [-82, -64, -2.0], [-104, -54, -2.3]].forEach(([a, b, gg]) => spike(a, b, gg, 7, SPK));
  // legs + sneakers
  ctx.fillStyle = BODY; rr(-30, -54, 19, 28, 9); ctx.fill(); ctx.stroke(); rr(8, -54, 19, 28, 9); ctx.fill(); ctx.stroke();
  for (const lx of [-20, 18]) { ell(lx + 3, -28, 15, 7.5, '#FFFFFF', '#1C2A2E', 2.5); ctx.fillStyle = '#E2483D'; ctx.fillRect(lx - 6, -31, 14, 3); }
  // back spikes, body, belly
  [-2.55, -2.15, -1.8].forEach((a) => spike(44 * Math.cos(a), -84 + 42 * Math.sin(a), a, 9, SPK));
  ell(0, -84, 44, 42, BODY, LINE, 3);
  ell(12, -76, 24, 30, '#FBEBB5');
  ctx.strokeStyle = '#E3C77E'; ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(12, -96 + k * 14, 18, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  // waving arm
  ctx.save(); ctx.translate(30, -92); ctx.rotate(up || dance ? -0.5 + Math.sin(s.t * 12) * 0.5 : 0.35);
  ctx.fillStyle = BODY; ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; rr(0, -5, 24, 10, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(25, -3, 2, 0, 7); ctx.arc(25, 3, 2, 0, 7); ctx.fill(); ctx.restore();
  // neck spikes, head, snout
  [[-6, -122, -2.4], [-2, -140, -2.0]].forEach(([a, b, gg]) => spike(a, b, gg, 8, SPK));
  ell(40, -134, 44, 33, BODY, LINE, 3, -0.08);
  ell(76, -124, 26, 20, BODY, LINE, 3);
  ell(58, -128, 24, 20, BODY);
  ctx.fillStyle = LINE; ctx.beginPath(); ctx.arc(92, -132, 2.4, 0, 7); ctx.arc(84, -135, 2.4, 0, 7); ctx.fill();
  ell(54, -116, 8, 6, 'rgba(255,128,150,.55)');
  // mouth
  const DARK = '#7A1F2B';
  if (mood === 'happy') {
    ctx.fillStyle = DARK; ctx.beginPath(); ctx.moveTo(52, -118); ctx.quadraticCurveTo(74, -96, 96, -118); ctx.closePath(); ctx.fill();
    ell(76, -108, 9, 5, '#FF8FA3');
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(58 + k * 9, -118); ctx.lineTo(62 + k * 9, -112); ctx.lineTo(66 + k * 9, -118); ctx.fill(); }
  } else if (mood === 'eat') {
    ell(64, -114, 12, 11, BODY, LINE, 2.5); ell(86, -114, 12, 11, BODY, LINE, 2.5);
    ctx.strokeStyle = DARK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(66, -106); ctx.quadraticCurveTo(75, -100, 84, -106); ctx.stroke();
  } else if (mood === 'bleh') {
    ell(78, -112, 13, 9, DARK); ctx.fillStyle = '#8BD46E'; rr(72, -112, 13, 22, 6); ctx.fill();
    ctx.strokeStyle = '#5E9E45'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(78.5, -108); ctx.lineTo(78.5, -94); ctx.stroke();
  } else if (mood === 'sleepy') {
    ell(78, -114, 5, 6, DARK);
    const d = (s.t * 0.8) % 1; ell(83, -106 + d * 8, 2.5, 3.5, 'rgba(120,190,255,.8)');
  } else {
    ctx.strokeStyle = DARK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(56, -116); ctx.quadraticCurveTo(74, -106, 94, -118); ctx.stroke();
  }
  // eye, lids, brows
  ell(36, -144, 13, 14, '#FFFFFF', LINE, 2.5);
  const look = mood === 'bleh' ? -2 : 3;
  ell(36 + look, -143, 6.5, 7, '#1C2A2E'); ell(38 + look, -146, 2.3, 2.3, '#FFFFFF');
  if (mood === 'sleepy') {
    ctx.save(); ctx.beginPath(); ctx.ellipse(36, -144, 13, 14, 0, 0, 7); ctx.clip();
    ctx.fillStyle = BODY; ctx.fillRect(20, -162, 32, 19 + Math.sin(s.t * 1.5) * 2); ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(23, -142); ctx.lineTo(49, -142); ctx.stroke();
    const r = 4 + 9 * (0.5 + 0.5 * Math.sin(s.t * 2.2)); // snot bubble
    ell(96, -130 - r * 0.3, r, r, 'rgba(170,220,255,.45)', 'rgba(255,255,255,.9)', 1.5); ell(93, -133 - r * 0.5, r * 0.25, r * 0.25, 'rgba(255,255,255,.9)');
  }
  ctx.strokeStyle = '#1F4F28'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
  if (mood === 'sleepy') { ctx.moveTo(24, -160); ctx.lineTo(46, -164); } else if (up) { ctx.moveTo(24, -165); ctx.lineTo(48, -160); } else { ctx.moveTo(25, -164); ctx.lineTo(47, -164); }
  ctx.stroke();
  // helmet with a star
  ctx.fillStyle = up ? '#FFD23F' : '#B7C0C8'; ctx.beginPath(); ctx.ellipse(30, -160, 34, 20, -0.08, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#1C2A2E'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#E2483D'; ctx.fillRect(24, -180, 10, 20);
  star(48, -170, 6, '#FFFFFF');
  ctx.fillStyle = up ? '#E8B800' : '#98A2AB'; rr(-6, -164, 72, 6, 3); ctx.fill();
  ctx.strokeStyle = '#6B4A3A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -158); ctx.lineTo(18, -116); ctx.stroke();
  if (frozen) { // ice cube
    ctx.fillStyle = 'rgba(190,235,255,.55)'; rr(-80, -192, 190, 172, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-60, -170); ctx.lineTo(-30, -180); ctx.moveTo(-64, -150); ctx.lineTo(-50, -155); ctx.stroke();
  }
  ctx.restore();
  if (sleepy) {
    const z = (s.t * 1.1) % 1;
    ctx.globalAlpha = 1 - z;
    label('z', REX_X + 104, GROUND - 175 - z * 30, 22, '#FFFFFF', 'left');
    label('Z', REX_X + 122, GROUND - 198 - z * 30, 28, '#FFFFFF', 'left');
    ctx.globalAlpha = 1;
  }
}

// ---------- items (only pizzas on White and Yellow belts; socks come with Orange) ----------
function drawItem(kind, x, y, alpha = 1) {
  const wob = Math.sin(T * 3 + x * 0.02) * 0.08;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(wob);
  if (kind === 'sock') {
    const path = () => {
      ctx.beginPath(); ctx.moveTo(-11, -30); ctx.lineTo(11, -30); ctx.lineTo(11, 6); ctx.quadraticCurveTo(32, 6, 30, 20);
      ctx.quadraticCurveTo(26, 30, 4, 28); ctx.quadraticCurveTo(-12, 26, -11, 12); ctx.closePath();
    };
    ctx.save(); path(); ctx.fillStyle = '#F7F3EA'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#E2483D'; for (let k = -30; k < 30; k += 10) ctx.fillRect(-20, k, 60, 4);
    ctx.restore();
    path(); ctx.strokeStyle = '#8A8170'; ctx.lineWidth = 2.5; ctx.stroke();
    face(0, -12, 0.8, 'grumpy');
  } else {
    ctx.fillStyle = '#FFC94D'; ctx.strokeStyle = '#C98A2E'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-27, -18); ctx.lineTo(27, -18); ctx.lineTo(0, 32); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#FFE08A'; [[-16, -18, 7, 12], [-2, -18, 6, 17], [11, -18, 7, 10]].forEach(([a, b, w, h]) => { rr(a, b, w, h, 3.5); ctx.fill(); });
    ctx.fillStyle = '#D98B3A'; rr(-31, -29, 62, 14, 7); ctx.fill(); ctx.strokeStyle = '#A9652A'; ctx.stroke();
    [[-12, 6], [10, 4], [0, 18]].forEach(([a, b]) => { ell(a, b, 5, 5, '#E2483D'); ell(a - 1.5, b - 1.5, 1.6, 1.6, '#FF8A7A'); });
    face(0, -6, 0.85, 'happy');
  }
  ctx.restore();
}
function drawSnail(x, g) {
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(x - 50, g - 14); ctx.lineTo(x - 30, g - 14); ctx.moveTo(x - 56, g - 24); ctx.lineTo(x - 34, g - 24); ctx.stroke();
  ell(x, g - 6, 28, 7, '#C9A6E8', '#7E5AA8', 2);
  ctx.strokeStyle = '#7E5AA8'; ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(x + 20, g - 10); ctx.lineTo(x + 24, g - 30); ctx.moveTo(x + 26, g - 10); ctx.lineTo(x + 34, g - 28); ctx.stroke();
  ctx.fillStyle = '#1C2A2E'; rr(x + 18, g - 34, 22, 8, 3); ctx.fill();
  ell(x - 4, g - 22, 17, 17, '#F2A93B', '#8A5A1E', 2.5);
  ctx.strokeStyle = '#8A5A1E'; ctx.lineWidth = 2; ctx.beginPath();
  for (let a = 0; a < 12; a += 0.3) { const r = 1 + a * 1.25; ctx.lineTo(x - 4 + Math.cos(a) * r, g - 22 + Math.sin(a) * r); }
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF'; rr(x - 54, g - 76, 108, 24, 12); ctx.fill(); ctx.strokeStyle = '#1C2A2E'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `13px ${FM}`; ctx.textAlign = 'center'; ctx.fillStyle = '#1C2A2E'; ctx.fillText('bye, slowpoke!', x, g - 59);
}
function drawParts(s) {
  for (const p of s.parts) {
    const a = Math.max(0, p.life / p.max);
    if (p.kind === 'puff') { ctx.globalAlpha = a; ell(p.x, p.y, p.r * (1.6 - a * 0.6), p.r * (1.6 - a * 0.6), p.c); }
    else if (p.kind === 'confetti') { ctx.globalAlpha = Math.min(1, a * 2); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
    else { ctx.globalAlpha = a; ell(p.x, p.y, p.r, p.r, p.c); }
  }
  ctx.globalAlpha = 1;
}
function drawFx(s) {
  for (const f of s.fx) {
    const k = 1 - f.t / f.max, sc = k < 0.12 ? 0.4 + (k / 0.12) * 0.8 : k < 0.2 ? 1.2 - ((k - 0.12) / 0.08) * 0.2 : 1;
    ctx.save(); ctx.globalAlpha = Math.min(1, f.t * 1.6); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(sc, sc);
    label(f.text, 0, 0, f.size, f.color); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
function pill(text, y, bob = 0, color = '#FFE066', size = 22) {
  ctx.font = `bold ${size}px ${FD}`;
  const w = Math.min(W - 40, ctx.measureText(text).width + 56);
  ctx.fillStyle = 'rgba(28,42,46,.82)'; rr(W / 2 + 20 - w / 2, y - 31 + bob, w, 46, 23); ctx.fill();
  label(text, W / 2 + 20, y + bob, size, color, 'center', FD, 5);
}
function drawHud(s, v) {
  if (v.meter != null) {
    const mx = 26, my = 64, mh = 220, mw = 24, up = v.up;
    ctx.fillStyle = 'rgba(28,42,46,.78)'; rr(mx - 10, my - 50, mw + 20, mh + 62, 18); ctx.fill();
    const bx = mx + mw / 2, by = my - 26; // cute brain on top of the meter
    ell(bx - 6, by, 10, 9, '#FF9EC4', '#C2557F', 2); ell(bx + 6, by, 10, 9, '#FF9EC4', '#C2557F', 2); ell(bx, by - 5, 9, 7, '#FFB3D1');
    ctx.fillStyle = '#1C2A2E'; ctx.beginPath(); ctx.arc(bx - 4, by + 1, 1.8, 0, 7); ctx.arc(bx + 4, by + 1, 1.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#2A3B3F'; rr(mx, my, mw, mh, 12); ctx.fill();
    const fh = Math.max(0, mh * v.meter);
    const gr = ctx.createLinearGradient(0, my + mh, 0, my + mh - fh);
    gr.addColorStop(0, up ? '#3FA34D' : '#E07B1F'); gr.addColorStop(1, up ? '#B7F36B' : '#FFC46B');
    if (fh > 1) { ctx.fillStyle = v.held ? 'rgba(200,200,200,.9)' : gr; rr(mx, my + mh - fh, mw, fh, 12); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    for (let i = 0; i < 4; i++) { const p = (s.t * 0.4 + i / 4) % 1, yy = my + mh - p * fh; if (fh > 20) { ctx.beginPath(); ctx.arc(mx + 7 + (i % 2) * 9, yy, 2.5, 0, 7); ctx.fill(); } }
    if (v.goal != null) {
      const ty = my + mh * (1 - v.goal);
      ctx.fillStyle = '#FFFFFF'; rr(mx - 6, ty - 2.5, mw + 12, 5, 2.5); ctx.fill();
      ctx.fillStyle = '#E2483D'; ctx.beginPath(); ctx.moveTo(mx + mw + 8, ty - 1); ctx.lineTo(mx + mw + 8, ty - 15); ctx.lineTo(mx + mw + 22, ty - 9); ctx.lineTo(mx + mw + 8, ty - 5); ctx.fill();
      ctx.font = `bold 12px ${FM}`; ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF'; ctx.fillText('GOAL', mx + mw + 26, ty + 4);
    }
  }
  // right side starts below y 50: the app's top bar sits over the top right corner
  if (v.score != null) {
    ctx.fillStyle = 'rgba(28,42,46,.78)'; rr(W - 136, 56, 120, 40, 20); ctx.fill();
    star(W - 112, 76, 14, '#FFD23F'); label(String(v.score), W - 28, 86, 26, '#FFE066', 'right');
  }
  if (v.stats) {
    ctx.font = `bold 13px ${FM}`;
    const w = ctx.measureText(v.stats).width + 28;
    ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(W - 16 - w, 102, w, 24, 12); ctx.fill();
    ctx.textAlign = 'right'; ctx.fillStyle = '#1C2A2E'; ctx.fillText(v.stats, W - 30, 119);
  }
  // belt pill and time
  const bi = Math.max(0, Math.min(5, (v.belt || 1) - 1));
  const title = v.beltTitle || '';
  ctx.font = `bold 17px ${FD}`;
  const bw = ctx.measureText(title).width + 52;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; rr(84, 14, bw, 30, 15); ctx.fill();
  ell(102, 29, 8, 8, BELT_COLORS[bi], '#1C2A2E', 2);
  ctx.textAlign = 'left'; ctx.fillStyle = '#1C2A2E'; ctx.fillText(title, 116, 35);
  if (v.timeText) {
    ctx.font = `bold 15px ${FM}`;
    ctx.fillStyle = 'rgba(28,42,46,.78)'; rr(84, 50, 70, 24, 12); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.fillText(v.timeText, 119, 67);
  }
  if (s.banner) {
    const a = Math.min(1, s.banner.t * 2), k = 1 + Math.sin(s.t * 10) * 0.03;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2 + 20, 100); ctx.scale(k, k);
    label(s.banner.text, 0, 0, 30, '#FFFFFF', 'center', FD, 8); ctx.restore(); ctx.globalAlpha = 1;
  }
  // Text stays out of the snack lane (y 129-199): titles above it, countdowns and hints down on the road
  if (v.msg) pill(v.msg, 92, 0, '#FFFFFF', 24);
  if (v.sub) pill(v.sub, 338, 0, '#FFE066', 18);
  if (v.hint && !v.frozen) pill(v.hintArrows ? `⬆  ${v.hint}  ⬆` : v.hint, 338, Math.sin(s.t * 8) * 3);
  if (v.frozen) {
    ctx.fillStyle = 'rgba(150,210,245,.35)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 24; i++) { const x = (i * 97 + s.t * 20) % W, y = (i * 53 + s.t * 40 * (1 + (i % 3))) % H; star(x, y, 3 + (i % 3), 'rgba(255,255,255,.9)'); }
    label('FREEZE FRAME!', W / 2 + 40, H / 2 - 30, 40, '#FFFFFF', 'center', FD, 8);
    label('Be a statue... Rex waits for you', W / 2 + 40, H / 2 + 4, 20, '#E6F7FF', 'center', FD, 6);
  }
  if (v.paused) {
    ctx.fillStyle = 'rgba(28,42,46,.55)'; ctx.fillRect(0, 0, W, H);
    label('REX WAITS FOR YOU', W / 2, H / 2 - 10, 36, '#FFFFFF', 'center', FD, 8);
    label('Check the headband', W / 2, H / 2 + 24, 20, '#E6F7FF', 'center', FD, 6);
  }
}

// ---------- one frame ----------
// view: { phase, belt, beltTitle, meter (0..1 or null = hidden), goal, up, held, lowFor, frozen, paused, items[],
//         score, stats, timeText, msg, sub, hint, hintArrows, targetSpeed, dance }
export function drawScene(c, s, v, dt) {
  ctx = c;
  const live = !v.frozen && !v.paused;
  if (live) s.t += dt;
  T = s.t;
  const sleepy = v.phase === 'play' && !v.up && v.lowFor > 1.2 && live;
  // looks only: Rex's speed and the music energy follow the bar
  const target = v.frozen || v.paused ? 0 : v.targetSpeed ?? 120;
  s.speed += (target - s.speed) * Math.min(1, dt * (v.frozen ? 6 : 2.5));
  const eTarget = v.frozen ? 0.1 : v.phase === 'play' ? (v.up ? 1 : v.lowFor > 1.2 ? 0.15 : 0.45) : 0.5;
  s.energy += (eTarget - s.energy) * Math.min(1, dt * 0.8);
  s.off += s.speed * dt;
  if (s.eat > 0) s.eat -= dt;
  if (s.bleh > 0) s.bleh -= dt;
  if (live && v.up && v.phase === 'play') {
    s.dustIn -= dt;
    if (s.dustIn <= 0) {
      s.dustIn = 0.07;
      s.parts.push({ x: REX_X - 70, y: GROUND - 4, vx: -160 - Math.random() * 60, vy: -20 - Math.random() * 30, life: 0.5, max: 0.5, c: 'rgba(255,255,255,.75)', r: 6, kind: 'puff', rot: 0, vr: 0, g: 0 });
    }
  }
  // the snail passes sleepy Rex (a nudge, not a punishment), and drops back when Rex zooms
  if (v.phase !== 'play') s.snail = null;
  else if (live) {
    if (v.lowFor > 1.5 && !s.snail) s.snail = { x: REX_X - 100 };
    if (s.snail) { s.snail.x += (v.up ? -s.speed * 0.6 : 35) * dt; if (s.snail.x < -90 || s.snail.x > W + 70) s.snail = null; }
  }
  if (live) {
    for (const f of s.fx) { f.t -= dt; f.y -= 28 * dt; }
    s.fx = s.fx.filter((f) => f.t > 0);
    for (const p of s.parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt; }
    s.parts = s.parts.filter((p) => p.life > 0);
    if (s.banner) { s.banner.t -= dt; if (s.banner.t <= 0) s.banner = null; }
  }

  drawTown(s, v.up, sleepy);
  for (const it of v.items || []) drawItem(it.kind, it.x, it.y + Math.sin(s.t * 3 + it.bob) * 4, it.missed ? 0.45 : 1);
  if (s.snail) drawSnail(s.snail.x, GROUND - 4);
  drawRex(s, { up: v.up, sleepy, frozen: v.frozen, dance: v.dance });
  drawParts(s);
  drawFx(s);
  drawHud(s, v);
}
