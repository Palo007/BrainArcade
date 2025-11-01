import React, { createContext, useContext, useMemo, useRef } from 'react';
import { useBiomarkers } from './BiomarkerContext.jsx';
import { useQuality } from './QualityContext.jsx';

const JoystickContext = createContext(null);

export const useJoysticks = () => useContext(JoystickContext);

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function normalizeRatio(curr, base, { center = 1, range = 0.4 } = {}) {
  if (!base || base <= 0 || curr == null) return 0.5;
  const r = curr / base;
  const t = (r - center) / range; // -1..1 at ±range
  return clamp01(0.5 + 0.5 * t);
}

// Level 1: Cognitive joystick axes metadata
// Defines which biomarker each axis uses and whether baseline is required
export const JOYSTICK_AXES = {
  focus: {
    biomarker: 'frontal-midline-theta',
    requiresBaseline: true,
    description: 'Focused attention (normalized vs baseline)'
  },
  'focused-attention': {
    biomarker: 'frontal-midline-theta',
    requiresBaseline: true,
    description: 'Focused attention (normalized vs baseline)'
  },
  relaxation: {
    biomarker: 'frontal-midline-theta',
    requiresBaseline: true,
    description: 'Relaxation (inverse of FMT vs baseline)'
  },
};

export function JoystickProvider({ children }) {
  const { getBiomarker } = useBiomarkers();
  const { hasRecentExtreme, adjusting } = useQuality();
  const lastStableRef = useRef({}); // per-axis last stable output

  const get = useMemo(() => ({
    meta: (axis) => JOYSTICK_AXES[axis] || null,
    value01: (axis, options = {}) => {
      const useStable = () => {
        const last = lastStableRef.current[axis];
        return typeof last === 'number' ? last : 0.5;
      };
      const updateStable = (v) => {
        lastStableRef.current[axis] = v;
        return v;
      };
      switch (axis) {
        case 'focus':
        case 'focused-attention': {
          // Gate by frontal extremes
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) {
            return useStable();
          }
          const { value, baseline } = getBiomarker('frontal-midline-theta');
          return updateStable(normalizeRatio(value, baseline, options));
        }
        case 'relaxation': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) {
            return useStable();
          }
          const { value, baseline } = getBiomarker('frontal-midline-theta');
          // Relaxation increases when theta decreases vs baseline
          const ratio = baseline && baseline > 0 ? value / baseline : 1;
          // Map ratio < 1 to > 0.5
          const range = options.range ?? 0.4;
          const centerOut = options.baselineCenter ?? 0.5; // output when ratio == 1
          const gain = options.gain ?? 0.5; // per-range scaling
          return updateStable(clamp01(centerOut + gain * ((1 - ratio) / range)));
        }
        default:
          return useStable();
      }
    },
  }), [getBiomarker, hasRecentExtreme, adjusting]);

  return (
    <JoystickContext.Provider value={get}>{children}</JoystickContext.Provider>
  );
}

export function useJoystick(axis, options) {
  const api = useJoysticks();
  const value01 = api?.value01(axis, options) ?? 0.5;
  return { value01 };
}
