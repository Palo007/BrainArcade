/* SPDX-License-Identifier: AGPL-3.0-or-later */
// GLOW ORB — fNIRS neurofeedback game (Mendi-style).
// The orb height follows the forehead oxygenation index (ΔHbO − ΔHbR) from the Muse S Athena.
// Think hard → more fresh-oxygen blood in the forehead → the orb flies up.
import React, { useEffect, useRef, useState } from 'react';
import { useFnirs } from '../../hooks/useFnirs.js';
import { recordSession } from '../../lib/sessionStore.js';
import { GameEndActions } from '../../components/GameEndActions.jsx';
import { GameStartPanel, OptionLabel, startChip } from '../../components/GameStartPanel.jsx';
import '../../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };
const ROUND_S = 120; // default round length
const LENGTHS = [2, 3, 5, 10]; // same choices as Focus Ball
const CUES = ['Count back by 3s', 'Stay calm and focused'];
const GOAL = 0.62; // orb height (0 bottom … 1 top) that counts as "flying"
const START_SCALE = 0.35; // µM of oxygenation index that moves the orb from rest to the top
const BEST_KEY = 'glowOrbBest';
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

// Soft drone that rises with the orb + chimes when it flies
function createAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
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
      const base = 110 * 2 ** (height * 1.5); // 110 → ~311 Hz
      oscs.forEach(({ o, ratio }) => o.frequency.setTargetAtTime(base * ratio, t, 0.25));
      filter.frequency.setTargetAtTime(400 + height * 2400, t, 0.3);
      master.gain.setTargetAtTime(muted ? 0 : 0.05 + height * 0.07, t, 0.3);
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
    close() {
      ctx.close().catch(() => {});
    },
  };
}

// Orb height 0..1 → canvas y; the lowest point stays above the hills
const orbScreenY = (lift, h) => h * (0.66 - lift * 0.56);

function makeScene(w, h) {
  const rand = (a, b) => a + Math.random() * (b - a);
  return {
    stars: Array.from({ length: 90 }, () => ({ x: rand(0, w), y: rand(0, h * 0.75), r: rand(0.5, 1.8), p: rand(0, 6.28) })),
    clouds: Array.from({ length: 5 }, (_, i) => ({ x: rand(0, w), y: rand(h * 0.15, h * 0.6), s: rand(0.6, 1.4), v: rand(6, 16) * (i % 2 ? 1 : 0.7) })),
    hills: [0.78, 0.86].map((base, layer) =>
      Array.from({ length: 9 }, (_, i) => ({ x: (i / 8) * w, y: h * base - rand(10, 60) * (layer ? 0.6 : 1) }))
    ),
    particles: [],
  };
}

