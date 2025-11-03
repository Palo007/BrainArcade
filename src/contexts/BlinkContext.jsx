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
  const previousValuesRef = useRef({ af7: 0, af8: 0 });

  // Blink detection parameters
  const BLINK_THRESHOLD = 200; // microvolts
  const DEBOUNCE_MS = 500; // Prevent multiple detections for same blink

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

    // Check debounce period
    if (now - lastDetectionRef.current < DEBOUNCE_MS) {
      return;
    }

    // Get frontal channel values (AF7 = index 1, AF8 = index 2)
    const af7 = Math.abs(rawEEG[1] || 0);
    const af8 = Math.abs(rawEEG[2] || 0);

    // Store current values for next comparison
    previousValuesRef.current = { af7, af8 };

    // Detect blink: amplitude spike in either frontal channel
    // Eye blinks create strong artifacts in frontal electrodes
    const isBlinkDetected = af7 > BLINK_THRESHOLD || af8 > BLINK_THRESHOLD;

    if (isBlinkDetected) {
      lastDetectionRef.current = now;
      setBlinkCount(prev => prev + 1);
      setLastBlinkTime(now);
      notifyListeners(now);

      console.log(`Blink detected! AF7: ${af7.toFixed(1)}µV, AF8: ${af8.toFixed(1)}µV`);
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
