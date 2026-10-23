import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useEEG } from '../../contexts/MuseContext.jsx';
import { useProcessing } from '../../contexts/ProcessingContext.jsx';
import { useQuality } from '../../contexts/QualityContext.jsx';
import { useBlink } from '../../contexts/BlinkContext.jsx';
import { useProfiles } from '../../contexts/ProfileContext.jsx';
import { usePlaySetup } from '../../contexts/PlaySetupContext.jsx';
import { useSignalPause, takePausedSec } from '../../hooks/useSignalPause.js';
import { recordSession, isDemoMode } from '../../lib/sessionStore.js';
import { RetroModal } from '../../components/RetroModal.jsx';
import { GameStartPanel } from '../../components/GameStartPanel.jsx';
import { GameEndActions } from '../../components/GameEndActions.jsx';
import { ParentReport } from '../../components/ParentReport.jsx';
import '../../styles/retro.css';

import { useFastSignal, freshFrame, blinkHoldMs } from '../../lib/fastSignal.js';
import { roundGoal, safetyNet, isScored, loadDaily, dailyCheck, addUsage, recordDailyUsage } from '../../lib/progressRules.js';
import { makeRoundRecord, toSessionFields } from '../../lib/roundRecord.js';
import { focusOf, pushFocus, zOf, meterOf, makeBaseline, createChecks, DEMO_BASE } from './focusSignal.js';
import { readGate, TAP_HOLD_MS, FREEZE_MIN_MS, SIGNAL_REASONS } from './gate.js';
import {
  BELTS, STORY, WORLDS, RULES, PLAYABLE, isBuilt, dayKey, startDay, goalLevel, roundLen, tapTravelS,
  finishRound, loadProgress, saveProgress, parentCardOf, beltColorName, beltTitle, beltSkill, beltHead, worldName,
} from './progress.js';
import { primeRexAudio, startMusic, stopMusic, setMusicMode, playSfx, say, setMix } from './sounds.js';
import { phrase, line, beltName } from '../../lib/phrases.js';
import { useT, t as tr } from '../../lib/i18n.js';
import { usePhoneTilt } from './tilt.js';
import {
  W, H, LANE_Y, MOUTH_X, SPAWN_X, createScene, drawScene, sceneEat, sceneCombo, sceneFx, sceneBanner, sceneParty,
} from './scene.js';

const GAME = 'turbo-rex';
const FONT = { fontFamily: 'var(--font-retro)' };
const MIX_KEY = 'brainarcade.turboRex.mix';

// All numbers below are START values. The pilot (proposal phase C) and the test day set the real ones.
export const STEP_MS = 33; // game logic timer; requestAnimationFrame only draws
export const HUD_MS = 250; // React state about 4x/s
export const BASELINE_S = 30; // daily watch run, first round of the day: the busy screen is part of "zero"
export const BASELINE_MAX_S = 60;
export const BASELINE_MIN_FRAMES = 160; // 8 frames a second, clean ones only
export const WARMUP_S = 20; // watch run before every later round, at that belt's item speed
export const WARMUP_MAX_S = 40;
export const WARMUP_MIN_FRAMES = 100;
export const WIGGLE_S = 20; // between rounds: moving is the job
export const DEMO_BASELINE_S = 6; // demo mode has no headband: short fake watch run
export const DEMO_WARMUP_S = 4;
export const DEMO_WIGGLE_S = 5;
export const GRACE_S = 0.5; // one noisy frame does not break a focus run
export const COMBO_S = 3; // FOCUS COMBO: a clear win every 3 s above the goal
export const COMBO_POINTS = 5;
export const PIZZA_POINTS = 10; // double when the bar is above the goal
export const BIG_BURP_AT = 5; // pizzas in a row
export const HIT_R = 56; // a tap near an item counts (scene units; about 15 mm on a phone in landscape)
export const SLEEPY_AFTER_S = 1.2; // below the goal this long: Rex yawns
export const FREEZE_MAX_S = 120; // freeze longer than this ends the round early (it still gets its star)
export const OFF_END_S = 60; // headband off longer than this ends the round early (it still gets its star)
export const HINT_COOLDOWN_MS = 20000;
export const HINT_SHOW_MS = 4000;
export const POOR_PAUSED_PCT = 0.7;

