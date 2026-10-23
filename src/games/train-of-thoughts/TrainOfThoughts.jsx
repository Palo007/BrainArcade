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
import { useT, t as tNow } from '../../lib/i18n.js';
import '../../styles/retro.css';

import train1 from './assets/train1.png';
import train2 from './assets/train2.png';
import train3 from './assets/train3.png';
import villainTrain from './assets/villain.png';
import cityBackground from './assets/city-background.jpg';
import { preloadImages } from '../../lib/preloadImages.js';
import { useFastSignal, createChecks, freshFrame, blinkHoldMs } from '../../lib/fastSignal.js';
import { roundGoal, safetyNet, isScored, loadDaily, dailyCheck, addUsage, recordDailyUsage } from '../../lib/progressRules.js';
import { makeRoundRecord, toSessionFields } from '../../lib/roundRecord.js';
import { busyOf, makeBaseline } from './calmSignal.js';
import { readGate } from './gate.js';
import {
  RULES, LINES, STORY, TWISTS, WAGON_CALM_S, LANTERN_CALM_S,
  lineFeatures, loadProgress, saveProgress, startDay, finishRound, praiseFor, weeklyCard, goalLevel,
} from './progress.js';
import { primeTrainAudio, playSound } from './sounds.js';

preloadImages(train1, train2, train3, villainTrain, cityBackground);

const GAME = 'train-of-thoughts';
const FONT = { fontFamily: 'var(--font-retro)' };
const STEP_MS = 33; // game logic timer; requestAnimationFrame only draws
const HUD_MS = 250; // React state about 4x/s
const WARMUP_MIN_S = 20;
const WARMUP_MAX_S = 40;
const WARMUP_MIN_FRAMES = 60;
const BUSY_GRACE_S = 0.5; // one noisy frame does not break a calm streak
const HANDS_MAX_ROUND_S = 120; // phone in the hands: arms tire and the head sinks in longer rounds
const THUNDER_STAYED_CALM_S = 3; // calm streak still running this long after the thunder = stayed calm
const BRAINY_LEFT = 0.70; // fraction of the stage width
// Nose position on the track: 0 = engine just in view on the left, 1 = at Brainy
const NOSE_START = 0.1;
const NOSE_MIN = 0;
const trackX = (s, nose) => s.vw + nose * ((BRAINY_LEFT + 0.03) * s.W - s.vw);
const ROUTES = [
  { tint: null, decor: [] },
  { tint: 'rgba(40,110,170,.25)', decor: ['gulls'] },
  { tint: 'rgba(120,170,60,.22)', decor: ['gulls'] },
  { tint: 'rgba(10,10,50,.55)', decor: ['stars', 'flies'] },
  { tint: 'rgba(40,40,60,.45)', decor: ['rain'] },
  { tint: 'rgba(90,40,140,.45)', decor: ['stars', 'moon'] },
];
const calm01Of = (z) => Math.min(1, Math.max(0, 0.5 - z * 0.25)); // z -2 -> full bar, z +2 -> empty
const pickTwist = () => TWISTS[Math.floor(Math.random() * TWISTS.length)];

function newRound(line, lastOfDay, goal, len) {
  return {
    line, len, lastOfDay, goal, safety: 0, safetyDone: false, eased: false,
    t: 0, nose: NOSE_START, z: 0, zShown: 0, lastFrameAt: 0, gate: { state: 'ok' },
    busyMin: [], // raw busy value: [sum, n] per minute, saved so real change shows across days
    wagons: LINES[line - 1].wagons, wagonsDropped: 0, trainsStopped: 0, stoppedFor: 0,
    calmFor: 0, lanternFor: 0, lanterns: 0, run: 0, grace: 0, longest: 0,
    okSec: 0, calmSec: 0, heldSec: 0, whoosh: 0, flash: 0,
    nextBell: 8 + Math.random() * 6, bellChecks: [], bellCalm: 0,
    nextThunder: 25 + Math.random() * 10, thunderAt: null, bounces: [], thunderCalm: 0,
    loose: [], fx: [], banner: null, twist: pickTwist(), hintFrom: null,
  };
}

