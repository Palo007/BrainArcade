import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useEEG } from './MuseContext.jsx';

const BlinkContext = createContext(null);

export const useBlink = () => useContext(BlinkContext);

/**
 * BlinkProvider - Detects eye blinks from EEG signals
 *
 * Monitors frontal channels (AF7, AF8) for rapid amplitude changes
 * characteristic of eye blink artifacts. Provides discrete blink events
 * that other games can use.
 */
export function BlinkProvider({ children }) {
  const { rawEEG, isConnected } = useEEG();
  const [blinkCount, setBlinkCount] = useState(0);
  const [lastBlinkTime, setLastBlinkTime] = useState(null);

  const listenersRef = useRef(new Set());
  const lastDetectionRef = useRef(0);
  // Sliding window buffer for last WINDOW_MS samples
  const windowBufferRef = useRef([]);

  // Blink detection parameters (windowed amplitude range)
  const WINDOW_MS = 400;         // lookback window
  const RANGE_THRESHOLD_UV = 150; // amplitude change threshold in window
  const DEBOUNCE_MS = 500;        // avoid double-counting the same blink

  /**
   * Register a callback to be notified when a blink is detected
   */
  const onBlink = useCallback((callback) => {
    listenersRef.current.add(callback);

    // Return unsubscribe function
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  /**
   * Manually reset the blink counter (useful for game restarts)
   */
  const resetBlinks = useCallback(() => {
    setBlinkCount(0);
    setLastBlinkTime(null);
    lastDetectionRef.current = 0;
    windowBufferRef.current = [];
  }, []);

  /**
   * Notify all registered listeners of a blink event
   */
  const notifyListeners = useCallback((timestamp) => {
    listenersRef.current.forEach(callback => {
      try {
        callback(timestamp);
      } catch (err) {
        console.error('Error in blink listener:', err);
      }
    });
  }, []);

  // Monitor raw EEG for blink artifacts
  useEffect(() => {
    if (!isConnected || !rawEEG) return;

    const now = Date.now();
    // Read channel raw values (Muse order: TP9, AF7, AF8, TP10)
    const tp9 = rawEEG[0] ?? 0; // left ear
    const af7 = rawEEG[1] ?? 0;
    const af8 = rawEEG[2] ?? 0;
    const tp10 = rawEEG[3] ?? 0; // right ear

    // Append current sample to buffer
    const buf = windowBufferRef.current;
    buf.push({ t: now, tp9, af7, af8, tp10 });

    // Drop samples older than WINDOW_MS
    const cutoff = now - WINDOW_MS;
    while (buf.length && buf[0].t < cutoff) {
      buf.shift();
    }

    // Debounce: avoid multiple counts for the same blink
    if (now - lastDetectionRef.current < DEBOUNCE_MS) {
      return;
    }

    // Compute amplitude range in the window for each channel
    let min9 = Infinity, max9 = -Infinity;
    let min7 = Infinity, max7 = -Infinity;
    let min8 = Infinity, max8 = -Infinity;
    let min10 = Infinity, max10 = -Infinity;

    for (let i = 0; i < buf.length; i++) {
      const s = buf[i];
      if (s.tp9 < min9) min9 = s.tp9; if (s.tp9 > max9) max9 = s.tp9;
      if (s.af7 < min7) min7 = s.af7; if (s.af7 > max7) max7 = s.af7;
      if (s.af8 < min8) min8 = s.af8; if (s.af8 > max8) max8 = s.af8;
      if (s.tp10 < min10) min10 = s.tp10; if (s.tp10 > max10) max10 = s.tp10;
    }

    const range9 = max9 - min9;
    const range7 = max7 - min7;
    const range8 = max8 - min8;
    const range10 = max10 - min10;

    // Detect blink: if any electrode shows > RANGE_THRESHOLD_UV change in last WINDOW_MS
    if (
      range7 >= RANGE_THRESHOLD_UV ||
      range8 >= RANGE_THRESHOLD_UV ||
      range9 >= RANGE_THRESHOLD_UV ||
      range10 >= RANGE_THRESHOLD_UV
    ) {
      lastDetectionRef.current = now;
      setBlinkCount(prev => prev + 1);
      setLastBlinkTime(now);
      notifyListeners(now);
      // eslint-disable-next-line no-console
      console.log(
        `Blink (window rule ${WINDOW_MS}ms/${RANGE_THRESHOLD_UV}µV) TP9Δ=${range9.toFixed(1)} AF7Δ=${range7.toFixed(1)} AF8Δ=${range8.toFixed(1)} TP10Δ=${range10.toFixed(1)} µV`
      );
    }
  }, [rawEEG, isConnected, notifyListeners]);

  const value = {
    blinkCount,
    lastBlinkTime,
    onBlink,
    resetBlinks,
  };

  return (
    <BlinkContext.Provider value={value}>
      {children}
    </BlinkContext.Provider>
  );
}

/**
 * Hook to detect blinks in a component
 *
 * @param {Function} callback - Called when a blink is detected
 * @returns {Object} { blinkCount, lastBlinkTime, resetBlinks }
 *
 * @example
 * const { blinkCount, resetBlinks } = useBlinkDetector((timestamp) => {
 *   console.log('Blink detected at', timestamp);
 * });
 */
export function useBlinkDetector(callback) {
  const context = useBlink();

  if (!context) {
    throw new Error('useBlinkDetector must be used within BlinkProvider');
  }

  const { onBlink, blinkCount, lastBlinkTime, resetBlinks } = context;

  useEffect(() => {
    if (callback) {
      const unsubscribe = onBlink(callback);
      return unsubscribe;
    }
  }, [callback, onBlink]);

  return {
    blinkCount,
    lastBlinkTime,
    resetBlinks,
  };
}

/* SPDX-License-Identifier: CC-BY-SA-4.0
   Copyright (c) 2025 Itay Inbar
*/