const rand = (a, b) => a + Math.random() * (b - a);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Demo mode: a fake focus wave (the mock-up's) so the game plays without a headband
function demoMeter(t) {
  return 0.52 + 0.3 * Math.sin(t * 0.45) + 0.14 * Math.sin(t * 1.9 + 1);
}

// The snack lane: items fly in one lane at Rex's eye height, from the right edge to his mouth, at a steady speed
function newLane(belt, travelS) {
  return { on: !!BELTS[belt - 1]?.taps, items: [], spawnIn: 1.2, travelS, speed: (SPAWN_X - MOUTH_X) / travelS };
}
function stepLane(lane, dt, t, onMiss) {
  if (!lane.on) return;
  lane.spawnIn -= dt;
  if (lane.spawnIn <= 0) {
    lane.spawnIn = lane.travelS * 0.5 + rand(0.4, 1.4); // random gaps between items
    lane.items.push({ kind: 'pizza', x: SPAWN_X, y: LANE_Y, bob: Math.random() * 6, born: t, done: false, missed: false });
  }
  for (const it of lane.items) {
    it.x -= lane.speed * dt;
    if (!it.done && !it.missed && it.x < MOUTH_X) { it.missed = true; onMiss?.(it); }
  }
  lane.items = lane.items.filter((it) => !it.done && it.x > -60);
}

function newRound(belt, lastOfDay, goal, len, tapStep) {
  return {
    belt, lastOfDay, goal, safety: 0, len, t: 0, z: 0, win: [], rawMin: [], lastFrameAt: 0,
    gate: { state: 'ok', reason: null, hint: null }, frozenSec: 0, freezeUntil: 0, offSec: 0,
    liveSec: 0, aboveSec: 0, okSec: 0, heldSec: 0, heldBy: {}, run: 0, grace: 0, longest: 0, upFor: 0, lowFor: 0,
    combos: 0, safetyDone: false, eased: false, score: 0, pizzaRow: 0,
    lane: newLane(belt, tapTravelS(tapStep)), hits: 0, missed: 0, sockTaps: 0, rts: [], tapUntil: 0,
    hintAt: {}, hintText: '', hintUntil: 0, early: false,
  };
}

function loadMix() {
  try {
    const m = JSON.parse(localStorage.getItem(MIX_KEY) || 'null');
    return { music: m?.music !== false, sfx: m?.sfx !== false, voice: m?.voice !== false };
  } catch {
    return { music: true, sfx: true, voice: true };
  }
}

const pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}%`);
const REASON_KEYS = ['muscle', 'neck', 'contact', 'eyes', 'blink', 'eyeMove']; // texts: rex.reason.<id>
const SETUP_KEYS = ['hands', 'stand', 'pc', 'unknown']; // texts: rex.setup.<id>

// The parent's "real change" line: raw focus number per round (line) and its watch run (dots),
// against the fixed first-week reference (band). Raw log units; higher = more beta against alpha + theta.
function RawLine({ line, refStats }) {
  const t = useT();
  const pts = line.filter((p) => Number.isFinite(p.raw) || Number.isFinite(p.watch));
  if (pts.length < 2) return <p className="opacity-70">{t('rex.rawLine.few')}</p>;
  const vals = pts.flatMap((p) => [p.raw, p.watch]).filter(Number.isFinite);
  if (refStats) vals.push(refStats.median - refStats.mad, refStats.median + refStats.mad);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 0.05) { lo -= 0.05; hi += 0.05; }
  const w = 280, h = 90, pad = 6;
  const x = (i) => pad + (i * (w - 2 * pad)) / Math.max(1, pts.length - 1);
  const y = (v) => h - pad - ((v - lo) * (h - 2 * pad)) / (hi - lo);
  const path = pts.map((p, i) => (Number.isFinite(p.raw) ? `${x(i)},${y(p.raw)}` : null)).filter(Boolean).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, background: 'rgba(255,255,255,.06)' }} role="img" aria-label={t('rex.rawLine.aria')}>
        {refStats && (
          <rect x={0} width={w} y={y(refStats.median + refStats.mad)} height={Math.max(1, y(refStats.median - refStats.mad) - y(refStats.median + refStats.mad))} fill="rgba(245,216,58,.18)" />
        )}
        <polyline points={path} fill="none" stroke="#B7F36B" strokeWidth="2" />
        {pts.map((p, i) => (Number.isFinite(p.watch) ? <circle key={i} cx={x(i)} cy={y(p.watch)} r="2.5" fill="#4FB3F2" /> : null))}
      </svg>
      <p className="opacity-70 mt-1">{t(refStats?.fixed ? 'rex.rawLine.legend' : 'rex.rawLine.legendOpen')}</p>
    </div>
  );
}

export function TurboRex() {
  const navigate = useNavigate();
  const t = useT();
  const { ensureBaseline, resetBaseline, isBaselineReady, calibration } = useBaseline();
  const { subscribeEEG, isConnected, profile } = useEEG();
  const { bands } = useProcessing();
  const { adjusting, hasRecentExtreme, quality10s } = useQuality();
  const { onBlink } = useBlink();
  const { activeId } = useProfiles();

  const [started, setStarted] = useState(false);
  const paused = useSignalPause(started);

  const demo = isDemoMode();
  const demoRef = useRef(demo);
  useEffect(() => { demoRef.current = demo; }, [demo]);
  const [progress, setProgress] = useState(() => startDay(loadProgress(activeId)));
  const [daily, setDaily] = useState(() => loadDaily(activeId)); // arcade-wide daily limit (rounds and minutes)
  const [belt, setBelt] = useState(() => progress.unlocked);
  const [mix, setMixState] = useState(loadMix);
  useEffect(() => {
    const p = startDay(loadProgress(activeId));
    setProgress(p);
    setBelt(p.unlocked); // never keep another child's (maybe locked) belt
    setDaily(loadDaily(activeId));
  }, [activeId]);
  const [phase, setPhase] = useState('menu'); // menu | wiggle | baseline | warmup | play | result
  const [hud, setHud] = useState(null);
  const [result, setResult] = useState(null);
  const [modal, setModal] = useState(null); // 'story' | 'parent'
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  // Live from context, so a chip tap on the menu applies to the next round; null when never chosen.
  const playSetup = usePlaySetup();
  const setup = playSetup.asked ? playSetup.setup : null;
  const tiltRef = usePhoneTilt(phase === 'play' && setup !== 'stand' && setup !== 'pc');

  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // A new day can start while the game stays open: apply it when the menu shows and when the page comes back
  useEffect(() => {
    if (phase !== 'menu') return;
    setProgress((p) => startDay(p));
    if (!demo) setDaily(loadDaily(activeId)); // calibration and other games count too
  }, [phase, demo, activeId]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setProgress((p) => startDay(p)); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  useEffect(() => {
    setMix(mix);
    try { localStorage.setItem(MIX_KEY, JSON.stringify(mix)); } catch { /* storage unavailable */ }
  }, [mix]);

  // Everything the game loop needs lives in refs
  const phaseRef = useRef('menu');
  const roundRef = useRef(null);
  const baseRef = useRef(null); // baseline used by the round (its watch run)
  const dailyRef = useRef(null); // { day, base }: the 30 s watch run of today
  const collectRef = useRef({ frames: [], t: 0, lastAt: 0, minS: 0, maxS: 0, minFrames: 0, lane: null });
  const wiggleRef = useRef({ t: 0, len: WIGGLE_S, shoulders: false, next: 'warmup' });
  const playedRef = useRef(false); // a round ended in this visit: the next one starts with a wiggle break
  const checksRef = useRef(createChecks());
  const lastBlinkRef = useRef(0);
  const sceneRef = useRef(createScene());
  const collectSecRef = useRef(0); // watch-run and wiggle seconds of this round, for the daily limit
  const frameRef = useFastSignal(subscribeEEG, isConnected, bands, {
    enabled: phase === 'baseline' || phase === 'warmup' || phase === 'play', blinkRef: lastBlinkRef,
    holdMs: blinkHoldMs(profile),
  });
  const pausedRef = useRef(paused);
  const qualityRef = useRef({ adjusting, hasRecentExtreme });
  const reactivityRef = useRef(calibration?.reactivity);
  const readyRef = useRef(isBaselineReady);
  const setupRef = useRef(setup);
  const finishRef = useRef(null);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { qualityRef.current = { adjusting, hasRecentExtreme }; }, [adjusting, hasRecentExtreme]);
  useEffect(() => { reactivityRef.current = calibration?.reactivity; }, [calibration]);
  useEffect(() => { readyRef.current = isBaselineReady; }, [isBaselineReady]);
  useEffect(() => { setupRef.current = setup; }, [setup]);
  useEffect(() => onBlink(() => { lastBlinkRef.current = performance.now(); }), [onBlink]);
  const go = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);

  const drawRef = useRef({ belt });
  useEffect(() => { drawRef.current = { belt }; }, [belt]);

  const stageRef = useRef(null);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (started) ensureBaseline({ seconds: 30 });
  }, [started, ensureBaseline]);

  useEffect(() => {
    if (phase === 'menu' || phase === 'result') stopMusic();
  }, [phase]);
  useEffect(() => () => { stopMusic(); try { window.speechSynthesis?.cancel(); } catch { /* none */ } }, []);

  // ---- stage size: the 800 x 380 scene fits the stage, drawn sharp on HiDPI screens
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => {
      const bw = Math.max(200, Math.min(el.clientWidth, (el.clientHeight * W) / H));
      const bh = (bw * H) / W;
      const box = boxRef.current;
      if (box) { box.style.width = `${bw}px`; box.style.height = `${bh}px`; }
      const c = canvasRef.current;
      if (c) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        c.width = Math.round(bw * dpr);
        c.height = Math.round(bh * dpr);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- game logic on a 33 ms timer
  useEffect(() => {
    let last = performance.now();
    let hudAt = 0;
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ph = phaseRef.current;
      if (ph !== 'wiggle' && ph !== 'baseline' && ph !== 'warmup' && ph !== 'play') return;
      if (!readyRef.current) return;
      if (ph === 'wiggle') { stepWiggle(dt); if (now - hudAt > HUD_MS) { hudAt = now; pushHud(); } return; }
      const r = roundRef.current;
      if (pausedRef.current) { // headband off: round time stops; after 60 s the round ends early with its star
        setMusicMode({ live: false });
        if (ph === 'play' && r) {
          r.offSec += dt;
          if (r.offSec > OFF_END_S) { r.early = true; finishRef.current?.(); }
        }
        if (now - hudAt > HUD_MS) { hudAt = now; pushHud(); }
        return;
      }
      if (r) r.offSec = 0;
      const q = qualityRef.current;
      const frontalSpike = q.hasRecentExtreme?.(1, 1000) || q.hasRecentExtreme?.(2, 1000);
      // A frame older than STALE_MS means the stream stalled: never score a frozen signal
      const frame = freshFrame(frameRef.current, now);
      if (ph === 'baseline' || ph === 'warmup') stepCollect(ph, dt, frame, q.adjusting || frontalSpike);
      else stepRound(dt, now, frame, q.adjusting || frontalSpike);
      if (now - hudAt > HUD_MS) { hudAt = now; pushHud(); }
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wiggle break between rounds: the signal is not used, moving is the job
  function stepWiggle(dt) {
    const wg = wiggleRef.current;
    wg.t += dt;
    setMusicMode({ energy: 0.8, live: true });
    if (wg.t < wg.len) return;
    collectSecRef.current += wg.t;
    startCollect(wg.next);
    go(wg.next);
  }

  // Watch run: the child holds the phone in the play pose and watches (pizzas fly by on Yellow), no tapping.
  // Its frames are the baseline, so the busy screen is part of "zero".
  function stepCollect(ph, dt, frame, bad) {
    const c = collectRef.current;
    c.t += dt;
    setMusicMode({ energy: 0.5, live: true });
    stepLane(c.lane, dt, c.t);
    // demo mode keeps the (mock) frames too, only for the raw number in the parent card
    if (frame && frame.at !== c.lastAt && (demoRef.current || !bad) && !frame.blink) { c.lastAt = frame.at; c.frames.push(frame); }
    const enough = c.frames.length >= c.minFrames;
    const done = demoRef.current
      ? c.t >= c.minS
      : (c.t >= c.minS && enough) || (c.t >= c.maxS && c.frames.length >= 8);
    if (!done) return;
    const base = demoRef.current
      ? { ...DEMO_BASE, watchRaw: c.frames.length ? makeBaseline(c.frames)?.watchRaw ?? null : null }
      : makeBaseline(c.frames);
    collectSecRef.current += c.t;
    if (ph === 'baseline') dailyRef.current = { day: dayKey(), base };
    baseRef.current = base || dailyRef.current?.base || null;
    checksRef.current.reset();
    takePausedSec(); // pauses while fitting the headband in the watch run do not count against the round
    const r = roundRef.current;
    // the lane keeps flowing into the round; items already close to Rex go, so nobody misses them unfairly
    if (r) { r.lane.items = c.lane.items.filter((it) => it.x > MOUTH_X + 150).map((it) => ({ ...it, born: 0 })); r.lane.spawnIn = c.lane.spawnIn; }
    sceneBanner(sceneRef.current, line(r?.lane.on ? 'rex.goTapBanner' : 'rex.goBanner'), 1.8);
    say(phrase(r?.lane.on ? 'rex.goTap' : 'rex.go'));
    go('play');
  }

  function startCollect(kind) {
    const d = demoRef.current;
    const r = roundRef.current;
    const lane = newLane(r?.belt || 1, r?.lane.travelS || tapTravelS(0));
    collectRef.current = kind === 'baseline'
      ? { frames: [], t: 0, lastAt: 0, minS: d ? DEMO_BASELINE_S : BASELINE_S, maxS: BASELINE_MAX_S, minFrames: BASELINE_MIN_FRAMES, lane }
      : { frames: [], t: 0, lastAt: 0, minS: d ? DEMO_WARMUP_S : WARMUP_S, maxS: WARMUP_MAX_S, minFrames: WARMUP_MIN_FRAMES, lane };
    say(phrase(lane.on ? 'rex.watchPizzas' : 'rex.watch'));
  }

  function stepRound(dt, now, frame, spikeNow) {
    const r = roundRef.current;
    const base = baseRef.current;
    if (!r || !base) return;
    const scene = sceneRef.current;
    const isDemo = demoRef.current;

    const checks = isDemo ? {} : checksRef.current.update(frame, base, dt, now, {
      lastBlinkMs: lastBlinkRef.current, reactivity: reactivityRef.current,
    });
    const s = setupRef.current;
    let g = readGate({
      stale: !isDemo && !frame,
      spike: !isDemo && spikeNow,
      checks,
      blink: !isDemo && !!frame?.blink,
      tap: now < r.tapUntil,
      tilt: tiltRef.current.flat && s !== 'stand' && s !== 'pc',
    });
    // A freeze frame stays at least FREEZE_MIN_MS, so it does not flicker
    if (g.state === 'freeze') {
      if (now >= r.freezeUntil) playSfx('freeze');
      r.freezeUntil = now + FREEZE_MIN_MS;
    } else if (now < r.freezeUntil) {
      g = { state: 'freeze', reason: 'muscle', hint: r.gate.hint };
    }
    r.gate = g;
    // A hint is shown and spoken once, with a soft bell, then quiet for a while
    if (g.hint && g.state !== 'freeze') {
      const lastAt = r.hintAt[g.reason];
      if (lastAt == null || now - lastAt > HINT_COOLDOWN_MS) {
        r.hintAt[g.reason] = now;
        r.hintText = phrase(g.hint);
        r.hintUntil = now + HINT_SHOW_MS;
        playSfx('hint');
        say(r.hintText);
      }
    }
    // Freeze frame: round time stops, items stop, nothing is scored or lost
    if (g.state === 'freeze') {
      r.frozenSec += dt;
      setMusicMode({ frozen: true, live: true });
      if (r.frozenSec > FREEZE_MAX_S) { r.early = true; finishRef.current?.(); }
      return;
    }
    r.t += dt;
    const live = g.state === 'ok' || g.state === 'hint';

    // The focus value: a hold keeps the last one
    const addRaw = (v) => {
      const m = Math.floor(r.t / 60);
      const acc = r.rawMin[m] || (r.rawMin[m] = [0, 0]);
      acc[0] += v; acc[1] += 1;
    };
    if (isDemo) { // the fake wave drives Rex; the mock frames still give the raw number for the parent card
      const zt = (demoMeter(r.t) - 0.5) * 4;
      if (live) r.z += (zt - r.z) * Math.min(1, dt * 2);
      if (frame && !frame.blink && frame.at !== r.lastFrameAt) {
        r.lastFrameAt = frame.at;
        const v = focusOf(frame);
        if (Number.isFinite(v)) addRaw(v);
      }
    } else if (live && frame && frame.at !== r.lastFrameAt) {
      r.lastFrameAt = frame.at;
      const v = focusOf(frame);
      if (Number.isFinite(v)) {
        r.z = zOf(pushFocus(r.win, v), base) ?? r.z;
        addRaw(v);
      }
    }

    // Goal: fixed in the round; safety net once after 45 s; last 20 s of the day's last round a little easier
    const net = r.safetyDone ? null : safetyNet(RULES, { t: r.t, okSec: r.liveSec, successSec: r.aboveSec });
    if (net) {
      r.safetyDone = true; r.safety = net.offset; r.eased = net.eased;
      if (net.offset > 0) sceneBanner(scene, tr('rex.banner.up'), 1.8);
      else if (net.offset < 0) sceneBanner(scene, tr('rex.banner.down'), 1.8);
    }
    const goalZ = roundGoal(RULES, r);
    const up = r.z >= goalZ;

    if (live) {
      r.okSec += dt;
      const scored = isScored(RULES, r); // the day's last 20 s are eased and not scored
      if (scored) { r.liveSec += dt; if (up) r.aboveSec += dt; }
      if (up) {
        r.run += dt; r.grace = 0; r.upFor += dt; r.lowFor = 0;
      } else {
        r.grace += dt;
        if (r.grace > GRACE_S) r.run = 0;
        r.upFor = 0; r.lowFor += dt;
      }
      r.longest = Math.max(r.longest, r.run);
      if (r.upFor >= COMBO_S) {
        r.upFor -= COMBO_S; r.combos += 1; r.score += COMBO_POINTS;
        sceneCombo(scene, tr('rex.combo', { n: COMBO_POINTS }));
        playSfx('chime');
      }
    } else {
      // hold: no reward, no punishment; the combo clock waits. Tap holds are the game's own, not signal.
      r.heldBy[g.reason] = (r.heldBy[g.reason] || 0) + dt;
      if (g.reason !== 'tap') r.heldSec += dt;
    }

    stepLane(r.lane, dt, r.t, () => { r.missed += 1; r.pizzaRow = 0; });
    setMusicMode({ energy: up ? 1 : r.lowFor > SLEEPY_AFTER_S ? 0.15 : 0.45, live: true });

    if (r.t >= r.len) {
      sceneParty(scene);
      playSfx('chime');
      finishRef.current?.();
    }
  }

  function pushHud() {
    const ph = phaseRef.current;
    if (ph === 'wiggle') { const wg = wiggleRef.current; setHud({ sub: ph, left: Math.max(0, Math.ceil(wg.len - wg.t)) }); return; }
    const c = collectRef.current;
    if (ph === 'baseline' || ph === 'warmup') {
      setHud({ sub: ph, left: Math.max(0, Math.ceil(c.minS - c.t)), stuck: !demoRef.current && c.t >= c.maxS });
      return;
    }
    const r = roundRef.current;
    if (r) setHud({ sub: 'play', left: Math.max(0, Math.ceil(r.len - r.t)), gate: r.gate.state });
  }

  // A tap: the value is held for 0.5 s (hands, head and eyes move); a pizza near the tap is eaten
  function onPointerDown(e) {
    const ph = phaseRef.current;
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * W) / rect.width;
    const y = ((e.clientY - rect.top) * H) / rect.height;
    const scene = sceneRef.current;
    if (ph === 'baseline' || ph === 'warmup') {
      if (collectRef.current.lane?.on) sceneFx(scene, tr('rex.fx.justWatch'), x, y - 20, '#FFFFFF', 20);
      return;
    }
    const r = roundRef.current;
    if (ph !== 'play' || !r || r.gate.state === 'freeze' || pausedRef.current || !r.lane.on) return;
    const now = performance.now();
    r.tapUntil = now + TAP_HOLD_MS;
    let best = null, bestD = HIT_R;
    for (const it of r.lane.items) {
      if (it.done || it.missed) continue;
      const d = Math.hypot(x - it.x, y - it.y);
      if (d < bestD) { best = it; bestD = d; }
    }
    if (!best) return;
    best.done = true;
    // reaction time from when the item came on screen
    const onScreenAt = best.born + (SPAWN_X - W) / r.lane.speed;
    if (best.born > 0) r.rts.push(Math.max(0, (r.t - onScreenAt) * 1000));
    r.hits += 1;
    r.pizzaRow += 1;
    const up = r.z >= roundGoal(RULES, r);
    const points = up ? PIZZA_POINTS * 2 : PIZZA_POINTS;
    r.score += points;
    const big = r.pizzaRow >= BIG_BURP_AT && r.pizzaRow % BIG_BURP_AT === 0;
    sceneEat(scene, best.x, best.y, big, points);
    playSfx(big ? 'bigburp' : 'burp');
  }

  // ---- round end: progress, session row (re-bound each render so it sees the latest progress)
  useEffect(() => { finishRef.current = finishRoundNow; });
  function finishRoundNow() {
    const r = roundRef.current;
    if (!r || phaseRef.current !== 'play') return;
    go('result');
    playedRef.current = true;
    const focusPct = r.liveSec > 0 ? r.aboveSec / r.liveSec : 0;
    const pausedSec = takePausedSec();
    const heldPct = r.t > 0 ? r.heldSec / r.t : 0;
    const frozenPct = (r.frozenSec + pausedSec) / Math.max(1, r.t + r.frozenSec + pausedSec);
    const rawByMin = r.rawMin.map((a) => (a && a[1] ? Math.round((a[0] / a[1]) * 1000) / 1000 : null));
    const taps = r.hits + r.missed + r.sockTaps;
    const tapPct = r.lane.on && taps > 0 ? r.hits / taps : null;
    const rtMs = r.rts.length ? Math.round(median(r.rts)) : null;
    // The main reason the signal was held or frozen (muscle = freeze frame)
    const why = { ...Object.fromEntries(SIGNAL_REASONS.map((k) => [k, r.heldBy[k] || 0])), muscle: r.frozenSec };
    const top = Object.keys(why).sort((a, b) => why[b] - why[a])[0];
    const mainReason = why[top] > 1 ? top : null;
    const watchRaw = Number.isFinite(baseRef.current?.watchRaw) ? Math.round(baseRef.current.watchRaw * 1000) / 1000 : null;
    const round = {
      belt: r.belt, sec: Math.round(r.t), focusPct, eased: r.eased, longest: r.longest, tapPct,
      hits: r.hits, missed: r.missed, sockTaps: r.sockTaps, rtMs, heldPct, frozenPct, mainReason,
      rawByMin, watchRaw, setup: setup || undefined,
    };
    const res = finishRound(progress, round);
    if (!demoRef.current) saveProgress(activeId, res.progress);
    setProgress(res.progress);

    const poor = r.t > 0 && pausedSec / Math.max(r.len, r.t) > POOR_PAUSED_PCT;
    // Arcade-wide daily limit: this round plus the watch run and the wiggle break count
    const usage = { game: GAME, rounds: 1, sec: r.t + r.frozenSec + collectSecRef.current };
    collectSecRef.current = 0;
    setDaily(demoRef.current ? addUsage(daily, usage) : recordDailyUsage(activeId, usage));
    const rec = makeRoundRecord({
      game: GAME, level: r.belt, setup, rawByMin, ref: res.progress.ref,
      goal: goalLevel(r.goal), successPct: focusPct, longestStreakS: r.longest, heldPct, frozenPct, stars: res.stars,
    });
    const id = recordSession(GAME, {
      ...toSessionFields(rec),
      score: r.score,
      scoreKind: 'points',
      okSec: Math.round(r.liveSec),
      durationSec: Math.round(r.t),
      playedSec: Math.round(r.t),
      qualityPct: quality10s ? Math.round(quality10s.stablePct * 100) : undefined,
      belt: BELTS[r.belt - 1].name,
      combos: r.combos,
      hits: r.lane.on ? r.hits : undefined,
      missed: r.lane.on ? r.missed : undefined,
      sockTaps: r.lane.on ? r.sockTaps : undefined,
      tapPct: tapPct != null ? Math.round(tapPct * 100) : undefined,
      rtMs: rtMs ?? undefined,
      watchRaw: watchRaw ?? undefined,
      mainReason: mainReason || undefined,
      endedEarly: r.early || undefined,
      ...(poor ? { valid: false, invalidReason: 'bad-quality' } : {}),
    });
    if (res.unlockedBelt) setBelt(res.unlockedBelt);
    say(res.unlockedBelt ? phrase('rex.newBelt', { belt: beltName(BELTS[res.unlockedBelt - 1].name) }) : phrase('rex.great'));
    setResult({ ...res, round, score: r.score, combos: r.combos, sessionId: id, poor, early: r.early });
  }

  const beginRound = useCallback((beltId) => {
    const p = startDay(progress); // a new day may have started while the game stayed open
    if (p !== progress) setProgress(p);
    const d = demoRef.current ? daily : loadDaily(activeId);
    if (d !== daily) setDaily(d);
    const today = dailyCheck(d, GAME);
    if (!today.ok) return;
    const id = Math.min(Math.max(1, beltId), p.unlocked, PLAYABLE);
    roundRef.current = newRound(id, today.lastRound, p.goal, roundLen(id, p), p.tapStep);
    collectSecRef.current = 0;
    checksRef.current.reset();
    sceneRef.current = createScene();
    takePausedSec();
    startMusic();
    const haveDaily = dailyRef.current && dailyRef.current.day === dayKey();
    const next = haveDaily ? 'warmup' : 'baseline';
    if (playedRef.current || p.shortNext) {
      wiggleRef.current = { t: 0, len: demoRef.current ? DEMO_WIGGLE_S : WIGGLE_S, shoulders: p.shortNext, next };
      say(phrase(p.shortNext ? 'rex.shoulders' : 'rex.wiggle'));
      go('wiggle');
    } else {
      startCollect(next);
      go(next);
    }
  }, [progress, go, daily, activeId]);

  const onStart = () => {
    primeRexAudio();
    setStarted(true);
    setResult(null);
    beginRound(belt);
  };

  const recal = () => {
    baseRef.current = null;
    dailyRef.current = null;
    resetBaseline({ forceFull: true });
    setStarted(true);
    ensureBaseline({ seconds: 30, force: true });
  };

  // ---- drawing with requestAnimationFrame (reads refs only)
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const draw = (ts) => {
      raf = requestAnimationFrame(draw);
      const c = canvasRef.current;
      if (!c) return;
      const dt = Math.min(0.1, ((ts || performance.now()) - lastT) / 1000);
      lastT = ts || performance.now();
      const ctx = c.getContext('2d');
      ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
      const ph = phaseRef.current;
      const r = roundRef.current;
      const beltId = r && ph !== 'menu' ? r.belt : drawRef.current.belt;
      const now = performance.now();
      const view = {
        phase: ph, belt: beltId, beltTitle: beltHead(beltId), meter: null, goal: null, up: false,
        lowFor: 0, frozen: false, paused: false, items: [], targetSpeed: 120,
      };
      if (ph === 'wiggle') {
        const wg = wiggleRef.current;
        view.dance = true;
        view.targetSpeed = 0;
        view.msg = wg.shoulders ? tr('rex.msg.shoulders') : tr('rex.msg.wiggle');
        view.sub = tr(wg.shoulders ? 'rex.sub.shoulders' : 'rex.sub.wiggle', { n: Math.max(0, Math.ceil(wg.len - wg.t)) });
      } else if (ph === 'baseline' || ph === 'warmup') {
        const c2 = collectRef.current;
        view.targetSpeed = 150;
        view.items = c2.lane?.items || [];
        view.msg = c2.lane?.on ? tr('rex.msg.watchTap') : tr('rex.msg.watch');
        view.sub = `${Math.max(0, Math.ceil(c2.minS - c2.t))} s`;
        view.paused = pausedRef.current;
      } else if (ph === 'play' && r) {
        const goalZ = roundGoal(RULES, r);
        const left = Math.max(0, Math.ceil(r.len - r.t));
        view.up = r.z >= goalZ;
        view.meter = meterOf(r.z);
        view.goal = meterOf(goalZ);
        view.held = r.gate.state === 'hold' && r.gate.reason !== 'tap';
        view.lowFor = r.lowFor;
        view.frozen = r.gate.state === 'freeze';
        view.paused = pausedRef.current;
        view.items = r.lane.items;
        view.score = r.score;
        view.stats = r.lane.on ? tr('rex.stats.pizzas', { c: r.combos, h: r.hits }) : tr('rex.stats.combo', { c: r.combos });
        view.timeText = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        view.hint = now < r.hintUntil ? r.hintText : '';
        view.hintArrows = r.gate.reason === 'tilt';
        view.targetSpeed = view.up ? 300 : r.lowFor > SLEEPY_AFTER_S ? 50 : 70;
      } else if (ph === 'result') {
        view.targetSpeed = 40;
      }
      drawScene(ctx, sceneRef.current, view, dt);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- screens
  const today = dailyCheck(daily, GAME);
  const roundsLeft = today.ok ? today.roundsLeft : 0;
  const dayDone = !today.ok;
  const chapter = Math.min(progress.unlocked, STORY.length);
  const card = modal === 'parent' ? parentCardOf(progress) : null;
  const toggle = (k) => setMixState((m) => ({ ...m, [k]: !m[k] }));

  const beltButtons = (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {BELTS.map((b) => {
        const built = isBuilt(b.id);
        const open = built && b.id <= progress.unlocked;
        const on = b.id === belt;
        return (
          <button
            key={b.id}
            type="button"
            disabled={!open}
            onClick={() => setBelt(b.id)}
            className={`min-h-[44px] border-2 px-2 py-2 text-[9px] leading-tight text-left ${on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : open ? 'border-white/60 text-white' : 'border-white/20 text-white/30'}`}
          >
            <span className="inline-block w-2 h-2 mr-1 border border-black/60" style={{ background: b.color }} />
            {t(open ? 'rex.beltLabel' : built ? 'rex.beltLocked' : 'rex.beltSoon', { name: beltColorName(b.id) })}
            {open && <span className="block opacity-70 mt-1">{beltTitle(b.id)}</span>}
          </button>
        );
      })}
    </div>
  );

  const goodbye = (
    <div className="text-[10px] text-gray-200 leading-relaxed">
      <p className="text-[var(--nes-yellow)] mb-2">{t('rex.goodbye.title')}</p>
      <p className="mb-2">{t('rex.goodbye.played', { n: today.roundsDone })}</p>
      <p className="mb-4">{t('rex.goodbye.days', { n: progress.days })}</p>
      <button type="button" onClick={() => navigate('/games')} className="border-4 border-white/70 px-4 py-3 text-xs text-white">{t('rex.chooseGame')}</button>
    </div>
  );

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden" ref={stageRef} style={{ background: '#1C2A2E' }}>
        <div ref={boxRef} className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
            aria-label={t('rex.aria')}
          />
        </div>

        {(phase === 'baseline' || phase === 'warmup') && hud?.stuck && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center z-10 px-4 pointer-events-none">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px] text-white text-center max-w-sm" style={FONT}>
              {t('rex.noSignal')}
            </div>
          </div>
        )}

        {started && !isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={FONT}>
              {t('rex.waitBaseline')}
            </div>
          </div>
        )}

        {phase === 'menu' && (
          <GameStartPanel title="TURBO REX" onStart={dayDone ? undefined : onStart} onRecalibrate={dayDone ? undefined : recal}>
            {dayDone ? goodbye : (
              <>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-2">
                  {t('rex.intro')}
                </p>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-2">{beltSkill(belt)}</p>
                {setup !== 'stand' && setup !== 'pc' && (
                  <p className="text-[9px] text-[var(--nes-yellow)] leading-relaxed mb-3">
                    {t('rex.nest')}
                  </p>
                )}
                {portrait && <p className="text-[9px] text-[var(--nes-cyan)] mb-3">{t('rex.portrait')}</p>}
                {beltButtons}
                <div className="mb-3 text-[9px]">
                  <p className="mb-1 text-gray-300">{t('rex.sound')}</p>
                  <div className="flex justify-center gap-1">
                    {['music', 'sfx', 'voice'].map((k) => (
                      <button key={k} type="button" aria-pressed={mix[k]} onClick={() => toggle(k)}
                        className={`min-h-[44px] border-2 px-2 ${mix[k] ? 'border-[var(--nes-green)] text-[var(--nes-green)]' : 'border-white/30 text-white/50'}`}>
                        {t(`rex.mix.${k}.${mix[k] ? 'on' : 'off'}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-3 text-[9px] text-gray-200 mb-3">
                  <span className="text-[var(--nes-yellow)]">★ {progress.stars}</span>
                  <span>{t('rex.stat.days', { n: progress.days })}</span>
                  <span>{t('rex.stat.roundsLeft', { n: roundsLeft })}</span>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  <button type="button" onClick={() => setModal('story')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">{t('rex.story')}</button>
                  <button type="button" onClick={() => setModal('parent')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">{t('rex.parentCard')}</button>
                </div>
                {demo && <p className="text-[8px] opacity-70 mb-2">{t('rex.demoNote')}</p>}
              </>
            )}
          </GameStartPanel>
        )}
      </div>

      {phase === 'result' && result && (
        <RetroModal title={t('rex.roundDone')} showFooter={false} onCancel={() => go('menu')}>
          <div style={FONT} className="text-center">
            <div className="text-2xl text-[var(--nes-yellow)] mb-2">{'★'.repeat(result.stars)}</div>
            <p className="text-[10px] mb-1">
              {result.early ? t('rex.roundEarly') : t('rex.roundFinished')}
            </p>
            <p className="text-[9px] mt-2">{t('rex.result.points', { score: result.score, n: result.combos })}</p>
            {result.round.tapPct != null && <p className="text-[9px] mt-1">{t('rex.result.pizzas', { n: result.round.hits })}</p>}
            <p className="text-[9px] mt-1">{t('rex.result.longest', { n: Math.round(result.round.longest) })}</p>
            {result.unlockedBelt && (
              <div className="border-2 border-[var(--nes-yellow)] p-2 mt-3 text-[9px] text-left">
                <p className="text-[var(--nes-yellow)] mb-1">{t('rex.newBeltUp', { name: beltColorName(result.unlockedBelt) })}</p>
                <p className="leading-relaxed">{t(STORY[result.unlockedBelt - 1])}</p>
              </div>
            )}
            {result.practiceOffer && <p className="text-[9px] mt-3">{t('rex.practice')}</p>}
            {result.poor && <p className="text-[8px] text-[var(--nes-yellow)] mt-2">{t('rex.poor')}</p>}
            {demo && <p className="text-[8px] opacity-70 mt-2">{t('rex.demoNotSaved')}</p>}
            <div className="mt-4">
              {!dayDone ? (
                <GameEndActions onPlayAgain={() => go('menu')} sessionId={result.sessionId} game={GAME} seconds={result.round.sec} />
              ) : (
                <>
                  <button type="button" onClick={() => go('menu')} className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)]">{t('rex.seeYou')}</button>
                  <div className="mt-4 text-left"><ParentReport sessionId={result.sessionId} game={GAME} seconds={result.round.sec} /></div>
                </>
              )}
            </div>
          </div>
        </RetroModal>
      )}

      {modal === 'story' && (
        <RetroModal title={t('rex.chapter', { n: chapter })} cancelLabel={t('rex.close')} onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="text-[var(--nes-yellow)] mb-2">{t('rex.chapterHead', { belt: beltColorName(chapter), world: worldName(WORLDS[0].id) })}</p>
            <p>{t(STORY[chapter - 1])}</p>
          </div>
        </RetroModal>
      )}

      {modal === 'parent' && card && (
        <RetroModal title={t('rex.parentCard')} cancelLabel={t('rex.close')} onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="mb-2 opacity-80">{t('rex.card.intro')}</p>
            <p>{t('rex.card.rounds', { r: card.rounds, n: card.days })}</p>
            <p className="mt-2 text-[var(--nes-yellow)]">{t('rex.card.realChange')}</p>
            <p className="mb-1">{t('rex.card.realText')}</p>
            <RawLine line={card.line} refStats={card.ref} />
            <p className="mt-2 text-[var(--nes-yellow)]">{t('rex.card.tuning')}</p>
            <p>
              {card.goalSteps === 0 ? t('rex.card.goalSame')
                : t(card.goalSteps > 0 ? 'rex.card.goalHarder' : 'rex.card.goalEasier', { n: Math.abs(card.goalSteps) })}
            </p>
            <p>{t('rex.card.focusTime', { v: pct(card.focusPct) })}</p>
            <p>{t('rex.card.longest', { n: Math.round(card.longest) })}</p>
            <p className="mt-2 text-[var(--nes-yellow)]">{t('rex.card.taps')}</p>
            {card.tapPct == null ? <p>{t('rex.card.tapsLater')}</p> : (
              <>
                <p>{t('rex.card.tapsLine', { a: pct(card.tapPct), h: card.hits, m: card.missed, s: card.sockTaps })}</p>
                <p>{t('rex.card.rt', { v: card.rtMs == null ? '-' : `${Math.round(card.rtMs)} ms` })}</p>
              </>
            )}
            <p className="mt-2 text-[var(--nes-yellow)]">{t('rex.card.quality')}</p>
            <p>{t('rex.card.held', { a: pct(card.heldPct), b: pct(card.frozenPct) })}</p>
            <p>{t('rex.card.reason', { v: card.mainReason ? (REASON_KEYS.includes(card.mainReason) ? t(`rex.reason.${card.mainReason}`) : card.mainReason) : '-' })}</p>
            <p className="opacity-80">{t('rex.card.fixPose')}</p>
            <p className="mt-2">{t('rex.card.setup', { v: Object.entries(card.setups).map(([k, n]) => `${SETUP_KEYS.includes(k) ? t(`rex.setup.${k}`) : k} ${n}`).join(', ') || '-' })}</p>
            <p className="mt-2 text-[var(--nes-yellow)]">{t('rex.card.stars')}</p>
          </div>
        </RetroModal>
      )}
    </div>
  );
}
