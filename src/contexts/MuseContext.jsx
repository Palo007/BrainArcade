import React, { createContext, useContext, useState, useEffect } from 'react';
import { connectMuse } from 'web-muse/src/lib/MuseDevice.js';

const MuseContext = createContext();

export const useEEG = () => useContext(MuseContext);

export function MuseProvider({ children }) {
  const [muse, setMuse] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [rawEEG, setRawEEG] = useState([0, 0, 0, 0]);

  const connectMuseDevice = async () => {
    try {
      const museDevice = await connectMuse();
      setMuse(museDevice);
      setIsConnected(true);
      console.log('Muse connected successfully');
    } catch (error) {
      console.error('Error connecting to Muse:', error);
      throw error;
    }
  };

  // Set up EEG data pipeline
  useEffect(() => {
    if (muse && isConnected) {
      const SAMPLE_RATE = 256;
      const CHANNELS = 4;

      const subscription = setInterval(() => {
        const eegData = muse.eeg
          .slice(0, CHANNELS)
          .map((buffer) => buffer.read() || 0);
        setRawEEG(eegData);
      }, 1000 / SAMPLE_RATE);

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
  };

  const value = {
    muse,
    isConnected,
    rawEEG,
    connectMuse: connectMuseDevice,
    disconnectEEG,
  };

  return <MuseContext.Provider value={value}>{children}</MuseContext.Provider>;
}
