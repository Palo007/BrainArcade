import React, { createContext, useContext, useMemo, useRef } from 'react';
import { driftFloor } from '../lib/fnirs.js';
import { clamp01, centered01, rise01, createDriftLevel } from '../lib/axisMath.js';
import { useBiomarkers } from './BiomarkerContext.jsx';
import { useQuality } from './QualityContext.jsx';
import { useEEG } from './MuseContext.jsx';

const JoystickContext = createContext(null);

export const useJoysticks = () => useContext(JoystickContext);

// EEG drift: the session baseline is taken once, but band power drifts for minutes while dry
// electrodes settle, which used to pin an axis at 0 or 1 for a whole round. Every ratio vs
// baseline is divided by its own slow running level (EMA in log space, lib/axisMath.js): a slow
// drift fades out, a change over seconds still shows. After a two-sided axis sits at 0 or 1 for
// 10 s the level catches up faster, so a drift cannot hold a game at an extreme. One-sided axes
// (restsAt 0 or 1) sit at their end at rest, so they never use the fast mode.
// Options per call: driftTauS (default 90; Infinity = no drift fix), mapping 'linear' | 'log'
// (default 'linear', the mapping the games are tuned to). autoAdjustBaseline is accepted and ignored.
const DRIFT_TAU_S = 90;
const PINNED_TAU_S = 20;
const PINNED_AFTER_MS = 10000;

