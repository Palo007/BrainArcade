import React, { createContext, useContext, useMemo } from 'react';
import { useBiomarkers } from './BiomarkerContext.jsx';

const JoystickContext = createContext(null);

export const useJoysticks = () => useContext(JoystickContext);

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function normalizeRatio(curr, base, { center = 1, range = 0.4 } = {}) {
  if (!base || base <= 0 || curr == null) return 0.5;
  const r = curr / base;
  const t = (r - center) / range; // -1..1 at ±range
  return clamp01(0.5 + 0.5 * t);
}

export function JoystickProvider({ children }) {
  const { getBiomarker } = useBiomarkers();

  const get = useMemo(() => ({
    value01: (axis, options = {}) => {
      switch (axis) {
        case 'focused-attention': {
          const { value, baseline } = getBiomarker('frontal-midline-theta');
          return normalizeRatio(value, baseline, options);
        }
        case 'relaxation': {
          const { value, baseline } = getBiomarker('frontal-midline-theta');
          // Relaxation increases when theta decreases vs baseline
          const ratio = baseline && baseline > 0 ? value / baseline : 1;
          // Map ratio < 1 to > 0.5
          const range = options.range ?? 0.4;
          return clamp01(0.5 + 0.5 * ((1 - ratio) / range));
        }
        default:
          return 0.5;
      }
    },
  }), [getBiomarker]);

  return (
    <JoystickContext.Provider value={get}>{children}</JoystickContext.Provider>
  );
}

export function useJoystick(axis, options) {
  const api = useJoysticks();
  const value01 = api?.value01(axis, options) ?? 0.5;
  return { value01 };
}