function draw(c, scene, s, t, dt) {
  const { width: w, height: h } = c.canvas;
  const dpr = window.devicePixelRatio || 1;
  const lift = s.orbY; // 0..1

  // Sky: night → sunrise as the orb rises
  const top = mix([8, 10, 40], [70, 110, 210], lift);
  const bottom = mix([30, 20, 70], [255, 170, 120], lift);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(top));
  sky.addColorStop(1, rgb(bottom));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  // Stars fade as the sky gets brighter
  scene.stars.forEach((st) => {
    const a = (0.4 + 0.6 * Math.sin(t * 2 + st.p) ** 2) * (1 - lift * 0.9);
    c.fillStyle = `rgba(255,255,255,${a})`;
    c.beginPath();
    c.arc(st.x, st.y, st.r * dpr, 0, 6.28);
    c.fill();
  });

  // Clouds drift
  scene.clouds.forEach((cl) => {
    cl.x += cl.v * dt * dpr;
    if (cl.x > w + 150 * dpr) cl.x = -150 * dpr;
    c.fillStyle = `rgba(255,255,255,${0.06 + lift * 0.22})`;
    c.beginPath();
    [[0, 0, 40], [35, -12, 32], [70, 0, 36], [35, 8, 34]].forEach(([dx, dy, r]) => {
      const x = cl.x + dx * cl.s * dpr, y = cl.y + dy * cl.s * dpr;
      c.moveTo(x + r * cl.s * dpr, y);
      c.arc(x, y, r * cl.s * dpr, 0, 6.28);
    });
    c.fill('nonzero');
  });

  // Goal line
  const goalY = orbScreenY(GOAL, h);
  c.setLineDash([10 * dpr, 10 * dpr]);
  c.strokeStyle = s.flying ? 'rgba(255,230,120,0.9)' : 'rgba(255,255,255,0.35)';
  c.lineWidth = 2 * dpr;
  c.beginPath();
  c.moveTo(0, goalY);
  c.lineTo(w, goalY);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = s.flying ? 'rgba(255,230,120,1)' : 'rgba(255,255,255,0.6)';
  c.font = `${10 * dpr}px 'Atkinson Hyperlegible Mono Variable', ui-monospace, monospace`;
  c.fillText('★ FLY ZONE', 12 * dpr, goalY - 8 * dpr);

  // Orb
  const ox = w / 2 + Math.sin(t * 0.7) * 30 * dpr;
  const oy = orbScreenY(lift, h);
  const r = (26 + lift * 10) * dpr;
  const pulse = 1 + Math.sin(t * 3) * 0.06;
  const core = s.paused ? [140, 140, 160] : mix([90, 200, 255], [255, 220, 90], lift);

  // Particles: trail always, sparkles while flying
  const emit = s.paused ? 0 : s.flying ? 6 : 2;
  for (let i = 0; i < emit; i++) {
    const ang = Math.random() * 6.28;
    scene.particles.push({
      x: ox + Math.cos(ang) * r * 0.5,
      y: oy + Math.sin(ang) * r * 0.5,
      vx: (Math.random() - 0.5) * 40 * dpr,
      vy: (s.flying ? -20 + Math.random() * -60 : 30 + Math.random() * 40) * dpr,
      life: 1,
      c: s.flying && Math.random() < 0.5 ? [255, 255, 255] : core,
      size: (Math.random() * 3 + 1.5) * dpr,
    });
  }
  scene.particles = scene.particles.filter((p) => (p.life -= dt * 0.9) > 0);
  if (scene.particles.length > 600) scene.particles.splice(0, scene.particles.length - 600);
  c.globalCompositeOperation = 'lighter';
  scene.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    c.fillStyle = rgb(p.c, p.life * 0.8);
    c.beginPath();
    c.arc(p.x, p.y, p.size * p.life, 0, 6.28);
    c.fill();
  });

  const halo = c.createRadialGradient(ox, oy, r * 0.3, ox, oy, r * (2.6 + lift * 1.5) * pulse);
  halo.addColorStop(0, rgb(core, 0.55));
  halo.addColorStop(1, rgb(core, 0));
  c.fillStyle = halo;
  c.beginPath();
  c.arc(ox, oy, r * 4.2 * pulse, 0, 6.28);
  c.fill();
  c.globalCompositeOperation = 'source-over';

  const body = c.createRadialGradient(ox - r * 0.35, oy - r * 0.35, r * 0.1, ox, oy, r * pulse);
  body.addColorStop(0, 'rgba(255,255,255,1)');
  body.addColorStop(0.35, rgb(core, 1));
  body.addColorStop(1, rgb(mix(core, [40, 40, 90], 0.5), 1));
  c.fillStyle = body;
  c.beginPath();
  c.arc(ox, oy, r * pulse, 0, 6.28);
  c.fill();

  // Hills in front
  scene.hills.forEach((pts, layer) => {
    c.fillStyle = rgb(mix(layer ? [10, 12, 30] : [20, 22, 50], layer ? [40, 70, 60] : [70, 110, 90], lift));
    c.beginPath();
    c.moveTo(0, h);
    pts.forEach((p, i) => {
      if (i === 0) c.lineTo(p.x, p.y);
      else {
        const prev = pts[i - 1];
        c.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
      }
    });
    c.lineTo(w, pts[pts.length - 1].y);
    c.lineTo(w, h);
    c.fill();
  });
}

