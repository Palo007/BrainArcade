import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { SAMPLE_RATE } from '../lib/signal.js';

const QualityContext = createContext(null);

export const useQuality = () => useContext(QualityContext);

// Channel mapping by index in rawEEG: 0=TP9 (left ear), 1=AF7 (left forehead), 2=AF8 (right forehead), 3=TP10 (right ear)
export const CHANNEL_INFO = [
  { id: 'TP9', side: 'left', area: 'ear', label: 'Left ear' },
  { id: 'AF7', side: 'left', area: 'forehead', label: 'Left forehead' },
  { id: 'AF8', side: 'right', area: 'forehead', label: 'Right forehead' },
  { id: 'TP10', side: 'right', area: 'ear', label: 'Right ear' },
];

// Amplitude thresholds and the flat-line limit come from the device profile (lib/deviceProfile.js)
const BAD_WINDOW_MS = 3000; // readiness window; per-second eval is separate
const ADJUSTING_HOLD_MS = 2000; // show "evaluating setup..."
// Time-based quality: require >=99% of samples below threshold in last 1s
const SECOND_MS = 1000;
const MAX_BAD_RATIO_1S = 0.01; // readiness: share of bad 200 ms ticks allowed in the last 5 s
const RMS_WINDOW = SAMPLE_RATE; // samples (1 s) for the per-channel RMS / flat-line check

