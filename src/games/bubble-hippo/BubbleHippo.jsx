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
import { GameHint } from '../../components/GameHint.jsx';
import '../../styles/retro.css';

import { useFastSignal, freshFrame, blinkHoldMs } from '../../lib/fastSignal.js';
import { roundGoal, safetyNet, isScored, loadDaily, dailyCheck, addUsage, recordDailyUsage } from '../../lib/progressRules.js';
import { makeRoundRecord, toSessionFields } from '../../lib/roundRecord.js';
import { calmOf, pushCalm, zOf, meterOf, makeBaseline, createChecks, DEMO_BASE } from './calmSignal.js';
import { readGate, GIGGLE_GAP_MS } from './gate.js';
import {
  BADGES, WORLDS, STORY, BATH_BOMBS, RULES, dayKey, startDay, goalLevel, pacerRate, playWeeks, whaleDaysOf,
  finishRound, badgeFeatures, loadProgress, saveProgress,
} from './progress.js';
import { primeBubbleAudio, startMusic, stopMusic, setMusicMode, playSfx, say, setMix } from './sounds.js';
import { W, H, createScene, drawScene, triggerLaunch, triggerToot } from './scene.js';

const GAME = 'bubble-hippo';
const FONT = { fontFamily: 'var(--font-retro)' };
const MIX_KEY = 'brainarcade.bubbleHippo.mix';

// All numbers below are START values. The test day sets the real ones.
export const STEP_MS = 33; // game logic timer; requestAnimationFrame only draws
export const HUD_MS = 250; // React state about 4x/s
export const BASELINE_S = 60; // daily baseline, first round of the day
export const BASELINE_MAX_S = 90;
export const BASELINE_MIN_FRAMES = 200; // 8 frames a second
export const WARMUP_MIN_S = 20; // re-baseline before every round
export const WARMUP_MAX_S = 40;
export const WARMUP_MIN_FRAMES = 80;
export const DEMO_BASELINE_S = 8; // demo mode has no headband: short fake baseline and warm-up
export const DEMO_WARMUP_S = 4;
export const GROW_S = 14; // calm seconds that fill a bubble
export const SHRINK_S = 45; // seconds an empty-calm bubble needs to shrink from full: it shrinks slowly
export const BUBBLE_MIN = 0.08; // the bubble never pops
export const BUBBLE_AFTER_LAUNCH = 0.15;
export const GRACE_S = 0.5; // one noisy frame does not break a calm hold
export const DUCK_EVERY_S = 20; // calm seconds before the rooster calls
export const DUCK_TIME_S = 12;
export const NO_DUCK_LAST_S = 30; // no duck time in the last 30 s of a round
export const ANSWER_MAX_S = 10;
export const ANSWER_AFTER_S = 2.6;
export const SETTLE_STAY_S = 3; // meter must stay above the goal this long
export const SETTLE_DIP_Z = 0.2; // a real dip = meter 0.05 below the goal line (0.2 z)
export const SETTLE_DIP_WINDOW_S = 4; // the dip must show up in this time after the answer, else no settle is measured
export const SETTLE_CAP_S = 30;
export const SECRET_MIN_S = 10; // secret bubble: 10 s, growing to 20 s
export const SECRET_MAX_S = 20;
export const SECRET_EVERY_S = 25;
export const PEST_S = 14;
export const PEST_EVERY_S = 14;
export const FREEZE_MAX_S = 120; // a bath break longer than this ends the round early (it still gets its star)
export const OFF_END_S = 60; // headband off longer than this ends the round early (it still gets its star)
export const HINT_COOLDOWN_MS = 25000;
export const HINT_SHOW_MS = 4000;
export const POOR_PAUSED_PCT = 0.7;

const rand = (a, b) => a + Math.random() * (b - a);
const BOMB_SCENE = { banana: 'banana', 'bubble-gum': 'bubblegum', 'old-cheese': 'cheese', 'dads-socks': 'socks' };
const PEST_SOUND = { fly: ['buzz', 2.5], sock: ['foamIn', 5], swan: ['honk', 6] };

// Demo mode: a fake calm wave (like the mock-up simTarget) so the game plays without a headband
function demoTarget(r) {
  const t = r.t;
  if (r.sub === 'duck' || r.sub === 'answer') return 0.3 + 0.05 * Math.sin(t * 1.3);
  let v = 0.62 + 0.16 * Math.sin(t * 0.31) + 0.07 * Math.sin(t * 1.7 + 1);
  if (r.demoDipFrom != null && t - r.demoDipFrom < 6) v -= 0.38 * (1 - (t - r.demoDipFrom) / 6);
  if (r.pest?.type === 'fly') v -= 0.14;
  if (r.pest?.type === 'swan') v -= 0.12;
  return v;
}