// Level 1: Cognitive joystick axes metadata
// Defines which biomarker each axis uses and whether baseline is required
export const JOYSTICK_AXES = {
  focus: {
    biomarker: 'frontal-midline-theta',
    requiresBaseline: true,
    description: 'Frontal theta (AF7/AF8) vs baseline'
  },
  'focused-attention': {
    biomarker: 'frontal-midline-theta',
    requiresBaseline: true,
    description: 'Frontal theta (AF7/AF8) vs baseline'
  },
  relaxation: {
    biomarker: 'relaxation-index',
    requiresBaseline: true,
    description: 'Relaxation via (alpha+theta)/beta (frontal)'
  },
  alertness: {
    biomarker: 'frontal-delta',
    requiresBaseline: true,
    restsAt: 1,
    description: 'Alertness (inverse of frontal delta increase)'
  },
  drowsiness: {
    biomarker: 'frontal-delta',
    requiresBaseline: true,
    restsAt: 0,
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
    experimental: true,
    description: 'Composite flow likelihood index (experimental, weights have no published source)'
  },
  frustration: {
    biomarker: 'theta-beta-ratio',
    requiresBaseline: true,
    restsAt: 0,
    experimental: true,
    description: 'Frustration via theta+beta pattern and asymmetry (experimental)'
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
  const driftRef = useRef({}); // per axis, biomarker AND drift time ("axis|key|tauS"): createDriftLevel() trackers
  const pinnedRef = useRef({}); // per-axis time the output reached 0 or 1

  const get = useMemo(() => ({
    meta: (axis) => JOYSTICK_AXES[axis] || null,
    value01: (axis, options = {}) => {
      const mapping = options.mapping ?? 'linear';
      const holdLast = () => {
        const last = lastStableRef.current[axis];
        return typeof last === 'number' ? last : (JOYSTICK_AXES[axis]?.restsAt ?? 0.5); // no value yet → rest value
      };
      const setLast = (v) => {
        lastStableRef.current[axis] = v;
        if (v > 0.02 && v < 0.98) delete pinnedRef.current[axis];
        else if (pinnedRef.current[axis] == null) pinnedRef.current[axis] = Date.now();
        return v;
      };
      const pinnedSince = pinnedRef.current[axis];
      const twoSided = JOYSTICK_AXES[axis]?.restsAt == null;
      const fast = twoSided && pinnedSince != null && Date.now() - pinnedSince > PINNED_AFTER_MS;
      const tauS = options.driftTauS ?? DRIFT_TAU_S;
      const tau = fast ? Math.min(PINNED_TAU_S, tauS) : tauS;
      // Forehead artifact or headband being adjusted: hold the last value
      const frontalGated = () => adjusting || hasRecentExtreme(1, 1000) || hasRecentExtreme(2, 1000);

      // Drift-corrected ratio of a biomarker vs its baseline, or null without a baseline
      const relOf = (key) => {
        const { value, baseline } = getBiomarker(key);
        if (!baseline || baseline <= 0 || !(value > 0)) return null;
        const id = `${axis}|${key}|${tauS}`; // calls with different driftTauS must not share one
        const level = driftRef.current[id] || (driftRef.current[id] = createDriftLevel());
        return level(value / baseline, baseline, performance.now(), tau);
      };
      // Two-sided frontal axis: 0.5 at baseline. No ratio (no baseline, both forehead channels bad) → hold
      const centeredAxis = (key, defaultRange) => {
        if (frontalGated()) return holdLast();
        const r = relOf(key);
        return r == null ? holdLast() : setLast(centered01(r, { range: options.range ?? defaultRange, mapping }));
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
        case 'focused-attention':
          return centeredAxis('frontal-midline-theta', 0.4);
        case 'relaxation':
          return centeredAxis('relaxation-index', 0.4); // already increases with relaxation
        case 'stress':
          return centeredAxis('beta-alpha-ratio', 0.5); // higher beta/alpha => higher stress
        case 'workload':
          return centeredAxis('theta-alpha-ratio', 0.6); // higher theta/alpha => higher workload
        case 'engagement':
          return centeredAxis('engagement-index', 0.6);
        case 'alertness':
        case 'drowsiness': {
          if (frontalGated()) return holdLast();
          const r = relOf('frontal-delta');
          if (r == null) return holdLast();
          // 0 at baseline, -> 1 as delta increases by 'range' (60 % = drowsiness onset)
          const drowsy = rise01(r, { range: options.range ?? 0.6, mapping });
          return setLast(axis === 'drowsiness' ? drowsy : 1 - drowsy);
        }
        case 'flow': {
          if (frontalGated()) return holdLast();
          // Composite: 0.3*Engagement + 0.3*(1-ExcessiveTheta) + 0.2*BetaModerate + 0.2*(1-Drowsiness)
          const rEng = relOf('engagement-index');
          const rTheta = relOf('theta'); // null when no channel is usable
          const rBeta = relOf('beta');
          const rDelta = relOf('frontal-delta');
          if (rEng == null || rTheta == null || rBeta == null || rDelta == null) return holdLast();
          const excessiveTheta = rise01(rTheta, { range: options.thetaRange ?? 0.6, mapping });
          // Beta moderate: peak around ~1.2x baseline with triangular window [1.0, 1.4]
          const betaCenter = options.betaCenter ?? 1.2;
          const betaHalfWidth = options.betaHalfWidth ?? 0.2; // [1.0..1.4]
          const betaModerate = clamp01(1 - Math.abs(rBeta - betaCenter) / betaHalfWidth);
          const drowsiness = rise01(rDelta, { range: options.deltaRange ?? 0.6, mapping });
          const engageNorm = centered01(rEng, { range: options.engRange ?? 0.6, mapping });
          return setLast(clamp01(0.3 * engageNorm + 0.3 * (1 - excessiveTheta) + 0.2 * betaModerate + 0.2 * (1 - drowsiness)));
        }
        case 'frustration': {
          if (frontalGated()) return holdLast();
          const rTh = relOf('theta');
          const rBe = relOf('beta');
          if (rTh == null || rBe == null) return holdLast();
          const thInc = rise01(rTh, { range: options.thetaRange ?? 0.6, mapping });
          const beInc = rise01(rBe, { range: options.betaRange ?? 0.6, mapping });
          const asym = getBiomarker('theta-asymmetry');
          const rightDominance01 = asym.value == null ? 0.5 : clamp01((asym.value + 1) / 2);
          // Emphasize right-dominant theta as frustration correlate
          return setLast(clamp01(0.6 * thInc + 0.4 * beInc) * (0.7 + 0.3 * rightDominance01));
        }
        case 'oxygenation': {
          const v = oxygenation01();
          return v == null ? holdLast() : setLast(v);
        }
        case 'focus-plus': {
          if (frontalGated()) return holdLast();
          const r = relOf('engagement-index');
          const oxy = oxygenation01();
          if (r == null) return oxy == null ? holdLast() : setLast(oxy); // no EEG ratio: optics alone
          const eeg = centered01(r, { range: options.range ?? 0.6, mapping });
          const w = options.fnirsWeight ?? FOCUS_PLUS_FNIRS_WEIGHT;
          return setLast(oxy == null ? eeg : (1 - w) * eeg + w * oxy);
        }
        default:
          return holdLast();
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