export function QualityProvider({ children }) {
  const { subscribeEEG, isConnected, profile } = useEEG();
  const { spikeUv, hugeUv, maxBadRatio, flatRmsUv } = profile.quality;
  const [now, setNow] = useState(Date.now());

  // Per-channel timestamps of above-threshold samples (ms) and global sample times
  const aboveTimesRef = useRef([[], [], [], []]);
  const sampleTimesRef = useRef([]);
  const lastValRef = useRef([0, 0, 0, 0]);
  const recentRef = useRef([[], [], [], []]); // last RMS_WINDOW samples per channel
  const [currentAbs, setCurrentAbs] = useState([0, 0, 0, 0]);
  const [adjustingUntil, setAdjustingUntil] = useState(0);
  const zerosSinceRef = useRef(null);
  const lastSampleAtRef = useRef(null); // no samples at all for 6 s also counts as lost
  const [lostZero6s, setLostZero6s] = useState(false);

  // Heartbeat to advance time and prune
  useEffect(() => {
    if (!isConnected) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [isConnected]);

  // Reset on disconnect
  useEffect(() => {
    if (!isConnected) {
      aboveTimesRef.current = [[], [], [], []];
      sampleTimesRef.current = [];
      recentRef.current = [[], [], [], []];
      setCurrentAbs([0, 0, 0, 0]);
      setAdjustingUntil(0);
      zerosSinceRef.current = null;
      setLostZero6s(false);
    }
  }, [isConnected]);

  // Track spikes and adjustments - every sample (MuseContext delivers them in 20 ms batches)
  useEffect(() => {
    if (!isConnected) return;
    lastSampleAtRef.current = Date.now();
    return subscribeEEG((sample) => {
    const absVals = sample.map((v) => Math.abs(v || 0));
    setCurrentAbs(absVals);
    const t = Date.now();
    lastSampleAtRef.current = t;
    // Track sustained zeros across all channels
    const allZero = absVals.every((v) => v === 0);
    if (allZero) {
      if (zerosSinceRef.current == null) zerosSinceRef.current = t;
    } else {
      zerosSinceRef.current = null;
      setLostZero6s((v) => (v ? false : v));
    }
    // Record sample time per raw tick
    sampleTimesRef.current.push(t);
    for (let ch = 0; ch < 4; ch++) {
      const v = absVals[ch];
      const prev = lastValRef.current[ch] || 0;
      if (v > spikeUv) {
        aboveTimesRef.current[ch].push(t);
      }
      const recent = recentRef.current[ch];
      recent.push(sample[ch] || 0);
      if (recent.length > RMS_WINDOW) recent.shift();
      // Adjustment detection: huge value or large jump
      if (v > hugeUv || Math.abs((sample[ch] || 0) - prev) > hugeUv / 1.5) {
        setAdjustingUntil(t + ADJUSTING_HOLD_MS);
      }
      lastValRef.current[ch] = sample[ch] || 0;
    }
    // Prune old timestamps (keep ~12s)
    const keepSince = t - SECOND_MS * 12;
    while (sampleTimesRef.current.length && sampleTimesRef.current[0] < keepSince) sampleTimesRef.current.shift();
    for (let ch = 0; ch < 4; ch++) {
      const arr = aboveTimesRef.current[ch];
      while (arr.length && arr[0] < keepSince) arr.shift();
    }
    });
  }, [subscribeEEG, isConnected, spikeUv, hugeUv]);

  // Detect sustained zeros condition over 6s
  useEffect(() => {
    if (!isConnected) return;
    const zeros = zerosSinceRef.current != null && now - zerosSinceRef.current >= 6000;
    const silent = lastSampleAtRef.current != null && now - lastSampleAtRef.current >= 6000;
    if (zeros || silent) {
      if (!lostZero6s) setLostZero6s(true);
    }
  }, [now, isConnected, lostZero6s]);

  // Per-channel RMS over the last 1 s (mean removed). Shown in the electrode check, used for flat-line detection.
  const channelRms = useMemo(() => recentRef.current.map((arr) => {
    if (arr.length === 0) return 0;
    let sum = 0, sq = 0;
    for (const x of arr) { sum += x; sq += x * x; }
    const mean = sum / arr.length;
    return Math.sqrt(Math.max(0, sq / arr.length - mean * mean));
  }), [now]);

  // Compute quality per channel using time-based rule: in last 1s, too many samples above the spike threshold = bad.
  // Athena: a flat channel is also bad (railed/open input looks flat after the adapter's high-pass).
  // Per channel: 'good' | 'weak' (some spikes or a nearly flat signal, not yet bad) | 'bad' | 'none' (no samples in the last second)
  const perChannelLevel = useMemo(() => {
    const t = now;
    const total1s = sampleTimesRef.current.filter((x) => x >= t - SECOND_MS).length;
    return [0, 1, 2, 3].map((ch) => {
      if (total1s === 0) return 'none';
      const above1s = aboveTimesRef.current[ch].filter((x) => x >= t - SECOND_MS).length;
      const ratioAbove = above1s / total1s;
      const haveRms = recentRef.current[ch].length >= RMS_WINDOW / 2;
      const flat = flatRmsUv > 0 && haveRms && channelRms[ch] < flatRmsUv;
      if (ratioAbove > maxBadRatio || flat) return 'bad';
      const nearlyFlat = flatRmsUv > 0 && haveRms && channelRms[ch] < flatRmsUv * 2;
      return ratioAbove > maxBadRatio / 3 || nearlyFlat ? 'weak' : 'good';
    });
  }, [now, channelRms, maxBadRatio, flatRmsUv]);
  // No data while connected counts as bad (pauses games); while disconnected the disconnect UI takes over
  const perChannelBad = useMemo(() => perChannelLevel.map((l) => l === 'bad' || (l === 'none' && isConnected)), [perChannelLevel, isConnected]);

  // Convenience flags
  const frontalBad = perChannelBad[1] || perChannelBad[2];
  const anyBad = perChannelBad.some(Boolean);
  const adjusting = now < adjustingUntil;

  // Readiness gating: last 5s must be >=99% stable (tolerates brief blips)
  const goodSinceRef = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isConnected) {
      goodSinceRef.current = null;
      setReady(false);
      return;
    }
    const t = now;
    const last5 = historyRef.current.filter((x) => x.t >= t - 5000);
    const total = last5.length;
    if (total === 0) {
      setReady(false);
      return;
    }
    const bad = last5.reduce((s, x) => s + (x.bad ? 1 : 0), 0);
    const ratioBad = bad / total;
    setReady(ratioBad <= MAX_BAD_RATIO_1S);
  }, [isConnected, now]);

  // Helper to check if a recent extreme occurred within windowMs for a channel
  const hasRecentExtreme = (ch, windowMs = 1000) => {
    const t = now;
    const total = sampleTimesRef.current.filter((x) => x >= t - windowMs).length;
    if (total === 0) return false;
    const above = aboveTimesRef.current[ch].filter((x) => x >= t - windowMs).length;
    const ratioAbove = above / total;
    return ratioAbove > maxBadRatio || (now < adjustingUntil);
  };

  // 10s quality history (sampled ~5Hz via heartbeat)
  const historyRef = useRef([]);
  useEffect(() => {
    // treat adjusting as bad quality during evaluation
    const badNow = anyBad || adjusting;
    const t = now;
    const arr = historyRef.current;
    if (arr.length === 0 || arr[arr.length - 1].t !== t) {
      arr.push({ t, bad: badNow });
    } else {
      arr[arr.length - 1].bad = badNow;
    }
    const keepSince = t - 10000;
    while (arr.length && arr[0].t < keepSince) arr.shift();
  }, [now, anyBad, adjusting]);

  const quality10s = useMemo(() => {
    // Use 15s window for UI quality indicators
    const t = now;
    const arr = historyRef.current.filter((x) => x.t >= t - 15000);
    const total = arr.length || 1;
    const bad = arr.reduce((s, x) => s + (x.bad ? 1 : 0), 0);
    const badRatio = bad / total;
    const stablePct = 1 - badRatio;
    let color = 'green';
    let label = 'Good';
    if (badRatio > 0.4) {
      color = 'red';
      label = 'Poor';
    } else if (badRatio > 0.1) {
      color = 'yellow';
      label = 'Fair';
    }
    const colorVar = color === 'green' ? '--nes-green' : color === 'yellow' ? '--nes-yellow' : '--nes-red';
    return { badRatio, stablePct, color, var: colorVar, label };
  }, [now]);

  // 15s quality summary for potential re-check trigger
  const quality15s = useMemo(() => {
    const t = now;
    const arr = historyRef.current.filter((x) => x.t >= t - 15000);
    const total = arr.length || 1;
    const bad = arr.reduce((s, x) => s + (x.bad ? 1 : 0), 0);
    const badRatio = bad / total;
    return { badRatio, total };
  }, [now]);

  const value = useMemo(() => ({
    sampleRate: SAMPLE_RATE,
    threshold: spikeUv,
    currentAbs,
    channelRms,
    perChannelBad,
    perChannelLevel,
    anyBad,
    frontalBad,
    adjusting,
    ready,
    CHANNEL_INFO,
    hasRecentExtreme,
    quality10s,
    quality15s,
    recheck15sBad: (quality15s.badRatio >= 0.5),
    lostZero6s,
  }), [spikeUv, currentAbs, channelRms, perChannelBad, perChannelLevel, anyBad, frontalBad, adjusting, ready, quality10s, quality15s, lostZero6s]);

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
