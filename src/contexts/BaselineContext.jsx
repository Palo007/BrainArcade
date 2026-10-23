import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { useProcessing } from './ProcessingContext.jsx';
import { useQuality } from './QualityContext.jsx';
import { calibrate, computePaf, personalBands, loadCalibration, saveCalibration, appendPafHistory } from '../lib/paf.js';
import { PROFILE_CHANGED_EVENT, loadProfiles } from '../lib/profiles.js';
import { recordDailyUsage } from '../lib/progressRules.js';
import { setActiveCalibration, setDemoMode } from '../lib/sessionStore.js';
import { playChime, primeAudio } from '../lib/chime.js';
import { getAutoSkip, setAutoSkip as storeAutoSkip, SKIP_SECONDS } from '../lib/calibrationPrefs.js';

const BaselineContext = createContext(null);

// Ticks arrive at ~4 Hz. A baseline needs a few seconds of real spectrum, else games would run on zeros.
const MIN_TICKS_FULL = 20;
const MIN_TICKS_SKIP = 3;
const SKIP_WAIT_MAX_S = 10; // SKIP waits this long for the spectrum buffer to fill before giving up
const hasPower = (bp) => !!bp && Object.values(bp).some((v) => Number.isFinite(v) && v > 0);

export const useBaseline = () => useContext(BaselineContext);

