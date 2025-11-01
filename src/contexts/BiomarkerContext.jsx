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
    };
  }, [baseline, leftChannels, rightChannels]);

  const getBiomarker = (name) => {
    if (!compute) return { value: null, baseline: null };
    switch (name) {
      case 'frontal-midline-theta':
        return { value: compute.frontalMidlineTheta(), baseline: baselineValues?.frontalMidlineTheta() };
      case 'frontal-alpha-asymmetry':
        return { value: compute.frontalAlphaAsymmetry(), baseline: baselineValues?.frontalAlphaAsymmetry() };
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
