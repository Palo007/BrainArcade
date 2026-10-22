import React, { createContext, useContext, useMemo } from 'react';
import { useProcessing } from './ProcessingContext.jsx';
import { useBaseline } from './BaselineContext.jsx';
import { useQuality } from './QualityContext.jsx';
import { BANDS } from '../lib/signal.js';

const BiomarkerContext = createContext(null);

export const useBiomarkers = () => useContext(BiomarkerContext);

export function BiomarkerProvider({ children }) {
  const { bandPowers, leftChannels, rightChannels, bands } = useProcessing();
  const { baseline } = useBaseline();
  const { perChannelBad } = useQuality();
  // All-channel averages skip channels flagged bad (a loose ear sensor must not skew them); same set for the baseline
  const badKey = (perChannelBad || []).map((b) => (b ? 1 : 0)).join('');
  const okChannels = useMemo(() => [0, 1, 2, 3].filter((ch) => badKey[ch] !== '1'), [badKey]);
  // Frontal values: AF7/AF8 minus any flagged bad. One bad → the other alone; both bad → null (axes hold)
  const frontalOk = useMemo(() => [1, 2].filter((ch) => badKey[ch] !== '1'), [badKey]);

  const compute = useMemo(() => {
    const helpers = {
      bandAvg: (band) => {
        if (!bandPowers || !bandPowers[0]) return null;
        if (okChannels.length === 0) return null; // every channel bad: callers hold their last value
        let sum = 0;
        for (const ch of okChannels) sum += bandPowers[ch][band] || 0;
        return sum / okChannels.length;
      },
      bandFrontal: (band) => {
        // Average of the usable frontal channels AF7 (1) and AF8 (2)
        if (!bandPowers || frontalOk.length === 0 || frontalOk.some((ch) => !bandPowers[ch])) return null;
        let sum = 0;
        for (const ch of frontalOk) sum += bandPowers[ch][band] || 0;
        return sum / frontalOk.length;
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
      // Frontal theta at AF7/AF8. Muse has no midline (Fz) electrode; the key name is kept for the games
      frontalMidlineTheta: () => helpers.bandFrontal('theta'),
      frontalAlphaAsymmetry: () => {
        if (!bandPowers || !bandPowers[1] || !bandPowers[2] || frontalOk.length < 2) return null;
        // FA = Left (AF7 alpha) - Right (AF8 alpha)
        return (bandPowers[1].alpha || 0) - (bandPowers[2].alpha || 0);
      },
      thetaAsymmetry: () => {
        if (!bandPowers || !bandPowers[1] || !bandPowers[2] || frontalOk.length < 2) return null;
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
  }, [bandPowers, leftChannels, rightChannels, okChannels, frontalOk]);

  const baselineValues = useMemo(() => {
    if (!baseline) return null;
    const base = baseline.channels; // per-channel band powers
    // Same channel sets as the live values, so a flagged channel drops out of both
    const avgOf = (chs, band) => {
      if (chs.length === 0) return null;
      let sum = 0;
      for (const ch of chs) sum += base[ch][band] || 0;
      return sum / chs.length;
    };
    const bf = (band) => avgOf(frontalOk, band);
    const ratio = (num, den) => (num != null && den > 0 ? num / den : 0);
    return {
      bandAvg: (band) => avgOf(okChannels, band),
      bandFrontal: bf,
      bandLeft: (band) => avgOf(leftChannels, band),
      bandRight: (band) => avgOf(rightChannels, band),
      frontalMidlineTheta: () => bf('theta'),
      frontalAlphaAsymmetry: () => (base[1].alpha || 0) - (base[2].alpha || 0),
      thetaAsymmetry: () => {
        const left = base[1].theta || 0;
        const right = base[2].theta || 0;
        const sum = left + right;
        if (sum <= 0) return 0;
        return (right - left) / sum;
      },
      betaAlphaRatio: () => ratio(bf('beta'), bf('alpha')),
      thetaAlphaRatio: () => ratio(bf('theta'), bf('alpha')),
      thetaBetaRatio: () => ratio(bf('theta'), bf('beta')),
      engagementIndex: () => ratio(bf('beta'), (bf('alpha') ?? 0) + (bf('theta') ?? 0)),
      relaxationIndex: () => ratio((bf('alpha') ?? 0) + (bf('theta') ?? 0), bf('beta')),
      frontalDelta: () => bf('delta'),
    };
  }, [baseline, leftChannels, rightChannels, okChannels, frontalOk]);

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
    bands: bands || BANDS, // personal alpha/theta once PAF is calibrated, else 8-13 / 4-8 Hz
    getBiomarker,
  }), [getBiomarker, bands]);

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