export function TrainOfThoughts() {
  const t = useT();
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
  const [progress, setProgress] = useState(() => startDay(loadProgress(activeId)));
  const [line, setLine] = useState(() => progress.unlocked);
  const [daily, setDaily] = useState(() => loadDaily(activeId)); // arcade-wide daily limit (rounds and minutes)
  useEffect(() => {
    const p = startDay(loadProgress(activeId));
    setProgress(p);
    setLine(p.unlocked); // never keep another child's (maybe locked) line
    setDaily(loadDaily(activeId));
  }, [activeId]);
  const [route, setRoute] = useState(6);
  const [phase, setPhase] = useState('menu'); // menu | warmup | play | result (the day's goodbye shows in the menu)
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

  // Everything the game loop needs lives in refs
  const phaseRef = useRef('menu');
  const roundRef = useRef(null);
  const baseRef = useRef(null); // play-pose baseline of this session
  const warmRef = useRef({ frames: [], t: 0, lastAt: 0 });
  const checksRef = useRef(createChecks());
  const lastBlinkRef = useRef(0);
  const frameRef = useFastSignal(subscribeEEG, isConnected, bands, {
    enabled: phase === 'warmup' || phase === 'play', blinkRef: lastBlinkRef, holdMs: blinkHoldMs(profile),
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

  // DOM refs for drawing
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const trainRef = useRef(null);
  const wagonRefs = useRef([]);
  const looseRefs = useRef([]);
  const hatRef = useRef(null);
  const brainyRef = useRef(null);
  const barRef = useRef(null);
  const goalMarkRef = useRef(null);
  const pipsRef = useRef([]);
  const sizeRef = useRef({ W: 800, H: 400, vh: 80, vw: 206, ww: 50 });

  useEffect(() => {
    if (started) ensureBaseline({ seconds: 30 });
  }, [started, ensureBaseline]);

  // ---- stage size (responsive train, wagons and Brainy)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measureStage = () => {
      const W = el.clientWidth, H = el.clientHeight;
      const vh = Math.max(40, Math.min(H * 0.22, (W * 0.36) / 2.58));
      const s = { W, H, vh, vw: vh * 2.58, ww: vh * 0.62 };
      sizeRef.current = s;
      el.style.setProperty('--vh', `${s.vh}px`);
      el.style.setProperty('--ww', `${s.ww}px`);
      const c = canvasRef.current;
      if (c) { c.width = W; c.height = H; }
    };
    measureStage();
    const ro = new ResizeObserver(measureStage);
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
      if ((ph !== 'warmup' && ph !== 'play') || pausedRef.current || !readyRef.current) return;
      const q = qualityRef.current;
      const frontalSpike = q.hasRecentExtreme?.(1, 1000) || q.hasRecentExtreme?.(2, 1000);
      // A frame older than STALE_MS means the stream stalled: never score a frozen signal
      const raw = frameRef.current;
      const frame = freshFrame(raw, now);
      if (ph === 'warmup') stepWarmup(dt, frame, q.adjusting || frontalSpike);
      else stepRound(dt, now, frame, q.adjusting, frontalSpike);
      if (now - hudAt > HUD_MS) { hudAt = now; pushHud(); }
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stepWarmup(dt, frame, bad) {
    const w = warmRef.current;
    w.t += dt;
    if (frame && frame.at !== w.lastAt && !bad && !frame.blink) { w.lastAt = frame.at; w.frames.push(frame); }
    const enough = w.frames.length >= WARMUP_MIN_FRAMES;
    if ((w.t >= WARMUP_MIN_S && enough) || (w.t >= WARMUP_MAX_S && w.frames.length >= 8)) {
      baseRef.current = makeBaseline(w.frames);
      checksRef.current.reset();
      takePausedSec(); // pauses while fitting the headband in the warm-up do not count against the round
      go('play');
    }
  }

  function stepRound(dt, now, frame, adjustingNow, frontalSpike) {
    const r = roundRef.current;
    const base = baseRef.current;
    if (!r || !base) return;
    const L = lineFeatures(r.line);
    r.t += dt;

    const checks = checksRef.current.update(frame, base, dt, now, {
      lastBlinkMs: lastBlinkRef.current, reactivity: reactivityRef.current,
    });
    r.gate = readGate({ stale: !frame, adjusting: adjustingNow, frontalSpike, checks });
    if (r.gate.state === 'hint') { // a friendly nudge: 4 s, then quiet for 30 s
      if (r.hintFrom == null || r.t - r.hintFrom > 34) r.hintFrom = r.t;
      if (r.t - r.hintFrom > 4) r.gate = { ...r.gate, hint: null };
    }
    const live = r.gate.state === 'ok' || r.gate.state === 'hint';
    // Blink frames keep the last value (a blink is normal: it must not move the bar or stop the game)
    if (live && frame && !frame.blink && frame.at !== r.lastFrameAt) {
      r.lastFrameAt = frame.at;
      const busy = busyOf(frame);
      r.z = (busy - base.mu) / base.sd;
      const m = Math.floor(r.t / 60);
      const acc = r.busyMin[m] || (r.busyMin[m] = [0, 0]);
      acc[0] += busy; acc[1] += 1;
    }
    // Goal: fixed in the round; safety net once after 45 s; last 20 s of the day's last round a little easier
    const goal = roundGoal(RULES, r);
    // Steady muscle tension raises beta: cap the value at the goal, so muscle can neither win nor speed the train
    const z = checks.tense ? Math.min(r.z, goal) : r.z;
    r.zShown = z;
    const calm = z < goal;

    if (live) {
      const scored = isScored(RULES, r);
      if (scored) r.okSec += dt;
      if (calm) {
        if (scored) r.calmSec += dt;
        r.run += dt; r.grace = 0; r.calmFor += dt; r.lanternFor += dt;
      } else {
        r.grace += dt;
        if (r.grace > BUSY_GRACE_S) { r.run = 0; r.calmFor = 0; r.lanternFor = 0; }
      }
      r.longest = Math.max(r.longest, r.run);
    } else {
      r.heldSec += dt; // hold: no reward, no punishment, the calm clock pauses
    }

    const net = r.safetyDone ? null : safetyNet(RULES, { t: r.t, okSec: r.okSec, successSec: r.calmSec });
    if (net) { r.safetyDone = true; r.safety = net.offset; r.eased = net.eased; }

    // Train: busy -> faster, calm -> slower and rolls back a little
    const d = z - goal;
    const speed = calm ? -0.01 - 0.025 * Math.min(1.5, -d) : 0.02 + 0.07 * Math.min(2, d);
    if (r.whoosh > 0) {
      r.whoosh -= dt;
      r.nose += 1.2 * dt;
      if (r.whoosh <= 0) r.nose = NOSE_START;
    } else if (r.stoppedFor > 0) {
      r.stoppedFor -= dt;
      if (r.stoppedFor <= 0) { r.wagons = LINES[r.line - 1].wagons; r.nose = NOSE_START; }
    } else {
      r.nose = Math.max(NOSE_MIN, r.nose + speed * dt);
      if (r.nose >= 1) {
        r.whoosh = 1.4;
        addFx(r, tNow('games.tot.fxWhoosh'), '#FC8080');
        playSound('whoosh');
      }
    }

    // Discrete wins
    if (r.calmFor >= WAGON_CALM_S) {
      r.calmFor -= WAGON_CALM_S;
      if (L.wagons && r.wagons > 0 && r.stoppedFor <= 0 && r.whoosh <= 0) {
        r.wagons -= 1;
        r.wagonsDropped += 1;
        r.loose.push({ x: r.nose, life: 2.5 });
        addFx(r, tNow('games.tot.fxWagon'), '#FCC060');
        playSound('wagon');
        if (r.wagons === 0) {
          r.trainsStopped += 1;
          r.stoppedFor = 2.5;
          r.banner = { txt: tNow('games.tot.bannerStopped'), life: 2.5 };
          playSound('stop');
        }
      } else if (!L.wagons) {
        addFx(r, tNow('games.tot.fxCalm'), '#FCC060');
        playSound('calm');
      }
    }
    if (L.lanterns && r.lanternFor >= LANTERN_CALM_S) {
      r.lanternFor -= LANTERN_CALM_S;
      r.lanterns += 1;
      addFx(r, tNow('games.tot.fxLantern'), '#f7f06a');
      playSound('lantern');
    }

    // Line events
    if (L.bells && r.t > r.nextBell) {
      r.nextBell = r.t + 8 + Math.random() * 6;
      r.bellChecks.push(r.t + 3);
      addFx(r, tNow('games.tot.fxBell'), '#40C0FF');
      playSound('bell');
    }
    if (r.bellChecks.length && r.t >= r.bellChecks[0]) {
      r.bellChecks.shift();
      if (calm && live) r.bellCalm += 1;
    }
    if (L.thunder && r.t > r.nextThunder) {
      r.nextThunder = r.t + 22 + Math.random() * 10;
      r.thunderAt = r.t;
      r.flash = 1;
      addFx(r, tNow('games.tot.fxThunder'), '#ffffff');
      playSound('horn');
    }
    if (r.thunderAt != null) {
      const sinceThunder = r.t - r.thunderAt;
      const runStart = r.t - r.run;
      if (r.run >= 1 && runStart > r.thunderAt) { // a new calm streak started after the thunder
        r.bounces.push(runStart - r.thunderAt);
        r.thunderAt = null;
      } else if (runStart <= r.thunderAt && sinceThunder >= THUNDER_STAYED_CALM_S) { // calm all through it
        r.thunderCalm += 1;
        r.thunderAt = null;
      }
    }
    if (r.flash > 0) r.flash = Math.max(0, r.flash - dt * 0.7);
    r.loose.forEach((l) => { l.life -= dt; l.x -= 0.15 * dt; });
    r.loose = r.loose.filter((l) => l.life > 0);
    r.fx.forEach((f) => { f.life -= dt; });
    r.fx = r.fx.filter((f) => f.life > 0);
    if (r.banner) { r.banner.life -= dt; if (r.banner.life <= 0) r.banner = null; }

    if (r.t >= r.len) finishRef.current?.();
  }

  function addFx(r, txt, color) {
    r.fx.push({ id: Math.random(), txt, color, life: 1.8 });
  }

  function pushHud() {
    const ph = phaseRef.current;
    if (ph === 'warmup') {
      const w = warmRef.current;
      setHud({ warmLeft: Math.max(0, Math.ceil(WARMUP_MIN_S - w.t)), warmStuck: w.t >= WARMUP_MAX_S });
      return;
    }
    const r = roundRef.current;
    if (!r) return;
    setHud({
      left: Math.max(0, Math.ceil(r.len - r.t)), wagons: r.wagons, lanterns: r.lanterns,
      hint: r.gate.hint, hold: r.gate.state === 'hold',
      fx: r.fx.map((f) => ({ id: f.id, txt: f.txt, color: f.color })),
      banner: r.banner?.txt || null, showWagons: lineFeatures(r.line).wagons,
    });
  }

  // ---- round end: progress, praise, session row (re-bound each render so it sees the latest progress)
  useEffect(() => { finishRef.current = finishRoundNow; });
  function finishRoundNow() {
    const r = roundRef.current;
    if (!r || phaseRef.current !== 'play') return;
    go('result');
    const calmPct = r.okSec > 0 ? r.calmSec / r.okSec : 0;
    const total = r.okSec + r.heldSec;
    const bounceBackS = r.bounces.length ? r.bounces.reduce((a, b) => a + b, 0) / r.bounces.length : undefined;
    const round = {
      line: r.line, calmPct, longestStreak: r.longest, eased: r.eased, wagonsDropped: r.wagonsDropped,
      trainsStopped: r.trainsStopped, bounceBackS, heldPct: total > 0 ? r.heldSec / total : 0,
      sec: r.len, anyCalm5: r.longest >= 5, bellCalm: r.bellCalm, lanterns: r.lanterns, thunderCalm: r.thunderCalm,
      baseMu: baseRef.current?.mu, baseSd: baseRef.current?.sd,
      busyByMin: r.busyMin.map((a) => (a && a[1] ? Math.round((a[0] / a[1]) * 1000) / 1000 : null)),
    };
    const res = finishRound(progress, round);
    if (!demo) saveProgress(activeId, res.progress);
    setProgress(res.progress);

    const pausedSec = takePausedSec();
    const poor = pausedSec / r.len > 0.7;
    // Arcade-wide daily limit: this round plus the warm-up count
    const usage = { game: GAME, rounds: 1, sec: r.len + warmRef.current.t };
    setDaily(demo ? addUsage(daily, usage) : recordDailyUsage(activeId, usage));
    const rec = makeRoundRecord({
      game: GAME, level: r.line, setup, rawByMin: round.busyByMin, ref: res.progress.ref,
      goal: goalLevel(r.goal), successPct: calmPct, longestStreakS: r.longest,
      heldPct: round.heldPct, frozenPct: Math.min(1, pausedSec / (r.len + pausedSec)), stars: res.stars,
    });
    const id = recordSession(GAME, {
      ...toSessionFields(rec),
      // Old rounds saved score = seconds survived; keep score in seconds (calm seconds) so the journal's
      // per-game score trend stays in one unit. The calm % goes in timeAbovePct (= successPct).
      score: Math.round(r.calmSec),
      scoreKind: 'calmSec',
      avgRecoverySec: bounceBackS != null ? Math.round(bounceBackS * 10) / 10 : undefined,
      okSec: Math.round(r.okSec),
      durationSec: r.len,
      playedSec: r.len,
      qualityPct: quality10s ? Math.round(quality10s.stablePct * 100) : undefined,
      wagons: r.wagonsDropped,
      baseMu: round.baseMu != null ? Math.round(round.baseMu * 1000) / 1000 : undefined,
      ...(poor ? { valid: false, invalidReason: 'bad-quality' } : {}),
    });
    if (res.unlockedLine) setLine(res.unlockedLine);
    setResult({ ...res, round, praise: praiseFor(round), sessionId: id, poor });
  }

  const beginRound = useCallback((lineId) => {
    const p = startDay(progress); // a new day may have started while the game stayed open
    if (p !== progress) setProgress(p);
    const d = demo ? daily : loadDaily(activeId);
    if (d !== daily) setDaily(d);
    const today = dailyCheck(d, GAME);
    if (!today.ok) return;
    const id = Math.min(Math.max(1, lineId), p.unlocked);
    const lastOfDay = today.lastRound;
    const len = setup === 'hands' ? Math.min(LINES[id - 1].sec, HANDS_MAX_ROUND_S) : LINES[id - 1].sec;
    roundRef.current = newRound(id, lastOfDay, p.goal, len);
    warmRef.current = { frames: [], t: 0, lastAt: 0 };
    takePausedSec();
    go(baseRef.current ? 'play' : 'warmup');
  }, [progress, setup, go, demo, daily, activeId]);

  const onStart = () => {
    primeTrainAudio();
    setStarted(true);
    setResult(null);
    beginRound(line);
  };

  const recal = () => {
    baseRef.current = null;
    resetBaseline({ forceFull: true });
    setStarted(true);
    ensureBaseline({ seconds: 30, force: true });
  };

  // ---- drawing with requestAnimationFrame (reads refs only)
  useEffect(() => {
    let raf = 0;
    let lastSrc = '';
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = sizeRef.current;
      const r = roundRef.current;
      const ph = phaseRef.current;
      const nose = ph === 'play' && r ? r.nose : ph === 'warmup' ? Math.min(0.5, 0.05 + warmRef.current.t * 0.025) : NOSE_START;
      const nWagons = ph === 'play' && r ? r.wagons : LINES[(r?.line || 1) - 1].wagons;
      const trainW = s.vw + nWagons * (s.ww + 4);
      if (trainRef.current) trainRef.current.style.transform = `translateX(${trackX(s, nose) - trainW}px)`;
      wagonRefs.current.forEach((el, i) => { if (el) el.style.display = i < nWagons ? 'block' : 'none'; });
      looseRefs.current.forEach((el, i) => {
        if (!el) return;
        const l = r?.loose?.[i];
        el.style.display = l && ph === 'play' ? 'block' : 'none';
        if (l) {
          el.style.transform = `translateX(${trackX(s, l.x) - s.vw - s.ww - 4}px)`;
          el.style.opacity = String(Math.min(1, l.life));
        }
      });
      if (hatRef.current) hatRef.current.style.display = r?.twist === 'party-hat' ? 'block' : 'none';

      const z = r?.zShown ?? 0;
      const goal = r ? roundGoal(RULES, r) : 0.6;
      const calm = ph === 'play' && z < goal;
      const src = ph !== 'play' ? train1 : calm ? train1 : z < goal + 1 ? train2 : train3;
      if (brainyRef.current && src !== lastSrc) { brainyRef.current.src = src; lastSrc = src; }
      if (barRef.current) {
        barRef.current.style.width = `${(ph === 'play' ? calm01Of(z) : 0.5) * 100}%`;
        barRef.current.style.background = calm ? 'var(--nes-green)' : 'var(--nes-red)';
      }
      if (goalMarkRef.current) goalMarkRef.current.style.left = `${calm01Of(goal) * 100}%`;
      pipsRef.current.forEach((el, i) => {
        if (el) el.style.background = r && i < Math.floor(r.calmFor) ? 'var(--nes-green)' : 'var(--nes-gray)';
      });
      drawScene(s, r, ph);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const routeRef = useRef(0);
  useEffect(() => { routeRef.current = (line === 6 ? route : line) - 1; }, [line, route]);

  function drawScene(s, r, ph) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const R = ROUTES[routeRef.current] || ROUTES[0];
    const t = performance.now() / 1000;
    const W = c.width, H = c.height;
    if (R.tint) { ctx.fillStyle = R.tint; ctx.fillRect(0, 0, W, H); }
    const decor = [...R.decor, r?.twist];
    if (decor.includes('stars')) { ctx.fillStyle = '#fff'; for (let i = 0; i < 50; i++) ctx.fillRect((i * 97) % W, (i * 53) % (H * 0.5), 2, 2); }
    if (decor.includes('moon') || decor.includes('big-moon')) {
      const big = decor.includes('big-moon');
      ctx.fillStyle = '#f4eecb'; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.2, big ? H * 0.14 : H * 0.07, 0, Math.PI * 2); ctx.fill();
    }
    if (decor.includes('flies')) { ctx.fillStyle = '#f7f06a'; for (let i = 0; i < 16; i++) ctx.fillRect((i * 61 + Math.sin(t + i) * 20 + W) % W, H * 0.45 + ((i * 37) % (H * 0.35)) + Math.cos(t * 1.3 + i) * 8, 3, 3); }
    if (decor.includes('gulls')) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = ((t * 20 + i * 180) % (W + 40)) - 20, y = H * 0.15 + i * 18 + Math.sin(t * 2 + i) * 4;
        ctx.beginPath(); ctx.moveTo(x - 6, y - 3); ctx.lineTo(x, y); ctx.lineTo(x + 6, y - 3); ctx.stroke();
      }
    }
    if (decor.includes('rain')) { ctx.fillStyle = 'rgba(180,200,255,.5)'; for (let i = 0; i < 70; i++) ctx.fillRect((i * 37 + t * 40) % W, (i * 71 + t * 400) % H, 1, 8); }
    if (decor.includes('snow')) { ctx.fillStyle = '#fff'; for (let i = 0; i < 60; i++) ctx.fillRect((i * 53 + Math.sin(t + i) * 10 + W) % W, (i * 41 + t * 30) % H, 3, 3); }
    if (decor.includes('ducks')) {
      for (let i = 0; i < 5; i++) {
        const x = ((i * 170 + t * 25) % (W + 40)) - 20, y = H * 0.25 + Math.sin(t * 2 + i) * 10;
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y, 14, 10); ctx.fillRect(x + 8, y - 6, 8, 7);
        ctx.fillStyle = '#f08a24'; ctx.fillRect(x + 16, y - 3, 4, 3);
      }
    }
    // Lit lanterns along the track (Firefly Night and up)
    if (ph === 'play' && r?.lanterns) {
      for (let i = 0; i < Math.min(r.lanterns, 12); i++) {
        const x = W * (0.06 + i * 0.05), y = H - 26;
        ctx.fillStyle = 'rgba(247,240,106,.35)'; ctx.fillRect(x - 6, y - 6, 18, 18);
        ctx.fillStyle = '#f7f06a'; ctx.fillRect(x, y, 6, 6);
      }
    }
    if (r?.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${r.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }

  // ---- screens
  const today = dailyCheck(daily, GAME);
  const roundsLeft = today.ok ? today.roundsLeft : 0;
  const dayDone = !today.ok;
  const chapter = Math.min(progress.unlocked, STORY.length);
  const card = modal === 'parent' ? weeklyCard(progress) : null;

  const lineButtons = (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {LINES.map((l) => {
        const open = l.id <= progress.unlocked;
        const on = l.id === line;
        return (
          <button
            key={l.id}
            type="button"
            disabled={!open}
            onClick={() => setLine(l.id)}
            className={`min-h-[44px] border-2 px-2 py-2 text-[9px] leading-tight text-left ${on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : open ? 'border-white/60 text-white' : 'border-white/20 text-white/30'}`}
          >
            {open ? `${l.id} ${t(l.nameKey)}` : `${l.id} ???`}
            {open && <span className="block opacity-70 mt-1">{t(l.skillKey)}</span>}
          </button>
        );
      })}
    </div>
  );

  const goodbye = (
    <div className="text-[10px] text-gray-200 leading-relaxed">
      <img src={train1} alt={t('games.tot.brainyWaves')} className="mx-auto mb-2" style={{ width: 96, imageRendering: 'pixelated' }} draggable={false} />
      <p className="text-[var(--nes-yellow)] mb-2">{t('games.tot.seeYouNext')}</p>
      <p className="mb-2">{t('games.tot.playedToday', { n: today.roundsDone })}</p>
      <p className="mb-4">{t('games.tot.daysPlayedLine', { n: progress.days })}</p>
      <button type="button" onClick={() => navigate('/games')} className="border-4 border-white/70 px-4 py-3 text-xs text-white">{t('games.tot.chooseGame')}</button>
    </div>
  );

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-hidden" id="train-stage" ref={stageRef}>
        <img
          src={cityBackground}
          alt={t('games.tot.cityAlt')}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        <style>{`
          #train-stage .tot-track { position:absolute; left:0; right:0; bottom:0; border-top:3px solid #205c6b; border-bottom:3px dashed #205c6b; }
          #train-stage .tot-train { position:absolute; left:0; bottom:-2px; display:flex; align-items:flex-end; gap:4px; z-index:1; will-change:transform; }
          #train-stage .tot-wagon { width:var(--ww); height:calc(var(--vh) * 0.42); margin-bottom:calc(var(--vh) * 0.1); background:#3a2d48; border-top:3px solid #e88f2a; position:relative; flex:none; }
          #train-stage .tot-wagon::before { content:''; position:absolute; left:12%; right:12%; top:18%; height:32%; background:repeating-linear-gradient(90deg,#f6b24a 0 24%,transparent 24% 38%); }
          #train-stage .tot-wagon::after { content:''; position:absolute; left:6%; right:6%; bottom:calc(var(--vh) * -0.1); height:calc(var(--vh) * 0.12); background:radial-gradient(circle at 18% 50%,#1b1622 0 40%,transparent 42%),radial-gradient(circle at 82% 50%,#1b1622 0 40%,transparent 42%); }
          #train-stage .tot-loose { position:absolute; left:0; bottom:-2px; z-index:1; }
          #train-stage .tot-hat { position:absolute; width:0; height:0; border-left:12px solid transparent; border-right:12px solid transparent; border-bottom:26px solid #e04f60; top:-14px; right:24%; }
        `}</style>

        <div className={`absolute top-4 left-4 w-[min(520px,60vw)] ${phase === 'menu' ? 'hidden sm:block' : 'hidden'}`}>
          <h2 className="text-2xl text-[var(--nes-yellow)]">{t('games.tot.title')}</h2>
          <p className="text-xs text-gray-100 mt-2">{t('games.tot.subtitle')}</p>
        </div>

        <section className="absolute inset-0">
          <div className="tot-track" />
          {[0, 1].map((i) => (
            <div key={i} className="tot-loose" ref={(el) => { looseRefs.current[i] = el; }} style={{ display: 'none' }}>
              <div className="tot-wagon" />
            </div>
          ))}
          <div className="tot-train" ref={trainRef}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="tot-wagon" ref={(el) => { wagonRefs.current[i] = el; }} />
            ))}
            <div style={{ position: 'relative', flex: 'none' }}>
              <img
                src={villainTrain}
                alt={t('games.tot.villainAlt')}
                style={{ height: 'var(--vh)', width: 'auto', imageRendering: 'pixelated', display: 'block' }}
                draggable={false}
              />
              <div className="tot-hat" ref={hatRef} style={{ display: 'none' }} />
            </div>
          </div>
        </section>

        {/* Brainy by the track */}
        <div className="flex flex-col items-center" style={{ position: 'absolute', bottom: '-2px', left: `${BRAINY_LEFT * 100}%`, pointerEvents: 'none', zIndex: 2 }}>
          {hud?.hint && phase === 'play' && (
            <div className="mb-1 border-2 border-[#282828] bg-white px-2 py-1 text-[9px] text-[#282828] max-w-[180px]" style={FONT}>{t(hud.hint)}</div>
          )}
          <img
            ref={brainyRef}
            src={train1}
            alt={t('games.tot.brainyAlt')}
            draggable={false}
            style={{ height: 'calc(var(--vh) * 1.25)', width: 'auto', imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }}
          />
        </div>

        {/* HUD */}
        {(phase === 'play' || phase === 'warmup') && (
          <div className="absolute top-16 left-3 border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)]/85 px-3 py-2 text-white z-20" style={{ ...FONT, width: 'min(260px, 62vw)' }}>
            <div className="flex justify-between text-[8px] opacity-80">
              <span>{t('games.tot.calm')}</span>
              {hud?.hold && <span className="text-[var(--nes-yellow)]">{t('games.tot.hold')}</span>}
            </div>
            <div className="relative h-3 mt-1 bg-[var(--nes-gray)]">
              <div ref={barRef} className="absolute left-0 top-0 bottom-0" style={{ width: '50%' }} />
              <div ref={goalMarkRef} className="absolute -top-1 -bottom-1 w-[3px] bg-[var(--nes-yellow)]" />
            </div>
            {phase === 'play' ? (
              <div className="flex items-center gap-3 mt-2 text-[10px]">
                <span>{Math.floor((hud?.left ?? 0) / 60)}:{String((hud?.left ?? 0) % 60).padStart(2, '0')}</span>
                {hud?.showWagons && <span>{t('games.tot.wagons', { n: hud?.wagons })}</span>}
                {hud?.lanterns > 0 && <span className="text-[#f7f06a]">{t('games.tot.lanterns', { n: hud.lanterns })}</span>}
                <span className="flex gap-[3px]" aria-label={t('games.tot.calmSeconds')}>
                  {[0, 1, 2, 3, 4].map((i) => <span key={i} ref={(el) => { pipsRef.current[i] = el; }} className="inline-block w-2 h-2" />)}
                </span>
              </div>
            ) : (
              <div className="mt-2 text-[9px]">{t('games.tot.getReady', { n: hud?.warmLeft ?? WARMUP_MIN_S })}</div>
            )}
          </div>
        )}

        {phase === 'warmup' && (
          // Landscape phones: right of the CALM box (not on it). The hint is inside: a bottom box would cover the train or hide behind it
          <div className="absolute inset-x-0 top-1/3 short-land:top-16 flex justify-center short-land:justify-end z-10 px-4 pointer-events-none">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 short-land:py-2 text-[10px] text-white text-center max-w-sm short-land:max-w-[calc(100%-min(260px,62vw)-1.5rem)]" style={FONT}>
              <p className="text-[var(--nes-yellow)] mb-1">{t('games.tot.trainComing')}</p>
              <p>{t('games.tot.sitStill')}</p>
              <p className="mt-1 text-[9px] opacity-80">{t('games.tot.calmSlows')}</p>
              {hud?.warmStuck && (
                <p className="mt-2 text-[var(--nes-red)]">{t('games.tot.noSignal')}</p>
              )}
            </div>
          </div>
        )}

        {/* Floating wins and banner */}
        {phase === 'play' && (
          <div className="absolute inset-x-0 top-[28%] flex flex-col items-center gap-1 pointer-events-none z-10" style={FONT}>
            {hud?.banner && <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-2 text-lg text-[var(--nes-yellow)]">{hud.banner}</div>}
            {(hud?.fx || []).slice(-3).map((f) => (
              <div key={f.id} className="text-sm font-bold" style={{ color: f.color, textShadow: '2px 2px 0 #000' }}>{f.txt}</div>
            ))}
          </div>
        )}

        {started && !isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={FONT}>
              {t('games.tot.waiting')}
            </div>
          </div>
        )}

        {phase === 'menu' && (
          <GameStartPanel title={t('games.tot.title')} onStart={dayDone ? undefined : onStart} onRecalibrate={dayDone ? undefined : recal}>
            {dayDone ? goodbye : (
              <>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-2">
                  {t('games.tot.intro1')}
                </p>
                <p className="text-[10px] text-gray-200 leading-relaxed mb-3">{t('games.tot.intro2')}</p>
                {setup === 'hands' && (
                  <p className="text-[9px] text-[var(--nes-yellow)] leading-relaxed mb-3">{t('games.tot.pillow')}</p>
                )}
                {lineButtons}
                {line === 6 && (
                  <div className="mb-3 text-[9px]">
                    <p className="mb-1 text-gray-300">{t('games.tot.pickRoute')}</p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {LINES.map((l) => (
                        <button key={l.id} type="button" onClick={() => setRoute(l.id)}
                          className={`min-h-[44px] border-2 px-2 ${route === l.id ? 'border-[var(--nes-yellow)] text-[var(--nes-yellow)]' : 'border-white/40 text-white'}`}>
                          {t(l.nameKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-center gap-3 text-[9px] text-gray-200 mb-3">
                  <span className="text-[var(--nes-yellow)]">★ {progress.stars}</span>
                  <span>{t('games.tot.passengers', { n: progress.passengers })}</span>
                  <span>{t('games.tot.daysPlayed', { n: progress.days })}</span>
                  <span>{t('games.tot.roundsLeft', { n: roundsLeft })}</span>
                </div>
                <div className="flex justify-center gap-2 mb-4">
                  <button type="button" onClick={() => setModal('story')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">{t('games.tot.story')}</button>
                  <button type="button" onClick={() => setModal('parent')} className="min-h-[44px] border-2 border-white/60 px-3 text-[9px] text-white">{t('games.tot.parentCard')}</button>
                </div>
                {demo && <p className="text-[8px] opacity-70 mb-2">{t('games.tot.demoProgress')}</p>}
              </>
            )}
          </GameStartPanel>
        )}

      </div>

      {phase === 'result' && result && (
        <RetroModal title={t('games.tot.roundDone')} showFooter={false} onCancel={() => go('menu')}>
          <div style={FONT} className="text-center">
            <div className="text-2xl text-[var(--nes-yellow)] mb-2">{'★'.repeat(result.stars)}</div>
            {result.praise.map((p) => <p key={p.key + (p.vars?.n ?? '')} className="text-[10px] mb-1">{t(p.key, p.vars)}</p>)}
            {result.newPassengers.length > 0 && (
              <p className="text-[9px] text-[var(--nes-green)] mt-2">{t('games.tot.newPassengers', { list: result.newPassengers.slice(0, 3).map((k) => t(k)).join(', '), more: result.newPassengers.length > 3 ? ` +${result.newPassengers.length - 3}` : '' })}</p>
            )}
            {result.unlockedLine && (
              <div className="border-2 border-[var(--nes-yellow)] p-2 mt-3 text-[9px] text-left">
                <p className="text-[var(--nes-yellow)] mb-1">{t('games.tot.newLine', { name: t(LINES[result.unlockedLine - 1].nameKey) })}</p>
                <p className="leading-relaxed">{t(STORY[result.unlockedLine - 1])}</p>
              </div>
            )}
            {result.practiceOffer && (
              <div className="border-2 border-white/50 p-2 mt-3 text-[9px]">
                <p className="mb-2">{t('games.tot.practiceOffer', { line: result.round.line - 1 })}</p>
                <button type="button" className="min-h-[44px] border-2 border-[var(--nes-green)] px-3 text-[var(--nes-green)]"
                  onClick={() => { setLine(result.round.line - 1); go('menu'); }}>{t('games.tot.practiceRun')}</button>
              </div>
            )}
            {result.poor && <p className="text-[8px] text-[var(--nes-yellow)] mt-2">{t('games.tot.poor')}</p>}
            {demo && <p className="text-[8px] opacity-70 mt-2">{t('games.tot.demoNotSaved')}</p>}
            <div className="mt-4">
              {!dayDone ? (
                <GameEndActions onPlayAgain={() => go('menu')} sessionId={result.sessionId} game={GAME} seconds={result.round.sec} />
              ) : (
                <>
                  <button type="button" onClick={() => go('menu')} className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)]">{t('games.tot.seeYou')}</button>
                  <div className="mt-4 text-left"><ParentReport sessionId={result.sessionId} game={GAME} seconds={result.round.sec} /></div>
                </>
              )}
            </div>
          </div>
        </RetroModal>
      )}

      {modal === 'story' && (
        <RetroModal title={t('games.tot.chapter', { n: chapter })} cancelLabel={t('games.tot.close')} onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="text-[var(--nes-yellow)] mb-2">{t(LINES[chapter - 1].nameKey)}</p>
            <p>{t(STORY[chapter - 1])}</p>
          </div>
        </RetroModal>
      )}

      {modal === 'parent' && card && (
        <RetroModal title={t('games.tot.parentCard')} cancelLabel={t('games.tot.close')} onCancel={() => setModal(null)}>
          <div style={FONT} className="text-[10px] leading-relaxed">
            <p className="mb-2 opacity-80">{t('games.tot.cardIntro')}</p>
            <p>{t('games.tot.cardRounds', { rounds: card.rounds, n: card.days })}</p>
            <p>{t('games.tot.cardCalmTime', { pct: card.calmPct == null ? '—' : `${Math.round(card.calmPct * 100)}%` })}</p>
            <p>{t('games.tot.cardStreak', { s: Math.round(card.longestStreak) })}</p>
            <p>{t('games.tot.cardGoal', { level: card.goalLevel })}{card.goalLevelWeekAgo != null ? t('games.tot.cardGoalWeekAgo', { level: card.goalLevelWeekAgo }) : ''}</p>
            <p>{t('games.tot.cardPassengers', { n: card.newPassengers })}</p>
            <p className="mt-2 text-[var(--nes-yellow)]">{t(card.talk)}</p>
          </div>
        </RetroModal>
      )}
    </div>
  );
}
/* SPDX-License-Identifier: CC-BY-SA-4.0
   Copyright (c) 2025 Itay Inbar and contributors
*/
