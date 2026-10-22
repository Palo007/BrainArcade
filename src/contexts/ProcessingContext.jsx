import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { SAMPLE_RATE, computeWelchPSD, bandPowersFromPSD, BANDS } from '../lib/signal.js';
import { BlinkDetector } from '../lib/blinkDetector.js';

const ProcessingContext = createContext(null);

export const useProcessing = () => useContext(ProcessingContext);

const CHANNEL_LABELS = ['TP9', 'AF7', 'AF8', 'TP10'];
const LEFT_CHANNELS = [0, 1];
const RIGHT_CHANNELS = [2, 3];
// Samples marked before and after a detected blink. Spectrum segments that touch a mark are skipped,
// because a blink adds slow-wave power to AF7/AF8 (measured on Athena recordings: delta ~2-2.7x).
const BLINK_PAD = Math.round(SAMPLE_RATE * 0.4);

export function ProcessingProvider({ children }) {
  const { subscribeEEG, isConnected, profile } = useEEG();
  const smoothing = profile.bandSmoothing;
  const smoothedRef = useRef(null); // EMA of band powers (athena: calms jumpy ratios)
  const buffersRef = useRef([[], [], [], []]);
  const blinkMaskRef = useRef([]); // per buffered sample: 1 = near a blink (same length as each buffer)
  const blinkPadAheadRef = useRef(0); // samples still to mark after the last blink
  const blinkCfg = profile.blink;
  const maxBufferSamples = SAMPLE_RATE * 8; // keep last 8 seconds
  const bandsRef = useRef(BANDS); // personal bands (PAF calibration) or the standard ones
  const [bands, setBandsState] = useState(BANDS);
  const setBands = useCallback((b) => { bandsRef.current = b || BANDS; smoothedRef.current = null; setBandsState(b || BANDS); }, []);

  const [psd, setPsd] = useState([null, null, null, null]);
  const [freqRes, setFreqRes] = useState(null);
  const [bandPowers, setBandPowers] = useState([null, null, null, null]);

  // Reset buffers on disconnect
  useEffect(() => {
    if (!isConnected) {
      buffersRef.current = [[], [], [], []];
      blinkMaskRef.current = [];
      blinkPadAheadRef.current = 0;
      smoothedRef.current = null;
      setBands(null);
      setPsd([null, null, null, null]);
      setBandPowers([null, null, null, null]);
      setFreqRes(null);
    }
  }, [isConnected, setBands]);

  // Push every incoming sample into buffers
  useEffect(() => {
    if (!isConnected) return;
    const blinks = new BlinkDetector(blinkCfg); // own instance: BlinkContext sits below this provider
    return subscribeEEG((sample) => {
      const bufs = buffersRef.current;
      for (let ch = 0; ch < 4; ch++) {
        bufs[ch].push(sample[ch] || 0);
        // Trim in 1 s chunks, not one element per sample (2048-element shift x 4 ch x 256 Hz)
        if (bufs[ch].length > maxBufferSamples + SAMPLE_RATE) bufs[ch].splice(0, bufs[ch].length - maxBufferSamples);
      }
      const mask = blinkMaskRef.current;
      mask.push(blinkPadAheadRef.current > 0 ? 1 : 0);
      if (blinkPadAheadRef.current > 0) blinkPadAheadRef.current--;
      if (blinks.push(sample)) {
        for (let i = Math.max(0, mask.length - BLINK_PAD); i < mask.length; i++) mask[i] = 1;
        blinkPadAheadRef.current = BLINK_PAD;
      }
      if (mask.length > maxBufferSamples + SAMPLE_RATE) mask.splice(0, mask.length - maxBufferSamples);
    });
  }, [subscribeEEG, isConnected, maxBufferSamples, blinkCfg]);

  // Periodically compute PSD and band powers from recent buffer content
  useEffect(() => {
    if (!isConnected) return;
    let handle = null;
    const tick = () => {
      const bufs = buffersRef.current;
      const nextPSD = [];
      const nextBands = [];
      let localFreqRes = null;
      const mask = blinkMaskRef.current;
      const nearBlink = (a, b) => {
        for (let i = a; i < b; i++) if (mask[i]) return true;
        return false;
      };
      for (let ch = 0; ch < 4; ch++) {
        const arr = bufs[ch];
        const { psd, freqRes } = computeWelchPSD(arr, SAMPLE_RATE, 2, 1, nearBlink);
        nextPSD[ch] = psd;
        localFreqRes = freqRes;
        nextBands[ch] = bandPowersFromPSD(psd, freqRes, bandsRef.current);
      }
      // EMA per channel and band; skipped until the 2 s window is full (all-zero PSD)
      const filled = bufs[0].length >= SAMPLE_RATE * 2;
      if (smoothing < 1 && filled) {
        const prev = smoothedRef.current;
        smoothedRef.current = nextBands.map((bp, ch) => {
          if (!prev) return bp;
          const out = {};
          for (const k of Object.keys(bp)) out[k] = prev[ch][k] + smoothing * (bp[k] - prev[ch][k]);
          return out;
        });
        nextBands.splice(0, 4, ...smoothedRef.current);
      }
      setPsd(nextPSD);
      setBandPowers(nextBands);
      setFreqRes(localFreqRes);
      handle = setTimeout(tick, 250); // ~4Hz update
    };
    handle = setTimeout(tick, 250);
    return () => {
      if (handle) clearTimeout(handle);
    };
  }, [isConnected, smoothing]);

  const value = useMemo(() => ({
    channelLabels: CHANNEL_LABELS,
    leftChannels: LEFT_CHANNELS,
    rightChannels: RIGHT_CHANNELS,
    sampleRate: SAMPLE_RATE,
    psd,
    freqRes,
    bandPowers, // [{alpha, beta, ...} per channel]
    bands, // band edges in use (personal after PAF calibration)
    setBands,
  }), [psd, freqRes, bandPowers, bands, setBands]);

  return (
    <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