function newRound(badge, warm, lastOfDay, goal, weeks, whaleDays) {
  const b = BADGES[badge - 1];
  return {
    badge, warm, lastOfDay, goal, safety: 0, len: b.sec, weeks, whaleDays,
    t: 0, z: 0, calmWin: [], calmMin: [], lastFrameAt: 0, gate: { state: 'ok', reason: null, hint: null },
    sub: 'calm', subT: 0, calmTimer: 0, giggleUntil: 0, frozenSec: 0, offSec: 0,
    bubble: BUBBLE_AFTER_LAUNCH, launches: 0, safetyDone: false, eased: false,
    liveSec: 0, aboveSec: 0, heldSec: 0, run: 0, grace: 0, longest: 0,
    pestLive: 0, pestAbove: 0, noPestLive: 0, noPestAbove: 0, secLive: 0, secAbove: 0,
    duckN: 0, duckAt: [], ducksPopped: 0, answered: null, answerAt: null, ducksRight: 0, ducksTotal: 0,
    settle: null, settleTimes: [], demoDipFrom: null,
    secret: null, secretCount: 0, nextSecret: 30 + Math.random() * 10,
    pest: null, nextPest: 15 + Math.random() * 10, pestSoundAt: 0,
    breathT: 0, hintAt: {}, hintText: '', hintUntil: 0, msg: '', early: false,
  };
}

