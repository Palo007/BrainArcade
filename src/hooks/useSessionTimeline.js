/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Collector: samples band powers / focus / fNIRS once per second into the shared session timeline.
// Mount it only while a game page is open (see GameTimelineCollector); it renders nothing.
import { useEffect, useRef } from 'react';
import { useProcessing } from '../contexts/ProcessingContext.jsx';
import { useJoysticks } from '../contexts/JoystickContext.jsx';
import { useEEG } from '../contexts/MuseContext.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { useMotion } from '../contexts/MotionContext.jsx';
import { sessionTimeline } from '../lib/sessionTimeline.js';

const MOTION_RANK = { still: 1, moving: 2, bigMove: 3 };
const RANK_STATE = ['missing', 'still', 'moving', 'bigMove'];

export function useSessionTimelineCollector() {
  const processing = useProcessing();
  const joysticks = useJoysticks();
  const eeg = useEEG();
  const quality = useQuality();
  const baseline = useBaseline();
  const motion = useMotion();
  const latest = useRef({});
  const lastBands = useRef(null);
  // Worst motion state since the last second: MotionContext updates 4x/s, a short shake must not slip between
  const motionWorst = useRef(0);
  motionWorst.current = Math.max(motionWorst.current, MOTION_RANK[motion?.state] || 0);
  latest.current = {
    bandPowers: processing?.bandPowers,
    joysticks,
    fnirs: eeg?.muse?.fnirs || null,
    badSignal: !quality || !quality.ready || quality.anyBad || quality.adjusting,
    baselineReady: !!baseline?.isBaselineReady,
    calibrating: !!baseline?.inProgress,
    tiltDeg: motion?.tiltDeg ?? null,
    motionState: motion?.state, // an unchanged snapshot causes no render: the current state still counts
  };

  useEffect(() => {
    sessionTimeline.clear();
    lastBands.current = null;
    const id = setInterval(() => {
      const { bandPowers, joysticks: js, fnirs, badSignal, baselineReady, calibrating, tiltDeg, motionState } = latest.current;
      // Skip the second when the signal is bad (also covers the frontal pause) or no fresh band powers arrived.
      const fresh = bandPowers !== lastBands.current;
      lastBands.current = bandPowers;
      const worst = RANK_STATE[Math.max(motionWorst.current, MOTION_RANK[motionState] || 0)];
      motionWorst.current = 0;
      // Eyes-closed / calibration seconds are not play: keep them out of the parent report.
      if (calibrating) return;
      sessionTimeline.pushMotion({ state: worst, tiltDeg }); // also in bad-signal seconds: movement is often why
      if (badSignal || !fresh) return;
      let focus = null;
      if (baselineReady) {
        try { focus = js?.value01?.('focus') ?? null; } catch { focus = null; }
      }
      let hbo = null;
      try {
        if (fnirs?.baselineReady) {
          const { left, right } = fnirs.current;
          // Skip seconds the light sensor itself flags (motion, no skin contact, too bright)
          const bad = [left.quality, right.quality].some((q) => q === 'motion' || q === 'no-light' || q === 'saturated');
          if (!bad) hbo = (left.hbo + right.hbo) / 2;
        }
      } catch { hbo = null; }
      sessionTimeline.push({ bandPowers, focus, hbo });
    }, 1000);
    return () => clearInterval(id);
  }, []);
}