export function BaselineProvider({ children, defaultSeconds = 30 }) {
  const { isConnected, muse, isMock, subscribeEEG, profile } = useEEG();
  const { bandPowers, bands, setBands } = useProcessing();
  const { hasRecentExtreme } = useQuality();

  const [baseline, setBaseline] = useState(null);
  const [inProgress, setInProgress] = useState(false);
  const [secondsRequested, setSecondsRequested] = useState(defaultSeconds);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef(null);
  const cancelRef = useRef(null);
  // Two-phase calibration: 'closed' (eyes closed, PAF) -> 'open' (eyes open, baseline + reactivity).
  // 'rest' = legacy single resting phase (no PAF, standard bands).
  const [phase, setPhase] = useState('idle');
  const [phaseCount, setPhaseCount] = useState(2);
  const [calibration, setCalibration] = useState(null); // {found, paf, reactivity, fitWarning, bands, quick}
  const [savedCalibration, setSavedCalibration] = useState(null);
  const [profileVersion, setProfileVersion] = useState(0);
  const rawRef = useRef({ closed: [[], [], [], []], open: [[], [], [], []] });
  const pafRef = useRef(null); // PAF result of the closed phase
  const prevBandsRef = useRef(null); // bands in use before a calibration started (restored on cancel)
  const openStartRef = useRef(0); // when the eyes-open phase began
  const modeRef = useRef('full'); // 'full' | 'quick' | 'single' | 'skip'
  const [autoSkip, setAutoSkipState] = useState(getAutoSkip);
  const skipRef = useRef(false); // current run is a SKIP (no rest task)
  const forceFullRef = useRef(false); // RECALIBRATE asked for the full test: ignore "always skip" until it is done
  const [skipping, setSkipping] = useState(false);
  const [baselineError, setBaselineError] = useState(null); // message when the last calibration had no usable signal
  // Games call ensureBaseline({seconds: 30}) on every render, so a SKIP keeps its own length
  const effectiveSeconds = skipping ? SKIP_SECONDS : secondsRequested;
  const deviceKey = isMock ? 'mock' : (profile?.name || 'device');

  // Reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      setBaseline(null);
      setInProgress(false);
      setVisible(false);
      setSecondsElapsed(0);
      setPhase('idle');
      setCalibration(null);
      setBaselineError(null);
    }
  }, [isConnected]);

  // Last saved calibration of this device (offered as a quick replay)
  useEffect(() => {
    if (!isConnected) return;
    const c = loadCalibration();
    setSavedCalibration(c && Number.isFinite(c.paf) && c.device === deviceKey ? c : null);
  }, [isConnected, deviceKey, profileVersion]);

  // "Always skip" is per child
  useEffect(() => { setAutoSkipState(getAutoSkip()); }, [profileVersion]);
  const setAutoSkip = useCallback((on) => {
    storeAutoSkip(on);
    setAutoSkipState(!!on);
  }, []);

  // Another child took over: drop the previous child's baseline and personal bands
  useEffect(() => {
    const onProfile = () => {
      cancelRef.current?.(); // a calibration in progress belongs to the previous child
      setBaseline(null);
      setCalibration(null);
      setBands(null);
      setProfileVersion((v) => v + 1);
    };
    window.addEventListener(PROFILE_CHANGED_EVENT, onProfile);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, onProfile);
  }, [setBands]);

  // Collect raw samples during the two phases for PAF
  useEffect(() => {
    if (!inProgress || (phase !== 'closed' && phase !== 'open')) return;
    const store = rawRef.current[phase];
    return subscribeEEG((sample) => {
      for (let ch = 0; ch < 4; ch++) store[ch].push(sample[ch] || 0);
    });
  }, [inProgress, phase, subscribeEEG]);

  // options.mode: 'full' (default: eyes closed + eyes open), 'quick' (reuse saved PAF, eyes open only),
  // 'single' (legacy: one resting phase, standard bands), 'skip' (SKIP_SECONDS, saved PAF if any, live baseline)
  const start = useCallback((seconds, options = {}) => {
    if (inProgress) return;
    primeAudio(); // start() runs inside the click handler: unlock WebAudio for the later chime
    prevBandsRef.current = bands;
    let mode = options.mode || 'full';
    if (mode === 'skip') seconds = SKIP_SECONDS;
    const skipWithPaf = mode === 'skip' && !!savedCalibration;
    if (skipWithPaf) mode = 'quick'; // same path as QUICK, just shorter and without the rest task
    modeRef.current = mode;
    skipRef.current = options.mode === 'skip';
    setSkipping(skipRef.current);
    rawRef.current = { closed: [[], [], [], []], open: [[], [], [], []] };
    pafRef.current = null;
    accumRef.current = null;
    setBaselineError(null);
    setSecondsRequested(seconds || defaultSeconds);
    setSecondsElapsed(0);
    setCalibration(null);
    if (mode === 'quick' && savedCalibration) {
      setBands(personalBands(savedCalibration.paf));
    } else if (mode !== 'full') {
      setBands(null);
    }
    setPhaseCount(mode === 'full' ? 2 : 1);
    setPhase(mode === 'full' ? 'closed' : (mode === 'quick' ? 'open' : 'rest'));
    setInProgress(true);
    if (!skipRef.current) muse?.fnirs?.resetBaseline(); // fNIRS gets a fresh baseline during the EEG rest period
  }, [inProgress, defaultSeconds, muse, savedCalibration, setBands, bands]);

  const cancel = useCallback(() => {
    if (!inProgress) return;
    // Abort accumulation and return to pre-start state, keep modal visible
    accumRef.current = null;
    setBands(prevBandsRef.current); // undo personal bands set during an aborted calibration
    skipRef.current = false;
    setSkipping(false);
    setInProgress(false);
    setSecondsElapsed(0);
    setPhase('idle');
    setPhaseCount(2);
  }, [inProgress, setBands]);

  cancelRef.current = cancel;

  // Demo (mock) mode: nothing is written to history or calibration storage
  useEffect(() => { setDemoMode(isMock); return () => setDemoMode(false); }, [isMock]);

  // Calibration time counts in the arcade-wide daily limit (15 min per child per day, lib/progressRules.js)
  const calStartRef = useRef(0);
  useEffect(() => {
    if (inProgress) { calStartRef.current = Date.now(); return; }
    if (!calStartRef.current) return;
    const sec = (Date.now() - calStartRef.current) / 1000;
    calStartRef.current = 0;
    if (!isMock) recordDailyUsage(loadProfiles().activeId, { sec });
  }, [inProgress, isMock]);

  // Publish the calibration the game actually uses so session records are stamped with it (not with whatever is stored)
  useEffect(() => {
    setActiveCalibration(calibration?.found && Number.isFinite(calibration.paf)
      ? { paf: calibration.paf, alphaReactivity: calibration.reactivity ?? null, bandsSource: 'personal', date: calibration.date }
      : { paf: null, alphaReactivity: null, bandsSource: 'standard' });
  }, [calibration]);

  // Keep the screen awake during calibration (eyes-closed phase has no touch input); ignore if unsupported
  useEffect(() => {
    if (!inProgress || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock = null;
    let stopped = false;
    navigator.wakeLock.request('screen').then((l) => {
      if (stopped) l.release().catch(() => {}); else lock = l;
    }).catch(() => {});
    return () => { stopped = true; lock?.release().catch(() => {}); };
  }, [inProgress]);

  // Accumulate baseline using periodic bandPowers snapshots (every ~250ms)
  const accumRef = useRef(null);
  useEffect(() => {
    if (!inProgress || phase === 'closed') return; // eyes-closed alpha would distort the game baseline
    if (!accumRef.current) {
      accumRef.current = {
        // per channel sums
        sums: [{}, {}, {}, {}],
        ticks: 0,
      };
    }
    if (!bandPowers || !bandPowers[0]) return;
    // Spectrum buffer not full yet (all-zero PSD): a zero tick would drag the baseline to 0
    if (!hasPower(bandPowers[1]) && !hasPower(bandPowers[2])) return;
    // Right after the chime the 8 s spectrum buffer still holds eyes-closed data: do not average it in
    // (games keep their live signal; clearing the shared buffer would blank them instead)
    if (modeRef.current === 'full' && phase === 'open' && Date.now() - openStartRef.current < Math.min(8000, secondsRequested * 500)) return;
    // Skip epochs with extremes over threshold in the last 1s
    const hasExtreme = [0, 1, 2, 3].some((ch) => hasRecentExtreme(ch, 1000));
    if (hasExtreme && !skipRef.current) return; // do not accumulate this tick (SKIP takes what it gets)
    const acc = accumRef.current;
    for (let ch = 0; ch < 4; ch++) {
      const bp = bandPowers[ch];
      for (const key of Object.keys(bp)) {
        acc.sums[ch][key] = (acc.sums[ch][key] || 0) + (bp[key] || 0);
      }
    }
    acc.ticks += 1;
  }, [bandPowers, inProgress, phase, hasRecentExtreme, secondsRequested]);

  // Timer to track seconds and finish
  useEffect(() => {
    if (!inProgress) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsElapsed(s);
      if (s >= effectiveSeconds) {
        if (phase !== 'closed') {
          // Validate before finishing: enough ticks and real power on the frontal channels (AF7/AF8)
          const a = accumRef.current;
          const ok = !!a && a.ticks >= (skipRef.current ? MIN_TICKS_SKIP : MIN_TICKS_FULL)
            && [1, 2].every((ch) => hasPower(a.sums[ch]));
          if (!ok) {
            // SKIP may still be waiting for the buffer to fill: give it some more time
            if (skipRef.current && s < effectiveSeconds + SKIP_WAIT_MAX_S) return;
            clearInterval(timer);
            accumRef.current = null;
            setBands(prevBandsRef.current);
            skipRef.current = false;
            forceFullRef.current = true; // do not auto-skip again into the same failure
            setSkipping(false);
            setInProgress(false);
            setSecondsElapsed(0);
            setPhase('idle');
            setPhaseCount(2);
            setBaselineError('No usable brain signal during calibration. Check the headband and press START to try again.');
            return;
          }
        }
        clearInterval(timer);
        if (phase === 'closed') {
          // Eyes-closed phase done: find the PAF, switch to personal bands, cue the child to open their eyes
          const [tp9, af7, af8, tp10] = rawRef.current.closed;
          pafRef.current = computePaf({ TP9: tp9, AF7: af7, AF8: af8, TP10: tp10 });
          setBands(personalBands(pafRef.current.found ? pafRef.current.paf : null));
          playChime();
          muse?.fnirs?.resetBaseline();
          openStartRef.current = Date.now();
          setPhase('open');
          setSecondsElapsed(0);
          return;
        }
        // finalize
        let cal = null;
        if (phase === 'open') {
          if (modeRef.current === 'full') {
            const c = rawRef.current.closed;
            const o = rawRef.current.open;
            cal = calibrate({ TP9: c[0], AF7: c[1], AF8: c[2], TP10: c[3] }, { TP9: o[0], AF7: o[1], AF8: o[2], TP10: o[3] });
            cal.quick = false;
            cal.date = new Date().toISOString();
            if (Number.isFinite(cal.paf) && !isMock) { // demo data must not overwrite a real calibration
              const saved = {
                paf: cal.paf,
                alphaReactivity: cal.reactivity,
                bands: { theta: cal.bands.theta, alpha: cal.bands.alpha },
                posterior: cal.source === 'posterior',
                date: cal.date,
                device: deviceKey,
              };
              saveCalibration(saved);
              appendPafHistory({
                date: cal.date, paf: cal.paf, pafLo: cal.pafLo, pafHi: cal.pafHi, cog: cal.cog,
                confidence: cal.confidence, prominenceDb: cal.prominenceDb, alphaReactivity: cal.reactivity,
                source: cal.source, nWindows: cal.nWindows, spectrum: cal.spectrum, device: deviceKey,
              });
              setSavedCalibration(saved); // offer QUICK for the next game in this session
            }
          } else if (savedCalibration) {
            cal = { found: true, paf: savedCalibration.paf, reactivity: savedCalibration.alphaReactivity ?? null,
              fitWarning: false, bands: personalBands(savedCalibration.paf), quick: true, date: savedCalibration.date };
          }
        }
        if (cal && skipRef.current) cal.skipped = true;
        forceFullRef.current = false;
        skipRef.current = false;
        setSkipping(false);
        setCalibration(cal);
        const acc = accumRef.current || { sums: [{}, {}, {}, {}], ticks: 0 };
        const avg = [{}, {}, {}, {}];
        for (let ch = 0; ch < 4; ch++) {
          for (const key of Object.keys(acc.sums[ch])) {
            avg[ch][key] = acc.sums[ch][key] / Math.max(1, acc.ticks);
          }
        }
        setBaseline({
          channels: avg, // per-channel baseline band powers
          computedAt: Date.now(),
          ticks: acc.ticks,
          seconds: effectiveSeconds,
          paf: cal?.found ? cal.paf : null,
        });
        accumRef.current = null;
        rawRef.current = { closed: [[], [], [], []], open: [[], [], [], []] };
        setInProgress(false);
        setPhase('idle');
        setPhaseCount(2); // the next calibration offered is the full one again
        setVisible(false);
        setSecondsElapsed(effectiveSeconds);
        if (resolverRef.current) {
          resolverRef.current.resolve(true);
          resolverRef.current = null;
        }
      }
    }, 250);
    return () => clearInterval(timer);
  }, [inProgress, effectiveSeconds, phase, muse, setBands, savedCalibration, deviceKey, isMock]);

  // options.force: RECALIBRATE buttons; ignores "always skip" and shows the full calibration
  const ensureBaseline = useCallback((options = {}) => {
    const seconds = options.seconds || defaultSeconds;
    if (baseline) return Promise.resolve(true);
    setVisible(true);
    return new Promise((resolve) => {
      resolverRef.current = { resolve };
      // Do NOT auto-start by default; show Start button in modal
      setSecondsRequested(seconds);
      if (options.force) forceFullRef.current = true;
      if (autoSkip && !forceFullRef.current) {
        start(SKIP_SECONDS, { mode: 'skip' });
      } else if (options.autoStart === true) {
        start(seconds);
      }
    });
  }, [baseline, defaultSeconds, start, autoSkip]);

  // options.forceFull: RECALIBRATE. Games ask for a baseline as soon as it is cleared; this makes
  // those requests show the full calibration even with "always skip" on.
  const resetBaseline = useCallback((options = {}) => {
    if (options.forceFull) forceFullRef.current = true;
    setBaseline(null);
    setCalibration(null);
  }, []);

  const value = useMemo(() => ({
    baseline,
    isBaselineReady: !!baseline,
    inProgress,
    secondsRequested: effectiveSeconds,
    secondsElapsed,
    visible,
    phase,
    phaseCount,
    calibration, // {found, paf, reactivity, fitWarning, bands, quick} of the last calibration (null = standard bands)
    savedCalibration,
    start,
    cancel,
    ensureBaseline,
    hide: () => setVisible(false),
    show: () => setVisible(true),
    resetBaseline,
    autoSkip,
    setAutoSkip,
    skipping: inProgress && skipping,
    baselineError,
  }), [baselineError, autoSkip, setAutoSkip, baseline, inProgress, effectiveSeconds, skipping, secondsElapsed, visible, phase, phaseCount, calibration, savedCalibration, ensureBaseline, start, cancel, resetBaseline]);

  return (
    <BaselineContext.Provider value={value}>{children}</BaselineContext.Provider>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
