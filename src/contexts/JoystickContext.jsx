import React, { createContext, useContext, useMemo, useRef } from 'react';
import { driftFloor } from '../lib/fnirs.js';
import { useBiomarkers } from './BiomarkerContext.jsx';
import { useQuality } from './QualityContext.jsx';
import { useEEG } from './MuseContext.jsx';

const JoystickContext = createContext(null);

export const useJoysticks = () => useContext(JoystickContext);

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// r = drift-corrected ratio vs baseline (see rel() below), null when there is no baseline
function normalizeRatio(r, { center = 1, range = 0.4 } = {}) {
  if (r == null) return 0.5;
  const t = (r - center) / range; // -1..1 at ±range
  return clamp01(0.5 + 0.5 * t);
}

// EEG drift: the session baseline is taken once, but band power drifts for minutes while dry
// electrodes settle, which used to pin an axis at 0 or 1 for a whole round. Every ratio vs
// baseline is divided by its own slow running level (EMA in log space): a slow drift fades out,
// a change over seconds still shows. After an axis sits at 0 or 1 for 10 s the level catches up
// faster, so a drift cannot hold a game at an extreme. (Replaces the old autoAdjustBaseline offset,
// which could move the output by 0.06 at most; the option is still accepted and ignored.)
const DRIFT_TAU_S = 90;
const PINNED_TAU_S = 20;
const PINNED_AFTER_MS = 10000;

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
  // fNIRS axes (Muse S Athena optics, see lib/fnirs.js)
  oxygenation: {
    biomarker: 'fnirs-oxygenation',
    requiresBaseline: false,
    requiresFnirs: true,
    description: 'Forehead oxygenation (ΔHbO − ΔHbR), slow: 3-6 s lag'
  },
  'focus-plus': {
    biomarker: 'engagement-index',
    requiresBaseline: true,
    description: 'Engagement (EEG, fast) blended with fNIRS oxygenation (slow); EEG only without optics'
  },
};

const FNIRS_START_SCALE = 0.35; // µM of oxygenation index that maps to 0 or 1 (grows with upswings)
const FOCUS_PLUS_FNIRS_WEIGHT = 0.4;

