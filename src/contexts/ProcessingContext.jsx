import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { SAMPLE_RATE, computeWelchPSD, bandPowersFromPSD, BANDS } from '../lib/signal.js';

const ProcessingContext = createContext(null);

export const useProcessing = () => useContext(ProcessingContext);

const CHANNEL_LABELS = ['TP9', 'AF7', 'AF8', 'TP10'];
const LEFT_CHANNELS = [0, 1];
const RIGHT_CHANNELS = [2, 3];

export function ProcessingProvider({ children }) {
  const { rawEEG, isConnected } = useEEG();
  const buffersRef = useRef([[], [], [], []]);
  const maxBufferSamples = SAMPLE_RATE * 8; // keep last 8 seconds

  const [psd, setPsd] = useState([null, null, null, null]);
  const [freqRes, setFreqRes] = useState(null);
  const [bandPowers, setBandPowers] = useState([null, null, null, null]);

  // Reset buffers on disconnect
  useEffect(() => {
    if (!isConnected) {
      buffersRef.current = [[], [], [], []];
      setPsd([null, null, null, null]);
      setBandPowers([null, null, null, null]);
      setFreqRes(null);
    }
  }, [isConnected]);

  // Push incoming samples into buffers
  useEffect(() => {
    if (!isConnected || !rawEEG) return;
    const bufs = buffersRef.current;
    for (let ch = 0; ch < 4; ch++) {
      bufs[ch].push(rawEEG[ch] || 0);
      if (bufs[ch].length > maxBufferSamples) bufs[ch].splice(0, bufs[ch].length - maxBufferSamples);
    }
  }, [rawEEG, isConnected]);

  // Periodically compute PSD and band powers from recent buffer content
  useEffect(() => {
    if (!isConnected) return;
    let handle = null;
    const tick = () => {
      const bufs = buffersRef.current;
      const nextPSD = [];
      const nextBands = [];
      let localFreqRes = null;
      for (let ch = 0; ch < 4; ch++) {
        const arr = bufs[ch];
        const { psd, freqRes } = computeWelchPSD(arr, SAMPLE_RATE, 2, 1);
        nextPSD[ch] = psd;
        localFreqRes = freqRes;
        nextBands[ch] = bandPowersFromPSD(psd, freqRes, BANDS);
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
  }, [isConnected]);

  const value = useMemo(() => ({
    channelLabels: CHANNEL_LABELS,
    leftChannels: LEFT_CHANNELS,
    rightChannels: RIGHT_CHANNELS,
    sampleRate: SAMPLE_RATE,
    psd,
    freqRes,
    bandPowers, // [{alpha, beta, ...} per channel]
  }), [psd, freqRes, bandPowers]);

  return (
    <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
