/* SPDX-License-Identifier: AGPL-3.0-or-later */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEEG } from './MuseContext.jsx';
import { MotionTracker, NO_MOTION } from '../lib/motion.js';

const MotionContext = createContext({ ...NO_MOTION, setReference: () => false, clearReference: () => {} });

export const useMotion = () => useContext(MotionContext);

const SNAPSHOT_MS = 250; // 4 times per second

const sameSnap = (a, b) => Object.keys(a).every((k) => a[k] === b[k]);

/**
 * MotionProvider - head motion from the headband accelerometer + gyro (lib/motion.js).
 *
 * Works with a device that has onMotion(): the Athena adapter on the phone and the PC relay.
 * Classic Muse and mock mode have none: the snapshot stays NO_MOTION (available: false).
 * setReference() saves the current head pose; without it the first 2 s of stillness are used.
 * Debug: window.__motion is the live tracker. The phone heartbeat log gets muse.motionDiag():
 * states = snapshots still/moving/bigMove/missing (4 per second), peakDps, tiltDeg, ratePerS.
 */
export function MotionProvider({ children }) {
  const { muse, isConnected } = useEEG();
  const trackerRef = useRef(null);
  const [snap, setSnap] = useState(NO_MOTION);

  useEffect(() => {
    if (!muse || !isConnected || typeof muse.onMotion !== 'function') {
      trackerRef.current = null;
      setSnap(NO_MOTION);
      return undefined;
    }
    const tracker = new MotionTracker();
    trackerRef.current = tracker;
    if (typeof window !== 'undefined') window.__motion = tracker;
    const off = muse.onMotion((r) => tracker.push(r));
    // Summary for the phone heartbeat log (athenaAdapter): snapshots per state, fastest turn, last tilt and rate
    let sum = null;
    const resetSum = () => { sum = { still: 0, moving: 0, bigMove: 0, missing: 0, peakDps: 0, last: NO_MOTION }; };
    resetSum();
    const motionDiag = () => {
      const out = { states: `${sum.still}/${sum.moving}/${sum.bigMove}/${sum.missing}`, peakDps: sum.peakDps, tiltDeg: sum.last.tiltDeg, ratePerS: sum.last.ratePerS };
      resetSum();
      return out;
    };
    muse.motionDiag = motionDiag;
    const id = setInterval(() => {
      const next = tracker.snapshot(Date.now());
      sum[next.state]++;
      if (next.gyroDps > sum.peakDps) sum.peakDps = next.gyroDps;
      sum.last = next;
      setSnap((prev) => (sameSnap(prev, next) ? prev : next));
    }, SNAPSHOT_MS);
    return () => {
      off();
      clearInterval(id);
      if (muse.motionDiag === motionDiag) muse.motionDiag = null;
      trackerRef.current = null;
      setSnap(NO_MOTION);
    };
  }, [muse, isConnected]);

  const setReference = useCallback(() => trackerRef.current?.setReference() ?? false, []);
  const clearReference = useCallback(() => trackerRef.current?.clearReference(), []);

  const value = useMemo(() => ({ ...snap, setReference, clearReference }), [snap, setReference, clearReference]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