export function JoystickProvider({ children }) {
  const { getBiomarker } = useBiomarkers();
  const { hasRecentExtreme, adjusting } = useQuality();
  const { muse } = useEEG();
  const fnirs = muse?.fnirs || null;
  const fnirsScaleRef = useRef(FNIRS_START_SCALE);
  const fnirsDriftRef = useRef(null); // driftFloor() for the current fNIRS baseline
  const fnirsTRef = useRef(0);
  const lastStableRef = useRef({}); // per-axis last stable output
  const driftRef = useRef({}); // per-biomarker running level: { log, t, base }
  const pinnedRef = useRef({}); // per-axis time the output reached 0 or 1

  const get = useMemo(() => ({
    meta: (axis) => JOYSTICK_AXES[axis] || null,
    value01: (axis, options = {}) => {
      const useStable = () => {
        const last = lastStableRef.current[axis];
        return typeof last === 'number' ? last : 0.5;
      };
      const updateStable = (v) => {
        lastStableRef.current[axis] = v;
        if (v > 0.02 && v < 0.98) delete pinnedRef.current[axis];
        else if (pinnedRef.current[axis] == null) pinnedRef.current[axis] = Date.now();
        return v;
      };
      const pinnedSince = pinnedRef.current[axis];
      const fast = pinnedSince != null && Date.now() - pinnedSince > PINNED_AFTER_MS;

      // Drift-corrected ratio of a biomarker vs its baseline, or null without a baseline
      const rel = (key, value, baseline) => {
        if (!baseline || baseline <= 0 || !(value > 0)) return null;
        const r = value / baseline;
        const now = performance.now();
        let d = driftRef.current[key];
        if (!d || d.base !== baseline) d = driftRef.current[key] = { log: 0, t: now, base: baseline }; // new baseline → start at it
        const dt = Math.min(5, (now - d.t) / 1000);
        d.t = now;
        d.log += (Math.log(r) - d.log) * (1 - Math.exp(-dt / (fast ? PINNED_TAU_S : DRIFT_TAU_S)));
        return r / Math.exp(d.log);
      };
      const relOf = (key) => {
        const { value, baseline } = getBiomarker(key);
        return rel(key, value, baseline);
      };

      // fNIRS oxygenation as 0..1 (0.5 = baseline), or null when not available / not trustworthy
      const oxygenation01 = () => {
        const idx = fnirs?.index();
        if (!idx?.ready) {
          fnirsScaleRef.current = FNIRS_START_SCALE; // new baseline → start scaling again
          fnirsDriftRef.current = null;
          return null;
        }
        const now = performance.now();
        const dt = Math.min(1, (now - fnirsTRef.current) / 1000);
        fnirsTRef.current = now;
        if (!fnirsDriftRef.current) fnirsDriftRef.current = driftFloor();
        const oxy = fnirsDriftRef.current(idx.oxy, dt, idx.bad); // same drift fix as Focus Ball / Glow Orb
        if (idx.bad) return null;
        // Grows with strong upswings, relaxes back over ~30 s, so one spike cannot cap the range
        fnirsScaleRef.current += (FNIRS_START_SCALE - fnirsScaleRef.current) * (1 - Math.exp(-dt / 30));
        fnirsScaleRef.current = Math.max(fnirsScaleRef.current, oxy * 0.9);
        return clamp01(0.5 + 0.5 * (oxy / fnirsScaleRef.current));
      };

      switch (axis) {
        case 'focus':
        case 'focused-attention': {
          // Gate by frontal extremes
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) {
            return useStable();
          }
          return updateStable(normalizeRatio(relOf('frontal-midline-theta'), options));
        }
        case 'relaxation': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) {
            return useStable();
          }
          // Relaxation index already increases with relaxation
          return updateStable(normalizeRatio(relOf('relaxation-index'), options));
        }
        case 'alertness': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const ratio = relOf('frontal-delta') ?? 1;
          const range = options.range ?? 0.6; // 60% increase indicates drowsiness onset
          // Map: higher delta => lower alertness
          return updateStable(1 - clamp01((ratio - 1) / range));
        }
        case 'drowsiness': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const ratio = relOf('frontal-delta') ?? 1;
          const range = options.range ?? 0.6;
          // Map: 0 at baseline, ->1 as delta increases by 'range'
          return updateStable(clamp01((ratio - 1) / range));
        }
        case 'stress': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          // Higher beta/alpha => higher stress
          return updateStable(normalizeRatio(relOf('beta-alpha-ratio'), { ...options, range: options.range ?? 0.5 }));
        }
        case 'workload': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          // Higher theta/alpha => higher workload
          return updateStable(normalizeRatio(relOf('theta-alpha-ratio'), { ...options, range: options.range ?? 0.6 }));
        }
        case 'engagement': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          return updateStable(normalizeRatio(relOf('engagement-index'), { ...options, range: options.range ?? 0.6 }));
        }
        case 'flow': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          // Composite: 0.3*Engagement + 0.3*(1-ExcessiveTheta) + 0.2*BetaModerate + 0.2*(1-Drowsiness)
          const rEng = relOf('engagement-index');
          const rTheta = relOf('theta'); // null when no channel is usable
          const rBeta = relOf('beta');
          const rDelta = relOf('frontal-delta');
          if (rEng == null || rTheta == null || rBeta == null || rDelta == null) return useStable();
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
          const rTh = relOf('theta');
          const rBe = relOf('beta');
          if (rTh == null || rBe == null) return useStable();
          const thInc = clamp01((rTh - 1) / (options.thetaRange ?? 0.6));
          const beInc = clamp01((rBe - 1) / (options.betaRange ?? 0.6));
          const asym = getBiomarker('theta-asymmetry');
          const rightDominance01 = asym.value == null ? 0.5 : clamp01((asym.value + 1) / 2);
          // Emphasize right-dominant theta as frustration correlate
          const frustration = clamp01(0.6 * thInc + 0.4 * beInc) * (0.7 + 0.3 * rightDominance01);
          return updateStable(frustration);
        }
        case 'oxygenation': {
          const v = oxygenation01();
          return v == null ? useStable() : updateStable(v);
        }
        case 'focus-plus': {
          if (adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000)) return useStable();
          const eeg = normalizeRatio(relOf('engagement-index'), { ...options, range: options.range ?? 0.6 });
          const oxy = oxygenation01();
          const w = options.fnirsWeight ?? FOCUS_PLUS_FNIRS_WEIGHT;
          return updateStable(oxy == null ? eeg : (1 - w) * eeg + w * oxy);
        }
        default:
          return useStable();
      }
    },
  }), [getBiomarker, hasRecentExtreme, adjusting, fnirs]);

  return (
    <JoystickContext.Provider value={get}>{children}</JoystickContext.Provider>
  );
}

export function useJoystick(axis, options) {
  const api = useJoysticks();
  const value01 = api?.value01(axis, options) ?? 0.5;
  return { value01 };
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
