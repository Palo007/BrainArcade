/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Collector: samples band powers / focus / fNIRS once per second into the shared session timeline.
// Mount it only while a game page is open (see GameTimelineCollector); it renders nothing.
import { useEffect, useRef } from 'react';
import { useProcessing } from '../contexts/ProcessingContext.jsx';
import { useJoysticks } from '../contexts/JoystickContext.jsx';
import { useEEG } from '../contexts/MuseContext.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { sessionTimeline } from '../lib/sessionTimeline.js';

export function useSessionTimelineCollector() {
  const processing = useProcessing();
  const joysticks = useJoysticks();
  const eeg = useEEG();
  const quality = useQuality();
  const baseline = useBaseline();
  const latest = useRef({});
  const lastBands = useRef(null);
  latest.current = {
    bandPowers: processing?.bandPowers,
    joysticks,
    fnirs: eeg?.muse?.fnirs || null,
    badSignal: !quality || !quality.ready || quality.anyBad || quality.adjusting,
    baselineReady: !!baseline?.isBaselineReady,
    calibrating: !!baseline?.inProgress,
  };

  useEffect(() => {
    sessionTimeline.clear();
    lastBands.current = null;
    const id = setInterval(() => {
      const { bandPowers, joysticks: js, fnirs, badSignal, baselineReady, calibrating } = latest.current;
      // Skip the second when the signal is bad (also covers the frontal pause) or no fresh band powers arrived.
      const fresh = bandPowers !== lastBands.current;
      lastBands.current = bandPowers;
      // Eyes-closed / calibration seconds are not play: keep them out of the parent report.
      if (calibrating || badSignal || !fresh) return;
      let focus = null;
      if (baselineReady) {
        try { focus = js?.value01?.('focus') ?? null; } catch { focus = null; }
      }
      let hbo = null;
      try {
        if (fnirs?.baselineReady) {
          const { left, right } = fnirs.current;
          hbo = (left.hbo + right.hbo) / 2;
        }
      } catch { hbo = null; }
      sessionTimeline.push({ bandPowers, focus, hbo });
    }, 1000);
    return () => clearInterval(id);
  }, []);
}
