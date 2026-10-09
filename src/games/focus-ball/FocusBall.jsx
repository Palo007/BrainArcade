/* SPDX-License-Identifier: AGPL-3.0-or-later */
// FOCUS BALL — Mendi-style fNIRS neurofeedback game with a shared Session Report.
// Ball height follows the forehead oxygenation index (dHbO - dHbR) from the Muse S Athena.
import React, { useEffect, useRef, useState } from 'react';
import { useFnirs } from '../../hooks/useFnirs.js';
import { computeSessionMetrics } from '../../lib/sessionMetrics.js';
import { SessionReport } from '../../components/SessionReport.jsx';
import '../../styles/retro.css';

const FONT = { fontFamily: "'Press Start 2P', cursive" };
const GOAL = 0.62;
const REST = 0.3;
const START_SCALE = 0.35; // µM of oxygenation index that moves the ball from rest to the top
const BEST_KEY = 'brainarcade.focusBall.best';
const SESSIONS_KEY = 'brainarcade.sessions';
const MAX_SESSIONS = 200;
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
const appendSession = (rec) => {
  try {
    let list = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
    list.push(rec);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
  } catch {
    // ignore (private mode)
  }
};

// Soft drone that rises with the ball + chimes when the streak multiplier grows
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
      const base = 110 * 2 ** (height * 1.5);
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

const ballScreenY = (lift, h) => h * (0.86 - lift * 0.76);

function makeScene(w, h) {
  const rand = (a, b) => a + Math.random() * (b - a);
  return { stars: Array.from({ length: 80 }, () => ({ x: rand(0, w), y: rand(0, h * 0.75), r: rand(0.5, 1.8), p: rand(0, 6.28) })) };
}

function draw(c, scene, s, t) {
  const { width: w, height: h } = c.canvas;
  const dpr = window.devicePixelRatio || 1;
  const lift = s.ballY;

  // Background: night -> sunrise with height
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(mix([8, 10, 40], [70, 110, 210], lift)));
  sky.addColorStop(1, rgb(mix([30, 20, 70], [255, 170, 120], lift)));
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  scene.stars.forEach((st) => {
    c.fillStyle = `rgba(255,255,255,${(0.4 + 0.6 * Math.sin(t * 2 + st.p) ** 2) * (1 - lift * 0.9)})`;
    c.beginPath();
    c.arc(st.x, st.y, st.r * dpr, 0, 6.28);
    c.fill();
  });

  // Goal line
  const goalY = ballScreenY(GOAL, h);
  c.setLineDash([10 * dpr, 10 * dpr]);
  c.strokeStyle = s.above ? 'rgba(255,230,120,0.95)' : 'rgba(255,255,255,0.45)';
  c.lineWidth = 2 * dpr;
  c.beginPath();
  c.moveTo(0, goalY);
  c.lineTo(w, goalY);
  c.stroke();
  c.setLineDash([]);

  // Ball
  const bx = w / 2;
  const by = ballScreenY(lift, h);
  const r = (28 + lift * 12) * dpr;
  const pulse = 1 + Math.sin(t * 3) * 0.05;
  const core = s.paused ? [140, 140, 160] : mix([90, 200, 255], [255, 220, 90], lift);
  c.globalCompositeOperation = 'lighter';
  const halo = c.createRadialGradient(bx, by, r * 0.3, bx, by, r * 3.2 * pulse);
  halo.addColorStop(0, rgb(core, 0.5));
  halo.addColorStop(1, rgb(core, 0));
  c.fillStyle = halo;
  c.beginPath();
  c.arc(bx, by, r * 3.2 * pulse, 0, 6.28);
  c.fill();
  c.globalCompositeOperation = 'source-over';
  const body = c.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.1, bx, by, r * pulse);
  body.addColorStop(0, 'rgba(255,255,255,1)');
  body.addColorStop(0.35, rgb(core, 1));
  body.addColorStop(1, rgb(mix(core, [40, 40, 90], 0.5), 1));
  c.fillStyle = body;
  c.beginPath();
  c.arc(bx, by, r * pulse, 0, 6.28);
  c.fill();

  // Ground
  c.fillStyle = rgb(mix([14, 16, 40], [50, 90, 70], lift));
  c.fillRect(0, h * 0.92, w, h * 0.08);
}

