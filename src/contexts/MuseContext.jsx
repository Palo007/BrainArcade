import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { connectMuse } from 'web-muse/src/lib/MuseDevice.js';
import { connectMuseAthena } from '../lib/athenaAdapter.js';
import { connectMusePhoneRelay } from '../lib/phoneRelay.js';
import { FnirsProcessor, startMockOptics } from '../lib/fnirs.js';
import { getDeviceProfile } from '../lib/deviceProfile.js';

const MuseContext = createContext();

export const useEEG = () => useContext(MuseContext);

export function MuseProvider({ children }) {
  const [muse, setMuse] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rawEEG, setRawEEG] = useState([0, 0, 0, 0]);
  const [isMock, setIsMock] = useState(false);
  // Per-sample listeners (quality, blink, band power). Every sample reaches them in order.
  const listenersRef = useRef(new Set());
  const subscribeEEG = useCallback((cb) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  const connectMuseDevice = async (options = {}) => {
    try {
      const museDevice = options.relay
        ? await connectMusePhoneRelay()
        : options.athena
          ? await connectMuseAthena(options.preset)
          : await connectMuse(options);
      // Only mark connected if the underlying device reports connected state (2)
      if (museDevice && museDevice.state === 2) {
        // Mock mode: synthetic fNIRS so the dashboards show something without a headband
        if (options.mock && !museDevice.fnirs) {
          museDevice.fnirs = new FnirsProcessor();
          const stopOptics = startMockOptics(museDevice.fnirs);
          const disconnect = museDevice.disconnect.bind(museDevice);
          museDevice.disconnect = () => { stopOptics(); disconnect(); };
        }
        setMuse(museDevice);
        setIsConnected(true);
        setIsMock(!!options.mock);
        console.log('Muse connected successfully');
      } else {
        // Treat non-connected return (e.g., user cancel) as a cancellation
        throw new Error('User cancelled or connection not established');
      }
    } catch (error) {
      console.error('Error connecting to Muse:', error);
      // Ensure we remain in a clean disconnected state on failure/cancel
      setMuse(null);
      setIsConnected(false);
      setIsMock(!!options.mock && false);
      throw error;
    }
  };

  // Set up EEG data pipeline
  useEffect(() => {
    if (muse && isConnected) {
      const CHANNELS = 4;
      const PUMP_MS = 20;

      // Drain ALL waiting samples every 20 ms. The old loop read 1 sample per ~4 ms tick; browsers
      // (phones above all) tick slower than 256 Hz, so the device buffer filled up and web-muse's
      // CircularBuffer then DROPS new samples - chopped signal, lost blinks, fake jumps.
      // Empty buffers are no longer read as 0 either (that inserted fake zero samples).
      const subscription = setInterval(() => {
        // Device dropped (BLE link lost or phone relay went silent) → back to connect screen
        if (muse.state === 0) {
          setMuse(null);
          setIsConnected(false);
          setIsMock(false);
          setRawEEG([0, 0, 0, 0]);
          return;
        }
        const bufs = muse.eeg.slice(0, CHANNELS);
        const n = Math.min(...bufs.map((b) => b.length));
        if (n <= 0) return;
        let last = null;
        for (let i = 0; i < n; i++) {
          last = bufs.map((b) => b.read() ?? 0);
          listenersRef.current.forEach((cb) => {
            try {
              cb(last);
            } catch (err) {
              console.error('EEG listener error:', err);
            }
          });
        }
        setRawEEG(last); // latest sample, for display only (~50 Hz)
      }, PUMP_MS);

      return () => clearInterval(subscription);
    }
  }, [muse, isConnected]);

  const disconnectEEG = () => {
    if (muse) {
      muse.disconnect();
    }
    setMuse(null);
    setIsConnected(false);
    setRawEEG([0, 0, 0, 0]);
    setIsMock(false);
  };

  const value = {
    muse,
    isConnected,
    isMock,
    profile: getDeviceProfile(muse?.profile),
    rawEEG,
    subscribeEEG,
    connectMuse: connectMuseDevice,
    disconnectEEG,
  };

  return <MuseContext.Provider value={value}>{children}</MuseContext.Provider>;
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
