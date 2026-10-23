/* SPDX-License-Identifier: AGPL-3.0-or-later */
// The phone's own tilt sensor: is the phone held up, or lying flat (the child bends the head down to it)?
// Stand-in for the Play Setup Phase 2 head-angle check; works without headband motion data. Hint only:
// the game keeps going. No sensor (PC, iOS without permission): never flat.
import { useEffect, useRef } from 'react';

export const FLAT_DEG = 55; // screen tipped more than this from upright = held too flat
export const FLAT_FOR_S = 3;

// Angle of the screen from upright, in degrees: 0 = screen faces the child, 90 = flat on the lap
export function screenTiltDeg(gx, gy, gz) {
  const n = Math.hypot(gx, gy, gz);
  if (!(n > 3)) return null; // no gravity in the reading (a sensor without it)
  return (Math.asin(Math.min(1, Math.abs(gz) / n)) * 180) / Math.PI;
}

// ref.current = { flat: held flat for 3 s, deg: last angle or null }
export function usePhoneTilt(enabled) {
  const ref = useRef({ flat: false, deg: null });
  useEffect(() => {
    ref.current = { flat: false, deg: null };
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return undefined;
    let flatSince = 0;
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const deg = screenTiltDeg(a.x || 0, a.y || 0, a.z || 0);
      if (deg == null) return;
      const now = performance.now();
      if (deg > FLAT_DEG) { if (!flatSince) flatSince = now; } else flatSince = 0;
      ref.current = { flat: !!flatSince && now - flatSince > FLAT_FOR_S * 1000, deg };
    };
    try { window.addEventListener('devicemotion', onMotion); } catch { return undefined; }
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [enabled]);
  return ref;
}
