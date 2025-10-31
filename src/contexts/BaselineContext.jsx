import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { useProcessing } from './ProcessingContext.jsx';
import { useQuality } from './QualityContext.jsx';

const BaselineContext = createContext(null);

export const useBaseline = () => useContext(BaselineContext);

export function BaselineProvider({ children, defaultSeconds = 30 }) {
  const { isConnected } = useEEG();
  const { bandPowers } = useProcessing();
  const { hasRecentExtreme } = useQuality();

  const [baseline, setBaseline] = useState(null);
  const [inProgress, setInProgress] = useState(false);
  const [secondsRequested, setSecondsRequested] = useState(defaultSeconds);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef(null);

  // Reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      setBaseline(null);
      setInProgress(false);
      setVisible(false);
      setSecondsElapsed(0);
    }
  }, [isConnected]);

  const start = useCallback((seconds) => {
    if (inProgress) return;
    setSecondsRequested(seconds || defaultSeconds);
    setSecondsElapsed(0);
    setInProgress(true);
  }, [inProgress, defaultSeconds]);

  // Accumulate baseline using periodic bandPowers snapshots (every ~250ms)
  const accumRef = useRef(null);
  useEffect(() => {
    if (!inProgress) return;
    if (!accumRef.current) {
      accumRef.current = {
        // per channel sums
        sums: [{}, {}, {}, {}],
        ticks: 0,
      };
    }
    if (!bandPowers || !bandPowers[0]) return;
    // Skip epochs with extremes over threshold in the last 1s
    const hasExtreme = [0, 1, 2, 3].some((ch) => hasRecentExtreme(ch, 1000));
    if (hasExtreme) return; // do not accumulate this tick
    const acc = accumRef.current;
    for (let ch = 0; ch < 4; ch++) {
      const bp = bandPowers[ch];
      for (const key of Object.keys(bp)) {
        acc.sums[ch][key] = (acc.sums[ch][key] || 0) + (bp[key] || 0);
      }
    }
    acc.ticks += 1;
  }, [bandPowers, inProgress, hasRecentExtreme]);

  // Timer to track seconds and finish
  useEffect(() => {
    if (!inProgress) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsElapsed(s);
      if (s >= secondsRequested) {
        clearInterval(timer);
        // finalize
        const acc = accumRef.current;
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
          seconds: secondsRequested,
        });
        accumRef.current = null;
        setInProgress(false);
        setVisible(false);
        setSecondsElapsed(secondsRequested);
        if (resolverRef.current) {
          resolverRef.current.resolve(true);
          resolverRef.current = null;
        }
      }
    }, 250);
    return () => clearInterval(timer);
  }, [inProgress, secondsRequested]);

  const ensureBaseline = useCallback((options = {}) => {
    const seconds = options.seconds || defaultSeconds;
    if (baseline) return Promise.resolve(true);
    setVisible(true);
    return new Promise((resolve) => {
      resolverRef.current = { resolve };
      // Kick off after showing UI; allow callers to auto-start via options.autoStart
      if (options.autoStart !== false) {
        start(seconds);
      } else {
        setSecondsRequested(seconds);
      }
    });
  }, [baseline, defaultSeconds, start]);

  const resetBaseline = useCallback(() => {
    setBaseline(null);
  }, []);

  const value = useMemo(() => ({
    baseline,
    isBaselineReady: !!baseline,
    inProgress,
    secondsRequested,
    secondsElapsed,
    visible,
    start,
    ensureBaseline,
    hide: () => setVisible(false),
    show: () => setVisible(true),
    resetBaseline,
  }), [baseline, inProgress, secondsRequested, secondsElapsed, visible, ensureBaseline, start, resetBaseline]);

  return (
    <BaselineContext.Provider value={value}>{children}</BaselineContext.Provider>
  );
}
