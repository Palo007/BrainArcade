import React, { createContext, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { useBiomarkers } from './BiomarkerContext.jsx';
import { useQuality } from './QualityContext.jsx';

const JoystickContext = createContext(null);

export const useJoysticks = () => useContext(JoystickContext);

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function normalizeRatio(curr, base, { center = 1, range = 0.4, adaptiveOffset = 0 } = {}) {
  if (!base || base <= 0 || curr == null) return 0.5;
  const r = curr / base;
  const adjustedCenter = center + adaptiveOffset;
  const t = (r - adjustedCenter) / range; // -1..1 at ±range
  return clamp01(0.5 + 0.5 * t);
}

// Level 1: Cognitive joystick axes metadata
// Defines which biomarker each axis uses and whether baseline is required
//
// Optional feature: autoAdjustBaseline
// Games can pass { autoAdjustBaseline: true } to enable adaptive baseline adjustment.
// When enabled, if the user is stuck at extremes (0 or 100) for 10+ seconds,
// the baseline center smoothly shifts to make the joystick more responsive.
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

  // Auto-baseline adjustment state
  const [adaptiveOffsets, setAdaptiveOffsets] = useState({});
  const extremeTimersRef = useRef({}); // track time spent at extremes
  const autoAdjustEnabledRef = useRef({}); // track which axes have auto-adjustment enabled

  // Monitor values and adjust baseline adaptively (only for opted-in axes)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only process axes that have auto-adjustment enabled
      const enabledAxes = Object.keys(autoAdjustEnabledRef.current).filter(
        (axis) => autoAdjustEnabledRef.current[axis]
      );

      enabledAxes.forEach((axis) => {
        const currentValue = lastStableRef.current[axis];
        if (currentValue == null) return;

        const isAtExtreme = currentValue <= 0.05 || currentValue >= 0.95;
        const now = Date.now();

        if (!extremeTimersRef.current[axis]) {
          extremeTimersRef.current[axis] = { startTime: null, lastValue: null };
        }

        const timer = extremeTimersRef.current[axis];

        if (isAtExtreme) {
          // Start or continue tracking extreme time
          if (timer.startTime === null) {
            timer.startTime = now;
            timer.lastValue = currentValue;
          }

          const timeAtExtreme = (now - timer.startTime) / 1000; // seconds

          // After 10 seconds at extreme, start adjusting baseline
          if (timeAtExtreme > 10) {
            const targetOffset = currentValue >= 0.95 ? 0.05 : -0.05; // shift center up or down

            setAdaptiveOffsets((offsets) => {
              const currentOffset = offsets[axis] || 0;
              // Smooth exponential adjustment
              const newOffset = currentOffset * 0.95 + targetOffset * 0.05;
              return { ...offsets, [axis]: newOffset };
            });
          }
        } else {
          // Not at extreme - reset timer and gradually return offset to 0
          timer.startTime = null;
          timer.lastValue = null;

          setAdaptiveOffsets((offsets) => {
            const currentOffset = offsets[axis];
            if (currentOffset != null && Math.abs(currentOffset) > 0.001) {
              // Gradually reset to 0
              const newOffset = currentOffset * 0.98;
              return { ...offsets, [axis]: newOffset };
            }
            return offsets;
          });
        }
      });
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []);

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

      // Register if this axis should use auto-adjustment
      if (options.autoAdjustBaseline !== undefined) {
        autoAdjustEnabledRef.current[axis] = options.autoAdjustBaseline;
      }

      const adaptiveOffset = adaptiveOffsets[axis] || 0;

      switch (axis) {
        case 'focus':
        case 'focused-attention': {
          // Gate by frontal extremes
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) {
            return useStable();
          }
          const { value, baseline } = getBiomarker('frontal-midline-theta');
          return updateStable(normalizeRatio(value, baseline, { ...options, adaptiveOffset }));
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

          // Apply adaptive offset
          const baseValue = centerOut + gain * ((1 - ratio) / range);
          const adjustedValue = baseValue - (adaptiveOffset * 0.5); // apply inverse for relaxation
          return updateStable(clamp01(adjustedValue));
        }
        default:
          return useStable();
      }
    },
  }), [getBiomarker, hasRecentExtreme, adjusting, adaptiveOffsets]);

  return (
    <JoystickContext.Provider value={get}>{children}</JoystickContext.Provider>
  );
}

export function useJoystick(axis, options) {
  const api = useJoysticks();
  const value01 = api?.value01(axis, options) ?? 0.5;
  return { value01 };
}