export function FocusBall() {
  const { supported, data, resetBaseline } = useFnirs();
  const [phase, setPhase] = useState('intro'); // intro | calibrate | play | report
  const [cue, setCue] = useState(CUES[0]);
  const [minutes, setMinutes] = useState(3);
  const [hud, setHud] = useState({ points: 0, timeLeft: 180, mult: 1, paused: false });
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(readBest);
  const [report, setReport] = useState(null);

  const canvasRef = useRef(null);
  const dataRef = useRef(null);
  const mutedRef = useRef(muted);
  const phaseRef = useRef(phase);
  const audioRef = useRef(null);
  const stateRef = useRef(null);
  const settingsRef = useRef({ cue, minutes });
  const sawResetRef = useRef(false);

  dataRef.current = data;
  mutedRef.current = muted;
  phaseRef.current = phase;
  settingsRef.current = { cue, minutes };

  // Calibration done -> play. Wait for a fresh not-ready snapshot (old ones still say "ready").
  useEffect(() => {
    if (phase !== 'calibrate' || !data) return;
    if (!data.baselineReady) sawResetRef.current = true;
    else if (sawResetRef.current) {
      const durationSec = settingsRef.current.minutes * 60;
      stateRef.current = {
        ballY: REST, scale: START_SCALE, points: 0, streakSec: 0, mult: 1, elapsed: 0, durationSec,
        above: false, paused: false, samples: [], sampleAcc: 0, chimeStep: 0, ptsAcc: 0,
      };
      setHud({ points: 0, timeLeft: durationSec, mult: 1, paused: false });
      audioRef.current?.chime(mutedRef.current, 0);
      setPhase('play');
    }
  }, [phase, data]);

  // Game loop (timer) + drawing (rAF)
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

    const idle = { ballY: REST, above: false, paused: false };
    let lastTick = performance.now();
    let hudTick = 0;
    const finish = (s) => {
      audioRef.current?.set(0, true);
      const { cue: usedCue, minutes: mins } = settingsRef.current;
      const metrics = computeSessionMetrics(s.samples, { goal: GOAL, durationSec: s.durationSec });
      const points = Math.round(s.points);
      const prevBest = readBest();
      const isNewBest = metrics.score > prevBest;
      if (isNewBest) {
        saveBest(metrics.score);
        setBest(metrics.score);
      }
      appendSession({ date: new Date().toISOString(), game: 'focus-ball', durationSec: mins * 60, cue: usedCue, points, ...metrics });
      setReport({ metrics, points, isNewBest });
      setPhase('report');
    };
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - lastTick) / 1000);
      lastTick = now;
      const s = stateRef.current;
      if (phaseRef.current !== 'play' || !s) {
        idle.ballY = REST + Math.sin(now / 1250) * 0.03;
        return;
      }
      const d = dataRef.current;
      const q = [d?.left?.quality, d?.right?.quality];
      s.paused = q.some((x) => x === 'motion' || x === 'no-light' || x === 'saturated');
      const oxy = d?.oxy ?? 0;
      if (!s.paused) s.scale = Math.max(s.scale, oxy * 0.9); // grows on upswings only, never shrinks
      const target = s.paused ? s.ballY : clamp(REST + 0.7 * (oxy / s.scale), 0.03, 0.97);
      s.ballY = lerp(s.ballY, target, 1 - Math.exp(-dt * 1.2)); // ~1 s easing
      s.above = !s.paused && s.ballY >= GOAL;

      if (!s.paused) {
        s.elapsed += dt;
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
        setHud({ points: s.points, timeLeft: Math.max(0, Math.ceil(s.durationSec - s.elapsed)), mult: s.mult, paused: s.paused });
      }
      if (s.elapsed >= s.durationSec) finish(s);
    };
    const timer = setInterval(tick, 33);

    let raf;
    const frame = (now) => {
      const s = phaseRef.current === 'play' && stateRef.current ? stateRef.current : idle;
      draw(c, scene, s, now / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => () => audioRef.current?.close(), []);

  const begin = () => {
    if (!audioRef.current) audioRef.current = createAudio();
    audioRef.current?.ctx.resume();
    resetBaseline();
    sawResetRef.current = false;
    setPhase('calibrate');
  };

  const panel = 'border-4 border-[var(--nes-yellow)] bg-black/75 px-6 py-5 text-center text-white max-w-lg';
  const btn = 'border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black';
  const chip = (on) =>
    `border-2 px-3 py-2 text-[10px] ${on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-white/60 text-white'}`;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={FONT}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div>
          <h2 className="text-2xl text-[var(--nes-yellow)]">FOCUS BALL</h2>
          {phase === 'play' && <p className="text-[10px] text-gray-200 mt-2">{cue}</p>}
        </div>
        {phase === 'play' && (
          <div className="text-right text-xs space-y-2 mt-16">
            <div>POINTS <span className="text-[var(--nes-yellow)]">{Math.round(hud.points)}</span></div>
            <div>
              {Math.floor(hud.timeLeft / 60)}:{String(hud.timeLeft % 60).padStart(2, '0')}
            </div>
            {hud.mult > 1 && (
              <div className="inline-block border-2 border-[var(--nes-yellow)] bg-black/60 px-2 py-1 text-[var(--nes-yellow)]">STREAK x{hud.mult}</div>
            )}
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

      {phase === 'play' && hud.paused && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 border-2 border-[var(--nes-yellow)] bg-black/70 px-4 py-2 text-xs text-[var(--nes-yellow)]">
          HOLD STILL
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center px-4 pt-24 pb-4 pointer-events-none">
        {phase === 'intro' && (
          <div className={`${panel} pointer-events-auto`}>
            {!supported ? (
              <p className="text-xs leading-relaxed">This game needs a Muse S Athena (fNIRS light sensors).</p>
            ) : (
              <>
                <p className="text-sm leading-relaxed mb-3">Focus on the ball and keep it above the line.</p>
                <p className="text-[9px] text-gray-300 leading-relaxed mb-4">Your brain is slow to show change: wait 3-6 seconds.</p>
                <p className="text-[9px] text-gray-300 mb-2">PICK YOUR FOCUS TRICK</p>
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                  {CUES.map((cc) => (
                    <button key={cc} type="button" className={chip(cue === cc)} onClick={() => setCue(cc)}>{cc}</button>
                  ))}
                </div>
                <p className="text-[9px] text-gray-300 mb-2">SESSION LENGTH</p>
                <div className="flex gap-2 justify-center mb-5">
                  {LENGTHS.map((m) => (
                    <button key={m} type="button" className={chip(minutes === m)} onClick={() => setMinutes(m)}>{m} min</button>
                  ))}
                </div>
                <button type="button" onClick={begin} className={btn}>START</button>
                {best > 0 && <p className="text-[9px] text-gray-400 mt-3">BEST {best}</p>}
              </>
            )}
          </div>
        )}

        {phase === 'calibrate' && (
          <div className={panel}>
            <p className="text-xs mb-3">Relax and breathe slowly…</p>
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
              onPlayAgain={() => setPhase('intro')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
