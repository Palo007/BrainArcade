import React, { createContext, useContext, useMemo } from 'react';
import { useProcessing } from './ProcessingContext.jsx';
import { useBaseline } from './BaselineContext.jsx';
import { BANDS } from '../lib/signal.js';

const BiomarkerContext = createContext(null);

export const useBiomarkers = () => useContext(BiomarkerContext);

export function BiomarkerProvider({ children }) {
  const { bandPowers, leftChannels, rightChannels } = useProcessing();
  const { baseline } = useBaseline();

  const compute = useMemo(() => {
    const helpers = {
      bandAvg: (band) => {
        if (!bandPowers || !bandPowers[0]) return null;
        let sum = 0, count = 0;
        for (let ch = 0; ch < 4; ch++) { sum += bandPowers[ch][band] || 0; count++; }
        return sum / Math.max(1, count);
      },
      bandFrontal: (band) => {
        // Average of frontal channels AF7 (1) and AF8 (2)
        if (!bandPowers || !bandPowers[1] || !bandPowers[2]) return null;
        const l = bandPowers[1][band] || 0;
        const r = bandPowers[2][band] || 0;
        return (l + r) / 2;
      },
      bandLeft: (band) => {
        if (!bandPowers || !bandPowers[0]) return null;
        let sum = 0;
        for (const ch of leftChannels) sum += bandPowers[ch][band] || 0;
        return sum / leftChannels.length;
      },
      bandRight: (band) => {
        if (!bandPowers || !bandPowers[0]) return null;
        let sum = 0;
        for (const ch of rightChannels) sum += bandPowers[ch][band] || 0;
        return sum / rightChannels.length;
      },
      frontalMidlineTheta: () => {
        if (!bandPowers || !bandPowers[1] || !bandPowers[2]) return null;
        // Approximate with frontal electrodes AF7 (1) + AF8 (2)
        return ((bandPowers[1].theta || 0) + (bandPowers[2].theta || 0)) / 2;
      },
      frontalAlphaAsymmetry: () => {
        if (!bandPowers || !bandPowers[1] || !bandPowers[2]) return null;
        // FA = Left (AF7 alpha) - Right (AF8 alpha)
        return (bandPowers[1].alpha || 0) - (bandPowers[2].alpha || 0);
      },
      thetaAsymmetry: () => {
        if (!bandPowers || !bandPowers[1] || !bandPowers[2]) return null;
        const left = bandPowers[1].theta || 0;
        const right = bandPowers[2].theta || 0;
        const sum = left + right;
        if (sum <= 0) return 0;
        return (right - left) / sum; // right-dominant > 0
      },
      // Composite indices (frontal averages)
      betaAlphaRatio: () => {
        const beta = helpers.bandFrontal('beta');
        const alpha = helpers.bandFrontal('alpha');
        if (beta == null || alpha == null || alpha <= 0) return null;
        return beta / alpha;
      },
      thetaAlphaRatio: () => {
        const th = helpers.bandFrontal('theta');
        const al = helpers.bandFrontal('alpha');
        if (th == null || al == null || al <= 0) return null;
        return th / al;
      },
      thetaBetaRatio: () => {
        const th = helpers.bandFrontal('theta');
        const be = helpers.bandFrontal('beta');
        if (th == null || be == null || be <= 0) return null;
        return th / be;
      },
      engagementIndex: () => {
        const be = helpers.bandFrontal('beta');
        const al = helpers.bandFrontal('alpha');
        const th = helpers.bandFrontal('theta');
        if (be == null || al == null || th == null) return null;
        const denom = (al + th);
        if (denom <= 0) return null;
        return be / denom;
      },
      relaxationIndex: () => {
        const be = helpers.bandFrontal('beta');
        const al = helpers.bandFrontal('alpha');
        const th = helpers.bandFrontal('theta');
        if (be == null || al == null || th == null) return null;
        const denom = be;
        if (denom <= 0) return null;
        return (al + th) / denom;
      },
      frontalDelta: () => helpers.bandFrontal('delta'),
      // Drowsiness: normalized delta increase vs baseline is computed downstream; here expose raw frontal delta
      // Flow/Frustration high-level indices built from above components and baselines when available
    };
    return helpers;
  }, [bandPowers, leftChannels, rightChannels]);

  const baselineValues = useMemo(() => {
    if (!baseline) return null;
    const base = baseline.channels; // per-channel band powers
    return {
      bandAvg: (band) => {
        let sum = 0; for (let ch = 0; ch < 4; ch++) sum += base[ch][band] || 0; return sum / 4;
      },
      bandFrontal: (band) => {
        const l = base[1][band] || 0;
        const r = base[2][band] || 0;
        return (l + r) / 2;
      },
      bandLeft: (band) => {
        let sum = 0; for (const ch of leftChannels) sum += base[ch][band] || 0; return sum / leftChannels.length;
      },
      bandRight: (band) => {
        let sum = 0; for (const ch of rightChannels) sum += base[ch][band] || 0; return sum / rightChannels.length;
      },
      frontalMidlineTheta: () => {
        return ((base[1].theta || 0) + (base[2].theta || 0)) / 2;
      },
      frontalAlphaAsymmetry: () => {
        return (base[1].alpha || 0) - (base[2].alpha || 0);
      },
      thetaAsymmetry: () => {
        const left = base[1].theta || 0;
        const right = base[2].theta || 0;
        const sum = left + right;
        if (sum <= 0) return 0;
        return (right - left) / sum;
      },
      betaAlphaRatio: () => {
        const beta = ((base[1].beta || 0) + (base[2].beta || 0)) / 2;
        const alpha = ((base[1].alpha || 0) + (base[2].alpha || 0)) / 2;
        if (alpha <= 0) return 0;
        return beta / alpha;
      },
      thetaAlphaRatio: () => {
        const th = ((base[1].theta || 0) + (base[2].theta || 0)) / 2;
        const al = ((base[1].alpha || 0) + (base[2].alpha || 0)) / 2;
        if (al <= 0) return 0;
        return th / al;
      },
      thetaBetaRatio: () => {
        const th = ((base[1].theta || 0) + (base[2].theta || 0)) / 2;
        const be = ((base[1].beta || 0) + (base[2].beta || 0)) / 2;
        if (be <= 0) return 0;
        return th / be;
      },
      engagementIndex: () => {
        const be = ((base[1].beta || 0) + (base[2].beta || 0)) / 2;
        const al = ((base[1].alpha || 0) + (base[2].alpha || 0)) / 2;
        const th = ((base[1].theta || 0) + (base[2].theta || 0)) / 2;
        const denom = al + th;
        if (denom <= 0) return 0;
        return be / denom;
      },
      relaxationIndex: () => {
        const be = ((base[1].beta || 0) + (base[2].beta || 0)) / 2;
        const al = ((base[1].alpha || 0) + (base[2].alpha || 0)) / 2;
        const th = ((base[1].theta || 0) + (base[2].theta || 0)) / 2;
        if (be <= 0) return 0;
        return (al + th) / be;
      },
      frontalDelta: () => ((base[1].delta || 0) + (base[2].delta || 0)) / 2,
    };
  }, [baseline, leftChannels, rightChannels]);

  const getBiomarker = (name) => {
    if (!compute) return { value: null, baseline: null };
    switch (name) {
      case 'frontal-midline-theta':
        return { value: compute.frontalMidlineTheta(), baseline: baselineValues?.frontalMidlineTheta() };
      case 'frontal-alpha-asymmetry':
        return { value: compute.frontalAlphaAsymmetry(), baseline: baselineValues?.frontalAlphaAsymmetry() };
      case 'theta-asymmetry':
        return { value: compute.thetaAsymmetry(), baseline: baselineValues?.thetaAsymmetry() };
      case 'frontal-delta':
        return { value: compute.frontalDelta(), baseline: baselineValues?.frontalDelta() };
      case 'beta-alpha-ratio':
        return { value: compute.betaAlphaRatio(), baseline: baselineValues?.betaAlphaRatio() };
      case 'theta-alpha-ratio':
        return { value: compute.thetaAlphaRatio(), baseline: baselineValues?.thetaAlphaRatio() };
      case 'theta-beta-ratio':
        return { value: compute.thetaBetaRatio(), baseline: baselineValues?.thetaBetaRatio() };
      case 'engagement-index':
        return { value: compute.engagementIndex(), baseline: baselineValues?.engagementIndex() };
      case 'relaxation-index':
        return { value: compute.relaxationIndex(), baseline: baselineValues?.relaxationIndex() };
      // Bands average
      case 'alpha': case 'beta': case 'theta': case 'delta': case 'gamma': {
        return { value: compute.bandAvg(name), baseline: baselineValues?.bandAvg(name) };
      }
      // Per-side
      case 'alpha-left': case 'beta-left': case 'theta-left': case 'delta-left': case 'gamma-left': {
        const band = name.split('-')[0];
        return { value: compute.bandLeft(band), baseline: baselineValues?.bandLeft(band) };
      }
      case 'alpha-right': case 'beta-right': case 'theta-right': case 'delta-right': case 'gamma-right': {
        const band = name.split('-')[0];
        return { value: compute.bandRight(band), baseline: baselineValues?.bandRight(band) };
      }
      default:
        return { value: null, baseline: null };
    }
  };

  const value = useMemo(() => ({
    bands: BANDS,
    getBiomarker,
  }), [getBiomarker]);

  return (
    <BiomarkerContext.Provider value={value}>{children}</BiomarkerContext.Provider>
  );
}

// Convenience hook to get single biomarker and normalized value
export function useBiomarker(name) {
  const { getBiomarker } = useBiomarkers();
  const { value, baseline } = getBiomarker(name);
  // Optional normalized outputs for convenience at Level 2
  let ratio = null;
  let norm01 = null;
  if (value != null && baseline != null && baseline > 0) {
    ratio = value / baseline; // >1 means above baseline
    // Default mapping: center at baseline (1.0), 0.4 range => 0..1
    const center = 1;
    const range = 0.4;
    const t = (ratio - center) / range; // -1..1
    const clamped = Math.max(0, Math.min(1, 0.5 + 0.5 * t));
    norm01 = clamped;
  }
  return { value, baseline, ratio, norm01 };
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