export function GlowOrb() {
  const { supported, data, resetBaseline } = useFnirs();
  const [phase, setPhase] = useState('intro'); // intro | calibrate | play | done
  const [hud, setHud] = useState({ score: 0, timeLeft: ROUND_S, flyPct: 0, paused: false });
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(readBest);
  const [savedId, setSavedId] = useState(null);
  const [cue, setCue] = useState(CUES[0]);
  const [minutes, setMinutes] = useState(ROUND_S / 60);

  const canvasRef = useRef(null);
  const dataRef = useRef(null);
  const mutedRef = useRef(muted);
  const phaseRef = useRef(phase);
  const audioRef = useRef(null);
  const stateRef = useRef(null);

  dataRef.current = data;
  mutedRef.current = muted;
  phaseRef.current = phase;

  // Calibration done → start playing. Wait until a fresh snapshot shows the reset (old ones still say "ready").
  const sawResetRef = useRef(false);
  useEffect(() => {
    if (phase !== 'calibrate' || !data) return;
    if (!data.baselineReady) sawResetRef.current = true;
    else if (sawResetRef.current) {
      stateRef.current = { orbY: 0.3, scale: START_SCALE, score: 0, flyTime: 0, elapsed: 0, flying: false, chimeStep: 0, lastChime: 0, roundS: minutes * 60, cue };
      audioRef.current?.chime(mutedRef.current, 0);
      setPhase('play');
    }
  }, [phase, data, minutes, cue]);

  // Render + game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const c = canvas.getContext('2d');
    let scene = null;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      scene = makeScene(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Game logic on a timer (keeps running even when frames are throttled); drawing on animation frames
    const idle = { orbY: 0.3, flying: false, paused: false };
    let lastTick = performance.now();
    let hudTick = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - lastTick) / 1000);
      lastTick = now;
      const t = now / 1000;
      const s = stateRef.current;
      if (phaseRef.current !== 'play' || !s) {
        idle.orbY = 0.3 + Math.sin(t * 0.8) * 0.04;
        return;
      }
      const d = dataRef.current;
      const q = [d?.left?.quality, d?.right?.quality];
      s.paused = q.some((x) => x === 'motion' || x === 'no-light' || x === 'saturated');
      const oxy = d?.oxy ?? 0;
      if (!s.paused) {
        // Grows with strong upswings (top stays reachable); relaxes back to the start range over ~30 s,
        // so one odd spike cannot make the round unwinnable
        s.scale += (START_SCALE - s.scale) * (1 - Math.exp(-dt / 30));
        s.scale = Math.max(s.scale, oxy * 0.9);
      }
      const target = s.paused ? s.orbY : clamp(0.3 + 0.7 * (oxy / s.scale), 0.03, 0.97);
      s.orbY = lerp(s.orbY, target, 1 - Math.exp(-dt * 1.2));
      const wasFlying = s.flying;
      s.flying = !s.paused && s.orbY >= GOAL;
      s.elapsed += dt;
      if (s.flying) {
        s.flyTime += dt;
        s.score += dt * 10 * (1 + s.orbY);
        if (!wasFlying || t - s.lastChime > 5) {
          audioRef.current?.chime(mutedRef.current, ++s.chimeStep);
          s.lastChime = t;
        }
      }
      audioRef.current?.set(s.orbY, mutedRef.current || s.paused);
      const done = s.elapsed >= s.roundS;
      if ((hudTick += dt) > 0.25 || done) {
        hudTick = 0;
        setHud({
          score: Math.round(s.score),
          timeLeft: Math.max(0, Math.ceil(s.roundS - s.elapsed)),
          flyPct: Math.round((s.flyTime / Math.max(1, s.elapsed)) * 100),
          paused: s.paused,
        });
      }
      if (done) {
        audioRef.current?.set(0, true);
        setPhase('done');
      }
    };
    const timer = setInterval(tick, 33);

    let raf;
    let lastFrame = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const s = phaseRef.current === 'play' && stateRef.current ? stateRef.current : idle;
      draw(c, scene, s, now / 1000, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Save best score at the end (history row is written once per round)
  const recordedRef = useRef(false);
  useEffect(() => { if (phase !== 'done') recordedRef.current = false; }, [phase]);
  useEffect(() => {
    if (phase !== 'done') return;
    const score = Math.round(stateRef.current?.score || 0);
    if (!recordedRef.current) setSavedId(recordSession('glow-orb', { score, durationSec: stateRef.current?.roundS || ROUND_S, cue: stateRef.current?.cue, playedSec: Math.round(stateRef.current?.elapsed || 0), timeAbovePct: Math.round((stateRef.current?.flyTime || 0) / Math.max(1, stateRef.current?.elapsed || 1) * 100), fnirsUsed: !!dataRef.current?.available }));
    recordedRef.current = true;
    if (score > best) {
      setBest(score);
      saveBest(score);
    }
  }, [phase, best]);

  useEffect(() => () => audioRef.current?.close(), []);

  const start = () => {
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current?.ctx.resume();
    resetBaseline();
    sawResetRef.current = false;
    setHud({ score: 0, timeLeft: minutes * 60, flyPct: 0, paused: false });
    setPhase('calibrate');
  };
  const stop = () => {
    stateRef.current = null; // abandon without saving
    audioRef.current?.set(0, true);
    setPhase('intro');
  };

  const stars = hud.flyPct >= 60 ? 3 : hud.flyPct >= 35 ? 2 : hud.flyPct >= 15 ? 1 : 0;
  const panel = 'border-4 border-[var(--nes-yellow)] bg-black/75 px-6 py-5 text-center text-white max-w-md';

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={FONT}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div>
          <h2 className="text-2xl text-[var(--nes-yellow)]">GLOW ORB</h2>
          <p className="text-[10px] text-gray-200 mt-2">{phase === 'play' ? stateRef.current?.cue : 'Think hard to make the orb fly!'}</p>
        </div>
        {phase === 'play' && (
          <div className="text-right text-[10px] space-y-2 mt-16">
            <div>SCORE <span className="text-[var(--nes-yellow)]">{hud.score}</span></div>
            <div>TIME {hud.timeLeft}s</div>
            <div>FLYING {hud.flyPct}%</div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-6 right-6 border-2 border-white/60 bg-black/60 px-3 py-2 text-[10px] text-white"
      >
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>

      {(phase === 'calibrate' || phase === 'play') && (
        <button
          type="button"
          onClick={stop}
          className="absolute bottom-6 left-6 border-2 border-white/60 bg-black/60 px-3 py-2 text-[10px] text-white hover:bg-white hover:text-black"
        >
          STOP
        </button>
      )}

      {phase === 'play' && hud.paused && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 border-2 border-[var(--nes-yellow)] bg-black/70 px-4 py-2 text-[10px] text-[var(--nes-yellow)]">
          HOLD STILL — FIX THE HEADBAND
        </div>
      )}

      {phase === 'intro' && (
        <GameStartPanel
          title="GLOW ORB"
          onStart={supported ? start : undefined}
          best={best}
          signalNote="Only the fNIRS sensors matter here."
        >
          {!supported ? (
            <p className="text-xs leading-relaxed mb-3">This game needs a Muse S Athena (fNIRS light sensors).</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed mb-3">Think hard to make the orb fly up.</p>
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
          <div className={panel}>
            <p className="text-[10px] mb-3">Relax and breathe slowly…</p>
            <div className="h-3 w-64 mx-auto border-2 border-[var(--nes-yellow)]">
              <div className="h-full bg-[var(--nes-yellow)]" style={{ width: `${Math.round((data?.baselineProgress || 0) * 100)}%` }} />
            </div>
            {!data?.available && <p className="text-[8px] text-gray-400 mt-3">Waiting for light sensors…</p>}
          </div>
        )}

        {phase === 'done' && (
          <div className={`${panel} pointer-events-auto max-h-full overflow-y-auto`}>
            <p className="text-sm text-[var(--nes-yellow)] mb-3">{['NICE TRY!', 'GOOD JOB!', 'GREAT!', 'AMAZING!'][stars]}</p>
            <p className="text-2xl mb-3 text-[var(--nes-yellow)]">{'★'.repeat(stars)}<span className="text-gray-600">{'★'.repeat(3 - stars)}</span></p>
            <p className="text-[10px] mb-1">SCORE {hud.score}</p>
            <p className="text-[10px] mb-4">FLYING {hud.flyPct}% OF THE TIME</p>
            {best > 0 && <p className="text-[8px] text-gray-400 mb-4">BEST {best}</p>}
            <GameEndActions onPlayAgain={() => setPhase('intro')} sessionId={savedId} game="glow-orb" />
          </div>
        )}
      </div>
    </div>
  );
}
