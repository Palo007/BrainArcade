import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useEEG } from './MuseContext.jsx';
import { BlinkDetector } from '../lib/blinkDetector.js';

const BlinkContext = createContext(null);

export const useBlink = () => useContext(BlinkContext);

/**
 * BlinkProvider - Detects eye blinks from EEG signals
 *
 * Feeds every EEG sample into a BlinkDetector (lib/blinkDetector.js) configured by the
 * device profile: classic Muse = original "any channel" rule; Muse S Athena = both ear
 * channels in step (the Athena reference sits on the forehead). Provides discrete blink
 * events that other games can use.
 */
export function BlinkProvider({ children }) {
  const { subscribeEEG, isConnected, profile } = useEEG();
  const [blinkCount, setBlinkCount] = useState(0);
  const [lastBlinkTime, setLastBlinkTime] = useState(null);

  const listenersRef = useRef(new Set());
  const detectorRef = useRef(null);
  // Live detector numbers for the on-screen debug line (?debug=1) and window.__blink
  const debugRef = useRef({});

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
    detectorRef.current?.softReset();
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

  // Feed every EEG sample to the detector; a fresh detector (2 s warm-up) on each connect
  const blinkCfg = profile.blink;
  useEffect(() => {
    if (!isConnected) return;
    const det = new BlinkDetector(blinkCfg);
    detectorRef.current = det;
    debugRef.current = det.debug;
    if (typeof window !== 'undefined') window.__blink = det.debug;
    return subscribeEEG((sample) => {
      const ev = det.push(sample);
      if (!ev) return;
      const now = Date.now();
      setBlinkCount(prev => prev + 1);
      setLastBlinkTime(now);
      notifyListeners(now);
      // eslint-disable-next-line no-console
      console.log(`Blink (${blinkCfg.mode}) threshold ${ev.threshold.toFixed(0)}µV`, ev);
    });
  }, [subscribeEEG, isConnected, notifyListeners, blinkCfg]);

  const value = {
    debugRef,
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