// 7-day card for parents, from the saved round history
function parentCardOf(p) {
  const since = Date.now() - 7 * 864e5;
  const h = (p.history || []).filter((x) => new Date(x.date).getTime() >= since);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const times = h.flatMap((x) => x.settleTimes || []);
  const right = h.reduce((a, x) => a + (x.ducksRight || 0), 0);
  const total = h.reduce((a, x) => a + (x.ducksTotal || 0), 0);
  return {
    rounds: h.length,
    days: new Set(h.map((x) => x.date.slice(0, 10))).size,
    calmPct: avg(h.map((x) => x.successPct).filter(Number.isFinite)),
    longestHold: h.reduce((a, x) => Math.max(a, x.longestStreakS || 0), 0),
    settle: avg(times),
    duck: total ? `${right} of ${total}` : null,
    secretPct: avg(h.map((x) => x.secretPct).filter(Number.isFinite)),
    pestPct: avg(h.map((x) => x.pestCalmPct).filter(Number.isFinite)),
    noPestPct: avg(h.map((x) => x.noPestCalmPct).filter(Number.isFinite)),
    goal: p.goal,
    settleGoal: p.settleGoal,
  };
}
const pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}%`);

function loadMix() {
  try {
    const m = JSON.parse(localStorage.getItem(MIX_KEY) || 'null');
    return { music: m?.music !== false, sfx: m?.sfx !== false, voice: m?.voice !== false };
  } catch {
    return { music: true, sfx: true, voice: true };
  }
}

export function BubbleHippo() {
  const navigate = useNavigate();
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
  const [badge, setBadge] = useState(() => progress.unlocked);
  const [warm, setWarm] = useState(false);
  const [bomb, setBomb] = useState(0);
  const [mix, setMixState] = useState(loadMix);
  useEffect(() => {
    const p = startDay(loadProgress(activeId));
    setProgress(p);
    setBadge(p.unlocked); // never keep another child's (maybe locked) badge
    setWarm(false);
    setDaily(loadDaily(activeId));
  }, [activeId]);
  const [phase, setPhase] = useState('menu'); // menu | baseline | warmup | play | result
  const [hud, setHud] = useState(null);
  const [result, setResult] = useState(null);
  const [modal, setModal] = useState(null); // 'story' | 'parent'
  // Live from context, so a chip tap on the menu applies to the next round; null when never chosen.
  const playSetup = usePlaySetup();
  const setup = playSetup.asked ? playSetup.setup : null;

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
  const baseRef = useRef(null); // baseline used by the round (the warm-up one)
  const dailyRef = useRef(null); // { day, base }: the 60 s baseline of today
  const collectRef = useRef({ frames: [], t: 0, lastAt: 0, minS: 0, maxS: 0, minFrames: 0 });
  const checksRef = useRef(createChecks());
  const lastBlinkRef = useRef(0);
  const sceneRef = useRef(createScene());
  const resultLinesRef = useRef([]);
  const collectSecRef = useRef(0); // baseline and warm-up seconds of this round, for the daily limit
  const frameRef = useFastSignal(subscribeEEG, isConnected, bands, {
    enabled: phase === 'baseline' || phase === 'warmup' || phase === 'play', blinkRef: lastBlinkRef,
    holdMs: blinkHoldMs(profile),
  });
  const pausedRef = useRef(paused);
  const qualityRef = useRef({ adjusting, hasRecentExtreme });
  const reactivityRef = useRef(calibration?.reactivity);
  const readyRef = useRef(isBaselineReady);
  const finishRef = useRef(null);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { qualityRef.current = { adjusting, hasRecentExtreme }; }, [adjusting, hasRecentExtreme]);
  useEffect(() => { reactivityRef.current = calibration?.reactivity; }, [calibration]);
  useEffect(() => { readyRef.current = isBaselineReady; }, [isBaselineReady]);
  useEffect(() => onBlink(() => { lastBlinkRef.current = performance.now(); }), [onBlink]);
  const go = useCallback((p) => { phaseRef.current = p; setPhase(p); }, []);

  // Draw settings that the rAF loop reads without re-rendering
  const drawRef = useRef({ badge, bomb, zoo: progress.zoo });
  useEffect(() => { drawRef.current = { badge, bomb, zoo: progress.zoo }; }, [badge, bomb, progress.zoo]);

  const stageRef = useRef(null);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (started) ensureBaseline({ seconds: 30 });
  }, [started, ensureBaseline]);

  useEffect(() => { if (phase === 'menu') stopMusic(); }, [phase]);
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
      if (ph !== 'baseline' && ph !== 'warmup' && ph !== 'play') return;
      const r = roundRef.current;
      if (!readyRef.current) return;
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
      const raw = frameRef.current;
      const frame = freshFrame(raw, now);
      if (ph === 'baseline' || ph === 'warmup') stepCollect(ph, dt, frame, q.adjusting || frontalSpike);
      else stepRound(dt, now, frame, q.adjusting || frontalSpike);
      if (now - hudAt > HUD_MS) { hudAt = now; pushHud(); }
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Baseline (60 s, hippo hums, nothing scored) and warm-up (20 s re-baseline before each round)
  function stepCollect(ph, dt, frame, bad) {
    const c = collectRef.current;
    c.t += dt;
    setMusicMode({ live: true });
    if (!demoRef.current && frame && frame.at !== c.lastAt && !bad && !frame.blink) { c.lastAt = frame.at; c.frames.push(frame); }
    const enough = c.frames.length >= c.minFrames;
    const done = demoRef.current
      ? c.t >= c.minS
      : (c.t >= c.minS && enough) || (c.t >= c.maxS && c.frames.length >= 8);
    if (!done) return;
    const base = demoRef.current ? DEMO_BASE : makeBaseline(c.frames);
    collectSecRef.current += c.t;
    if (ph === 'baseline') {
      dailyRef.current = { day: dayKey(), base };
      baseRef.current = base;
      startCollect('warmup');
      go('warmup');
    } else {
      baseRef.current = base || dailyRef.current?.base || null;
      checksRef.current.reset();
      takePausedSec(); // pauses while fitting the headband in the warm-up do not count against the round
      go('play');
    }
  }

  function startCollect(kind) {
    const d = demoRef.current;
    collectRef.current = kind === 'baseline'
      ? { frames: [], t: 0, lastAt: 0, minS: d ? DEMO_BASELINE_S : BASELINE_S, maxS: BASELINE_MAX_S, minFrames: BASELINE_MIN_FRAMES }
      : { frames: [], t: 0, lastAt: 0, minS: d ? DEMO_WARMUP_S : WARMUP_MIN_S, maxS: WARMUP_MAX_S, minFrames: WARMUP_MIN_FRAMES };
  }

  function stepRound(dt, now, frame, adjustingNow) {
    const r = roundRef.current;
    const base = baseRef.current;
    if (!r || !base) return;
    const F = badgeFeatures(r.badge);
    const sceneNow = sceneRef.current;
    const isDemo = demoRef.current;
    const inDuck = r.sub === 'duck' || r.sub === 'answer';

    const checks = isDemo ? {} : checksRef.current.update(frame, base, dt, now, {
      lastBlinkMs: lastBlinkRef.current, reactivity: reactivityRef.current, duckTime: inDuck,
    });
    r.gate = readGate({ stale: !isDemo && !frame, adjusting: adjustingNow, checks, giggle: now < r.giggleUntil });
    const g = r.gate;
    // A hint is spoken once, with a bell, then quiet for a while
    if (g.hint) {
      const last = r.hintAt[g.reason];
      if (last == null || now - last > HINT_COOLDOWN_MS) {
        r.hintAt[g.reason] = now;
        r.hintText = g.hint;
        r.hintUntil = now + HINT_SHOW_MS;
        playSfx('hintBell');
        say(g.hint);
      }
    }
    // Sleepy = bath break: round time is stopped
    if (g.state === 'freeze') {
      r.frozenSec += dt;
      setMusicMode({ duck: false, live: false });
      if (r.frozenSec > FREEZE_MAX_S) { r.early = true; finishRef.current?.(); }
      return;
    }
    r.t += dt;
    r.subT += dt;
    const live = g.state === 'ok';
    const scoring = r.sub === 'calm' || r.sub === 'settle';

    // The calm value: a hold keeps the last one (blink frames too)
    if (isDemo) {
      const zt = (demoTarget(r) - 0.5) * 4;
      r.z += (zt - r.z) * Math.min(1, dt * 1.5);
    } else if (live && frame && !frame.blink && frame.at !== r.lastFrameAt) {
      r.lastFrameAt = frame.at;
      const c = calmOf(frame, base.thetaCap);
      r.z = zOf(pushCalm(r.calmWin, c), base); // average of the last 8 frames (1 s)
      const m = Math.floor(r.t / 60);
      const acc = r.calmMin[m] || (r.calmMin[m] = [0, 0]);
      acc[0] += c; acc[1] += 1;
    }

    // Goal: fixed in the round; safety net once after 45 s; last 20 s of the day's last round a little easier
    const net = r.safetyDone ? null : safetyNet(RULES, { t: r.t, okSec: r.liveSec, successSec: r.aboveSec });
    if (net) { r.safetyDone = true; r.safety = net.offset; r.eased = net.eased; }
    const goalZ = roundGoal(RULES, r);
    const calm = r.z >= goalZ;
    const secret = !!r.secret;

    if (scoring) {
      if (live) {
        const scored = isScored(RULES, r); // the day's last 20 s are eased and not scored
        const pestOn = !!r.pest;
        if (scored) {
          r.liveSec += dt;
          if (pestOn) r.pestLive += dt; else r.noPestLive += dt;
          if (secret) r.secLive += dt;
        }
        if (calm) {
          if (scored) {
            r.aboveSec += dt;
            if (pestOn) r.pestAbove += dt; else r.noPestAbove += dt;
            if (secret) r.secAbove += dt;
          }
          r.run += dt; r.grace = 0;
          r.bubble = Math.min(1, r.bubble + dt / GROW_S);
        } else {
          r.grace += dt;
          if (r.grace > GRACE_S) r.run = 0;
          r.bubble = Math.max(BUBBLE_MIN, r.bubble - dt / SHRINK_S); // shrinks slowly, never pops
        }
        r.longest = Math.max(r.longest, r.run);
      } else if (g.reason !== 'giggle') {
        r.heldSec += dt; // hold: no reward, no punishment
      }
    }

    // Full bubble floats away with a friend, quietly. Not during the secret bubble or the giggle gap.
    if (r.bubble >= 1 && live && !secret && !inDuck) {
      triggerLaunch(sceneNow);
      playSfx('launch');
      r.launches += 1;
      r.bubble = BUBBLE_AFTER_LAUNCH;
    }

    // Splash and Settle (Otter+)
    if (F.splash) {
      if (r.sub === 'calm') {
        r.calmTimer += dt;
        if (r.calmTimer >= DUCK_EVERY_S && r.t < r.len - NO_DUCK_LAST_S && !secret && live) {
          r.sub = 'duck'; r.subT = 0;
          r.duckN = 3 + Math.floor(Math.random() * 3);
          r.duckAt = Array.from({ length: r.duckN }, (_, i) => 1 + i * (10 / r.duckN) + rand(0, 1.5));
          r.ducksPopped = 0;
          r.pest = null; // no pests in duck time
          r.giggleUntil = now + GIGGLE_GAP_MS; // the rooster call comes with a toot
          triggerToot(sceneNow);
          playSfx('toot');
          setTimeout(() => playSfx('rooster'), 500);
          say('Splash time! Count the ducks!');
          r.msg = 'Splash time!';
        }
      } else if (r.sub === 'duck') {
        while (r.duckAt.length && r.subT >= r.duckAt[0]) { r.duckAt.shift(); r.ducksPopped += 1; playSfx('plink'); }
        if (r.subT > DUCK_TIME_S) { r.sub = 'answer'; r.subT = 0; r.answered = null; r.answerAt = null; say('How many ducks?'); }
      } else if (r.sub === 'answer') {
        const over = r.answered != null ? r.subT - r.answerAt > ANSWER_AFTER_S : r.subT > ANSWER_MAX_S;
        if (over) {
          if (r.answered == null) r.ducksTotal += 1; // no answer is a missed one, no scolding
          r.sub = 'settle'; r.subT = 0; r.ducksPopped = 0;
          r.settle = { dipped: false, from: 0, stay: 0 };
          r.demoDipFrom = r.t;
          r.msg = 'Bubble time!';
          say('Bubble time.');
        }
      } else if (r.sub === 'settle') {
        const st = r.settle;
        if (live) {
          if (!st.dipped && r.z < goalZ - SETTLE_DIP_Z && r.subT <= SETTLE_DIP_WINDOW_S) {
            st.dipped = true; st.from = r.subT <= 0.5 ? 0 : r.subT;
          }
          if (st.dipped) st.stay = calm ? st.stay + dt : 0;
        }
        if (!st.dipped && r.subT > SETTLE_DIP_WINDOW_S) { // no real dip: nothing to measure
          r.sub = 'calm'; r.subT = 0; r.calmTimer = 0; r.settle = null;
        } else if (st.dipped && st.stay >= SETTLE_STAY_S) {
          r.settleTimes.push(Math.round((r.subT - st.from) * 10) / 10);
          playSfx('harp');
          r.sub = 'calm'; r.subT = 0; r.calmTimer = 0; r.settle = null;
        } else if (st.dipped && r.subT - st.from > SETTLE_CAP_S) {
          r.settleTimes.push(SETTLE_CAP_S);
          r.sub = 'calm'; r.subT = 0; r.calmTimer = 0; r.settle = null;
        }
      }
    }

    // Seal+: pests stay in place, make sounds
    if (F.pests) {
      if (!r.pest && r.sub === 'calm' && r.t >= r.nextPest && r.t < r.len - PEST_S && !secret) {
        const types = F.king ? ['fly', 'sock', 'swan'] : ['fly', 'sock'];
        r.pest = { type: types[Math.floor(Math.random() * types.length)], end: r.t + PEST_S };
        r.pestSoundAt = 0;
      } else if (r.pest) {
        if (r.t >= r.pest.end || inDuck) { r.pest = null; r.nextPest = r.t + PEST_EVERY_S + rand(0, 10); }
        else if (r.t >= r.pestSoundAt) {
          const [snd, every] = PEST_SOUND[r.pest.type];
          playSfx(snd);
          r.pestSoundAt = r.t + every;
        }
      }
    }

    // Whale+: secret bubble hides ALL feedback, 10 s growing to 20 s
    if (F.secret) {
      const secLen = Math.min(SECRET_MAX_S, SECRET_MIN_S + 5 * r.secretCount + Math.min(5, r.whaleDays));
      if (!r.secret && r.sub === 'calm' && r.t >= r.nextSecret && r.t < r.len - secLen - 8) {
        r.secret = { end: r.t + secLen };
        playSfx('foamIn');
      } else if (r.secret && r.t >= r.secret.end) {
        r.secret = null; r.secretCount += 1;
        r.nextSecret = r.t + SECRET_EVERY_S + rand(0, 10);
      }
    }

    // Frog+: breath ring at the fixed pacer rate
    r.breathT += dt;
    const cycle = 60 / pacerRate(r.weeks);
    const ph01 = (r.breathT % cycle) / cycle;
    r.breathK = 0.5 - 0.5 * Math.cos(ph01 * Math.PI * 2);
    r.breathInhale = ph01 < 0.5;

    setMusicMode({
      duck: inDuck, breathK: F.breath && !secret ? r.breathK : null,
      shimmer: scoring && live && calm && !secret, secret, live: true,
    });

    // End of round: a toot, then the result
    if (r.t >= r.len) {
      triggerToot(sceneNow);
      playSfx('toot');
      finishRef.current?.();
    }
  }

  function pushHud() {
    const ph = phaseRef.current;
    const c = collectRef.current;
    if (ph === 'baseline' || ph === 'warmup') {
      setHud({ sub: ph, left: Math.max(0, Math.ceil(c.minS - c.t)), stuck: !demoRef.current && c.t >= c.maxS });
      return;
    }
    const r = roundRef.current;
    if (!r) return;
    setHud({
      sub: r.sub, left: Math.max(0, Math.ceil(r.len - r.t)), gate: r.gate.state,
      answering: r.sub === 'answer' && r.answered == null, duckN: r.duckN,
    });
  }

  // Tap on one of the 3 big answer buttons
  function onAnswer(n) {
    const r = roundRef.current;
    if (!r || r.sub !== 'answer' || r.answered != null) return;
    r.answered = n;
    r.answerAt = r.subT;
    r.ducksTotal += 1;
    if (n === r.duckN) {
      r.ducksRight += 1;
      playSfx('chimes');
      say(`Yes! ${n} ducks. Now bubble time.`);
    } else {
      playSfx('plink');
      say(`It was ${r.duckN}. Good try! Bubble time.`);
    }
    pushHud();
  }

  // ---- round end: progress, session row (re-bound each render so it sees the latest progress)
  useEffect(() => { finishRef.current = finishRoundNow; });
  function finishRoundNow() {
    const r = roundRef.current;
    if (!r || phaseRef.current !== 'play') return;
    go('result');
    const calmPct = r.liveSec > 0 ? r.aboveSec / r.liveSec : 0;
    const total = r.liveSec + r.heldSec;
    const heldPct = total > 0 ? r.heldSec / total : 0;
    const calmByMin = r.calmMin.map((a) => (a && a[1] ? Math.round((a[0] / a[1]) * 1000) / 1000 : null));
    const round = {
      badge: r.badge, warm: r.warm, sec: Math.round(r.t), calmPct, eased: r.eased, longestHold: r.longest,
      settleTimes: r.settleTimes, ducksRight: r.ducksRight, ducksTotal: r.ducksTotal,
      secretPct: r.secLive > 0 ? r.secAbove / r.secLive : undefined,
      pestCalmPct: r.pestLive > 0 ? r.pestAbove / r.pestLive : undefined,
      noPestCalmPct: r.noPestLive > 0 ? r.noPestAbove / r.noPestLive : undefined,
      heldPct, rawByMin: calmByMin,
      setup: setup || undefined, baseMu: baseRef.current?.calm?.median, baseMad: baseRef.current?.calm?.mad,
    };
    const res = finishRound(progress, round);
    if (!demoRef.current) saveProgress(activeId, res.progress);
    setProgress(res.progress);

    const pausedSec = takePausedSec();
    const poor = r.t > 0 && pausedSec / Math.max(r.len, r.t) > POOR_PAUSED_PCT;
    // Arcade-wide daily limit: this round plus the baseline and warm-up count
    const usage = { game: GAME, rounds: 1, sec: r.t + r.frozenSec + collectSecRef.current };
    collectSecRef.current = 0;
    setDaily(demoRef.current ? addUsage(daily, usage) : recordDailyUsage(activeId, usage));
    const rec = makeRoundRecord({
      game: GAME, level: r.badge, setup, rawByMin: calmByMin, ref: res.progress.ref,
      goal: goalLevel(r.goal), successPct: calmPct, longestStreakS: r.longest, heldPct,
      frozenPct: (r.frozenSec + pausedSec) / Math.max(1, r.t + r.frozenSec + pausedSec), stars: res.stars,
    });
    const id = recordSession(GAME, {
      ...toSessionFields(rec),
      score: Math.round(r.aboveSec), // calm seconds, like the other calm games
      scoreKind: 'calmSec',
      okSec: Math.round(r.liveSec),
      durationSec: Math.round(r.t),
      playedSec: Math.round(r.t),
      qualityPct: quality10s ? Math.round(quality10s.stablePct * 100) : undefined,
      badge: BADGES[r.badge - 1].name,
      bathBomb: BATH_BOMBS[bomb]?.id,
      warmBath: r.warm || undefined,
      settleTimes: r.settleTimes.length ? r.settleTimes.join(' ') : undefined,
      ducksRight: r.ducksTotal ? r.ducksRight : undefined,
      ducksTotal: r.ducksTotal || undefined,
      secretPct: round.secretPct != null ? Math.round(round.secretPct * 100) : undefined,
      pestCalmPct: round.pestCalmPct != null ? Math.round(round.pestCalmPct * 100) : undefined,
      noPestCalmPct: round.noPestCalmPct != null ? Math.round(round.noPestCalmPct * 100) : undefined,
      endedEarly: r.early || undefined,
      ...(poor ? { valid: false, invalidReason: 'bad-quality' } : {}),
    });
    if (res.unlockedBadge) setBadge(res.unlockedBadge);
    setWarm(false);
    playSfx(res.unlockedBadge || res.golden ? 'chimes' : 'harp');
    resultLinesRef.current = [
      res.friend ? `New friend: ${res.friend}` : 'The Bubble Zoo is full!',
      res.golden ? 'A golden bubble floated by!' : '',
      res.unlockedBadge ? `New badge: ${BADGES[res.unlockedBadge - 1].name}!` : '',
    ].filter(Boolean);
    setResult({ ...res, round, sessionId: id, poor, early: r.early });
  }

  const beginRound = useCallback((badgeId, isWarm) => {
    const p = startDay(progress); // a new day may have started while the game stayed open
    if (p !== progress) setProgress(p);
    const d = demoRef.current ? daily : loadDaily(activeId);
    if (d !== daily) setDaily(d);
    const today = dailyCheck(d, GAME);
    if (!today.ok) return;
    const id = Math.min(Math.max(1, badgeId), p.unlocked);
    roundRef.current = newRound(id, isWarm, today.lastRound, p.goal, playWeeks(p), whaleDaysOf(p));
    collectSecRef.current = 0;
    checksRef.current.reset();
    takePausedSec();
    startMusic();
    const haveDaily = dailyRef.current && dailyRef.current.day === dayKey();
    if (haveDaily) { startCollect('warmup'); go('warmup'); } else { startCollect('baseline'); go('baseline'); }
  }, [progress, go, daily, activeId]);

  const onStart = () => {
    primeBubbleAudio();
    setStarted(true);
    setResult(null);
    beginRound(warm ? Math.max(1, progress.unlocked - 1) : badge, warm);
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
      const d = drawRef.current;
      const now = performance.now();
      const view = { badge: (r && ph !== 'menu' ? r.badge : d.badge) - 1, world: (r && ph !== 'menu' ? r.badge : d.badge) - 1,
        bathBomb: BOMB_SCENE[BATH_BOMBS[d.bomb]?.id] || null, zoo: d.zoo, phase: 'calm', meter: 0.5, goal: null };
      if (ph === 'baseline' || ph === 'warmup') {
        const c2 = collectRef.current;
        view.phase = ph;
        view.msg = ph === 'baseline' ? 'Hippo hums. Sit still and breathe.' : 'Get ready!';
        view.hudLines = [BADGES[(r?.badge || d.badge) - 1].name, `${Math.max(0, Math.ceil(c2.minS - c2.t))} s`];
        view.paused = pausedRef.current;
      } else if (ph === 'play' && r) {
        const F = badgeFeatures(r.badge);
        const goalZ = roundGoal(RULES, r);
        const left = Math.max(0, Math.ceil(r.len - r.t));
        view.phase = r.gate.state === 'freeze' ? 'break' : r.sub;
        view.meter = meterOf(r.z);
        view.goal = meterOf(goalZ);
        view.bubble = r.bubble;
        view.secret = !!r.secret;
        view.sleepy = r.gate.reason === 'sleepy';
        view.breath = { on: F.breath, k: r.breathK || 0, inhale: r.breathInhale };
        view.ducks = r.sub === 'duck' || r.sub === 'answer' ? r.ducksPopped : 0;
        view.pests = r.pest ? [r.pest.type] : [];
        view.hint = now < r.hintUntil ? r.hintText : '';
        view.gate = r.gate.state;
        view.msg = r.msg;
        view.breakText = r.gate.hint || '';
        view.hudLines = [BADGES[r.badge - 1].name, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`];
        view.paused = pausedRef.current;
      } else if (ph === 'result') {
        view.phase = 'result';
        view.resultLines = resultLinesRef.current;
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
  const answerChoices = [3, 4, 5];

  const badgeButtons = (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {BADGES.map((b) => {
        const open = b.id <= progress.unlocked;
        const on = !warm && b.id === badge;
        return (
          <button
            key={b.id}
            type="button"
            disabled={!open}
            onClick={() => { setBadge(b.id); setWarm(false); }}
            className={`min-h-[44px] border-2 px-2 py-2 text-[9px] leading-tight text-left ${on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : open ? 'border-white/60 text-white' : 'border-white/20 text-white/30'}`}
          >
            {open ? `${b.id} ${b.name}` : `${b.id} ???`}
            {open && <span className="block opacity-70 mt-1">{b.title}</span>}
          </button>
        );
      })}
    </div>
  );

  const goodbye = (
    <div className="text-[10px] text-gray-200 leading-relaxed">
      <p className="text-[var(--nes-yellow)] mb-2">SEE YOU NEXT TIME!</p>
      <p className="mb-2">You played {today.roundsDone} round{today.roundsDone === 1 ? '' : 's'} today. The hippo waves goodbye from the tub.</p>
      <p className="mb-4">Days played: {progress.days}</p>
      <button type="button" onClick={() => navigate('/games')} className="border-4 border-white/70 px-4 py-3 text-xs text-white">CHOOSE GAME</button>
    </div>
  );

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden" ref={stageRef} style={{ background: '#2a2550' }}>
        <div ref={boxRef} className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          {phase === 'play' && hud?.answering && (
            <div className="absolute inset-x-0 flex flex-col items-center gap-3 z-20" style={{ top: '22%', ...FONT }}>
              <p className="text-[11px] text-white bg-black/60 px-3 py-1 border-2 border-[var(--nes-yellow)]">HOW MANY DUCKS?</p>
              <div className="flex gap-3">
                {answerChoices.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onAnswer(n)}
                    className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] text-[var(--nes-yellow)] text-2xl"
                    style={{ minHeight: 64, minWidth: 64 }}
                    aria-label={`${n} ducks`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {(phase === 'baseline' || phase === 'warmup') && hud?.stuck && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center z-10 px-4 pointer-events-none">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px] text-white text-center max-w-sm" style={FONT}>
              No clean signal yet. Tap ELECTRODES and check the headband. The game starts when the signal is clean.
            </div>
          </div>
        )}

        {started && !isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={FONT}>
              Waiting for baseline…
            </div>
          </div>
        )}

        {phase === 'menu' && (
          <GameStartPanel title="BUBBLE HIPPO" onStart={dayDone ? undefined : onStart} onRecalibrate={dayDone ? undefined : recal}>
            {dayDone ? goodbye : (
              <>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-2">
                  Stay calm and the hippo&apos;s bubble grows. A full bubble floats away with a new friend.
                </p>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-3">Keep your eyes open and watch the bubble.</p>
                {setup !== 'stand' && (
                  <p className="text-[9px] text-[var(--nes-yellow)] leading-relaxed mb-3">Lean the phone on a pillow.</p>
                )}
                {badgeButtons}
                {progress.warmBath && progress.unlocked > 1 && (
                  <div className="mb-3 border-2 border-white/40 p-2 text-[9px]">
                    <p className="mb-2">Feeling tired? Try a warm bath: an easy round on the {BADGES[progress.unlocked - 2].name} badge. You keep your badge.</p>
                    <button type="button" onClick={() => setWarm((w) => !w)}
                      className={`min-h-[44px] border-2 px-3 ${warm ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-[var(--nes-green)] text-[var(--nes-green)]'}`}>
                      {warm ? 'WARM BATH ON' : 'WARM BATH'}
                    </button>
                  </div>
                )}
                <div className="mb-3 text-[9px]">
                  <p className="mb-1 text-gray-300">PICK A BATH BOMB</p>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {BATH_BOMBS.map((b, i) => (
                      <button key={b.id} type="button" onClick={() => setBomb(i)}
                        className={`min-h-[44px] border-2 px-2 ${bomb === i ? 'border-[var(--nes-yellow)] text-[var(--nes-yellow)]' : 'border-white/40 text-white'}`}>
                        {b.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 opacity-70">{BATH_BOMBS[bomb].joke}</p>
                </div>
                <div className="mb-3 text-[9px]">
                  <p className="mb-1 text-gray-300">SOUND</p>
                  <div className="flex justify-center gap-1">
                    {[['music', 'MUSIC'], ['sfx', 'EFFECTS'], ['voice', 'VOICE']].map(([k, label]) => (
                      <button key={k} type="button" aria-pressed={mix[k]} onClick={() => toggle(k)}
                        className={`min-h-[44px] border-2 px-2 ${mix[k] ? 'border-[var(--nes-green)] text-[var(--nes-green)]' : 'border-white/30 text-white/50'}`}>
                        {label} {mix[k] ? 'ON' : 'OFF'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-3 text-[9px] text-gray-200 mb-3">
                  <span className="text-[var(--nes-yellow)]">★ {progress.stars}</span>
                  <span>BUBBLE FRIENDS {progress.zoo}</span>
                  <span>DAYS PLAYED {progress.days}</span>
                  <span>ROUNDS LEFT TODAY {roundsLeft}</span>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  <button type="button" onClick={() => setModal('story')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">STORY</button>
                  <button type="button" onClick={() => setModal('parent')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">PARENT CARD</button>
                </div>
                {demo && <p className="text-[8px] opacity-70 mb-2">Demo mode: progress is not saved.</p>}
              </>
            )}
          </GameStartPanel>
        )}

        {(phase === 'baseline' || phase === 'warmup') && (
          <GameHint
            position="bottom-left"
            offset={8}
            scheme="dark"
            align="left"
            primary={phase === 'baseline' ? 'The hippo hums. Sit still.' : 'Get ready to blow a bubble'}
            secondary={'Stay calm and the bubble grows'}
          />
        )}
      </div>

      {phase === 'result' && result && (
        <RetroModal title="ROUND DONE!" showFooter={false} onCancel={() => go('menu')}>
          <div style={FONT} className="text-center">
            <div className="text-2xl text-[var(--nes-yellow)] mb-2">{'★'.repeat(result.stars)}</div>
            <p className="text-[10px] mb-1">
              {result.early ? 'The round ended early, but you still get your star!' : 'You finished the round!'}
            </p>
            {result.friend && <p className="text-[9px] text-[var(--nes-green)] mt-2">NEW BUBBLE FRIEND: {result.friend}</p>}
            {result.golden && <p className="text-[9px] text-[var(--nes-yellow)] mt-1">A GOLDEN BUBBLE!</p>}
            {result.unlockedBadge && (
              <div className="border-2 border-[var(--nes-yellow)] p-2 mt-3 text-[9px] text-left">
                <p className="text-[var(--nes-yellow)] mb-1">NEW BADGE: {BADGES[result.unlockedBadge - 1].name}!</p>
                <p className="leading-relaxed">{STORY[result.unlockedBadge - 1]}</p>
              </div>
            )}
            {result.warmBath && <p className="text-[9px] mt-3">Next time you can pick a warm bath: an easy round, just for fun.</p>}
            {result.poor && <p className="text-[8px] text-[var(--nes-yellow)] mt-2">The headband signal was poor for most of this round, so it is not counted in your progress.</p>}
            {demo && <p className="text-[8px] opacity-70 mt-2">Demo mode — not saved</p>}
            <div className="mt-4">
              {!dayDone ? (
                <GameEndActions onPlayAgain={() => go('menu')} sessionId={result.sessionId} game={GAME} seconds={result.round.sec} />
              ) : (
                <>
                  <button type="button" onClick={() => go('menu')} className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)]">SEE YOU!</button>
                  <div className="mt-4 text-left"><ParentReport sessionId={result.sessionId} game={GAME} seconds={result.round.sec} /></div>
                </>
              )}
            </div>
          </div>
        </RetroModal>
      )}

      {modal === 'story' && (
        <RetroModal title={`CHAPTER ${chapter}`} cancelLabel="CLOSE" onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="text-[var(--nes-yellow)] mb-2">{BADGES[chapter - 1].name} - {WORLDS[chapter - 1].name}</p>
            <p>{STORY[chapter - 1]}</p>
          </div>
        </RetroModal>
      )}

      {modal === 'parent' && card && (
        <RetroModal title="PARENT CARD" cancelLabel="CLOSE" onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="mb-2 opacity-80">Last 7 days. This is a calm-practice game, not a medical test.</p>
            <p>Rounds: {card.rounds} on {card.days} day{card.days === 1 ? '' : 's'}</p>
            <p>Calm time (above the goal): {pct(card.calmPct)}</p>
            <p>Longest calm hold: {Math.round(card.longestHold)} s</p>
            <p>Settle time: {card.settle == null ? '-' : `${card.settle.toFixed(1)} s`} (goal {Math.round(card.settleGoal)} s)</p>
            <p>Duck answers right: {card.duck || '-'}</p>
            <p>Secret bubble: {pct(card.secretPct)}</p>
            <p>Calm with a pest: {pct(card.pestPct)}, without: {pct(card.noPestPct)}</p>
            <p>Goal now: {card.goal.toFixed(1)} (z, steps of 0.1)</p>
            <p className="mt-2 text-[var(--nes-yellow)]">Stars come for finishing a round, never for calm. Praise the effort, not the number.</p>
          </div>
        </RetroModal>
      )}
    </div>
  );
}
