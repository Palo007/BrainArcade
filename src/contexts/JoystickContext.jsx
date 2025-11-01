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
    biomarker: 'relaxation-index',
    requiresBaseline: true,
    description: 'Relaxation via (alpha+theta)/beta (frontal)'
  },
  alertness: {
    biomarker: 'frontal-delta',
    requiresBaseline: true,
    description: 'Alertness (inverse of frontal delta increase)'
  },
  drowsiness: {
    biomarker: 'frontal-delta',
    requiresBaseline: true,
    description: 'Drowsiness (frontal delta increase vs baseline)'
  },
  stress: {
    biomarker: 'beta-alpha-ratio',
    requiresBaseline: true,
    description: 'Stress via beta/alpha ratio (frontal)'
  },
  workload: {
    biomarker: 'theta-alpha-ratio',
    requiresBaseline: true,
    description: 'Mental workload via theta/alpha ratio (frontal)'
  },
  engagement: {
    biomarker: 'engagement-index',
    requiresBaseline: true,
    description: 'Engagement via beta/(alpha+theta) (frontal)'
  },
  flow: {
    biomarker: 'engagement-index',
    requiresBaseline: true,
    description: 'Composite flow likelihood index'
  },
  frustration: {
    biomarker: 'theta-beta-ratio',
    requiresBaseline: true,
    description: 'Frustration via theta+beta pattern and asymmetry'
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
          // Relaxation index already increases with relaxation
          const { value, baseline } = getBiomarker('relaxation-index');
          return updateStable(normalizeRatio(value, baseline, { ...options, adaptiveOffset }));
        }
        case 'alertness': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const { value, baseline } = getBiomarker('frontal-delta');
          const ratio = baseline && baseline > 0 ? value / baseline : 1;
          const range = options.range ?? 0.6; // 60% increase indicates drowsiness onset
          // Map: higher delta => lower alertness
          const alert = 1 - clamp01((ratio - 1) / range);
          const adjusted = clamp01(alert + (adaptiveOffset * 0.2));
          return updateStable(adjusted);
        }
        case 'drowsiness': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const { value, baseline } = getBiomarker('frontal-delta');
          const ratio = baseline && baseline > 0 ? value / baseline : 1;
          const range = options.range ?? 0.6;
          // Map: 0 at baseline, ->1 as delta increases by 'range'
          const score = clamp01((ratio - 1) / range);
          return updateStable(score);
        }
        case 'stress': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const { value, baseline } = getBiomarker('beta-alpha-ratio');
          // Higher beta/alpha => higher stress
          return updateStable(normalizeRatio(value, baseline, { ...options, range: options.range ?? 0.5, adaptiveOffset }));
        }
        case 'workload': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const { value, baseline } = getBiomarker('theta-alpha-ratio');
          // Higher theta/alpha => higher workload
          return updateStable(normalizeRatio(value, baseline, { ...options, range: options.range ?? 0.6, adaptiveOffset }));
        }
        case 'engagement': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const { value, baseline } = getBiomarker('engagement-index');
          return updateStable(normalizeRatio(value, baseline, { ...options, range: options.range ?? 0.6, adaptiveOffset }));
        }
        case 'flow': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          // Composite: 0.3*Engagement + 0.3*(1-ExcessiveTheta) + 0.2*BetaModerate + 0.2*(1-Drowsiness)
          const eng = getBiomarker('engagement-index');
          const theta = getBiomarker('theta');
          const beta = getBiomarker('beta');
          const delta = getBiomarker('frontal-delta');
          // Normalize against baselines
          const rEng = (eng.baseline && eng.baseline > 0 && eng.value != null) ? (eng.value / eng.baseline) : 1;
          const rTheta = (theta.baseline && theta.baseline > 0 && theta.value != null) ? (theta.value / theta.baseline) : 1;
          const rBeta = (beta.baseline && beta.baseline > 0 && beta.value != null) ? (beta.value / beta.baseline) : 1;
          const rDelta = (delta.baseline && delta.baseline > 0 && delta.value != null) ? (delta.value / delta.baseline) : 1;
          const excessiveTheta = clamp01((rTheta - 1) / (options.thetaRange ?? 0.6));
          // Beta moderate: peak around ~1.2x baseline with triangular window [1.0, 1.4]
          const betaCenter = options.betaCenter ?? 1.2;
          const betaHalfWidth = options.betaHalfWidth ?? 0.2; // [1.0..1.4]
          const betaModerate = clamp01(1 - Math.abs(rBeta - betaCenter) / betaHalfWidth);
          const drowsiness = clamp01((rDelta - 1) / (options.deltaRange ?? 0.6));
          const engageNorm = clamp01((rEng - 1) / (options.engRange ?? 0.6) * 0.5 + 0.5);
          const flowIdx = clamp01(0.3 * engageNorm + 0.3 * (1 - excessiveTheta) + 0.2 * betaModerate + 0.2 * (1 - drowsiness));
          return updateStable(flowIdx);
        }
        case 'frustration': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const th = getBiomarker('theta');
          const be = getBiomarker('beta');
          const thBase = th.baseline || 0;
          const beBase = be.baseline || 0;
          const rTh = thBase > 0 && th.value != null ? th.value / thBase : 1;
          const rBe = beBase > 0 && be.value != null ? be.value / beBase : 1;
          const thInc = clamp01((rTh - 1) / (options.thetaRange ?? 0.6));
          const beInc = clamp01((rBe - 1) / (options.betaRange ?? 0.6));
          const asym = getBiomarker('theta-asymmetry');
          const rightDominance01 = asym.value == null ? 0.5 : clamp01((asym.value + 1) / 2);
          // Emphasize right-dominant theta as frustration correlate
          const frustration = clamp01(0.6 * thInc + 0.4 * beInc) * (0.7 + 0.3 * rightDominance01);
          return updateStable(frustration);
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
