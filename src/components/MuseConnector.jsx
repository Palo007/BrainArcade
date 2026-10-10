import { useState } from 'react';
import { useEEG } from '../contexts/MuseContext';
import '../styles/retro.css';
import { RetroModal } from './RetroModal';
import { relayAvailable } from '../lib/phoneRelay.js';

const NO_BLUETOOTH_MSG = 'This browser has no Bluetooth (use Chrome on Android).';
const BLUETOOTH_BLOCKED_MSG = "Bluetooth is blocked for Brain Arcade. Fix: long-press the Brain Arcade app icon → Site settings → Bluetooth → Allow. Also check Chrome → Settings → Site settings → Bluetooth = 'Sites can ask'. And turn on phone Bluetooth.";

/**
 * MuseConnector - Button to connect to Muse device
 * Shows connection status and handles connection flow
 */
export function MuseConnector({ onConnected }) {
  const { isConnected, connectMuse } = useEEG();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showMockInfo, setShowMockInfo] = useState(false);
  const [mockError, setMockError] = useState(null);

  const handleConnect = async (options = {}) => {
    setError(null);
    // Synchronous check, so requestDevice stays the first await after the click
    if (!options.relay && typeof navigator !== 'undefined' && !navigator.bluetooth) {
      setError(NO_BLUETOOTH_MSG);
      return;
    }
    setIsConnecting(true);

    try {
      await connectMuse(options);
      if (onConnected) {
        onConnected();
      }
    } catch (err) {
      const name = err?.name || '';
      const msg = (err?.message || '').toLowerCase();
      const isUserCancel = msg.includes('cancel') || (name === 'NotFoundError' && !msg.includes('adapter') && !msg.includes('blocked') && !msg.includes('denied') && !msg.includes('permission'));
      const looksBlocked = name === 'SecurityError' || name === 'NotAllowedError' || /blocked|denied|permission|adapter/.test(msg);
      if (!options.relay && !isUserCancel) {
        // Availability is checked only AFTER the failure, so the user gesture is never consumed
        let unavailable = false;
        try {
          unavailable = (await navigator.bluetooth?.getAvailability?.()) === false;
        } catch {
          // ignore
        }
        setError(looksBlocked || unavailable ? BLUETOOTH_BLOCKED_MSG : err.message || 'Failed to connect to Muse device');
      } else if (!isUserCancel) {
        setError(err.message || 'Failed to connect to Muse device');
      }
      console.error('Muse connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleMockConnect = () => {
    setMockError(null);
    setShowMockInfo(true);
  };

  const confirmMockConnect = async () => {
    setIsConnecting(true);
    setMockError(null);
    try {
      await connectMuse({ mock: true });
      if (onConnected) onConnected();
      setShowMockInfo(false);
    } catch (err) {
      setMockError(err.message || 'Failed to start mock EEG');
      console.error('Muse mock connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  if (isConnected) {
    return null; // Don't show anything when connected - handled by StartScreen
  }

  return (
    <div className="text-left">
      <div className="flex items-center gap-4 short-land:gap-x-3 short-land:gap-y-0 flex-wrap phone-port:flex-col phone-port:items-stretch phone-port:gap-2">
        <button
          onClick={() => handleConnect({ athena: true, preset: 'p1034' })}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[10px] phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[44px]"
          style={{ fontFamily: "'Press Start 2P', cursive" }}
        >
          {isConnecting ? 'CONNECTING…' : 'CONNECT MUSE (ATHENA)'}
        </button>

        <button
          onClick={() => handleConnect()}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[10px] phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[44px]"
          style={{ fontFamily: "'Press Start 2P', cursive" }}
        >
          {isConnecting ? 'CONNECTING…' : 'CONNECT MUSE (CLASSIC)'}
        </button>

        {relayAvailable && (
          <button
            onClick={() => handleConnect({ relay: true })}
            disabled={isConnecting}
            className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[10px] phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[44px]"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            {isConnecting ? 'WAITING FOR PHONE…' : 'CONNECT VIA PHONE'}
          </button>
        )}

        <button
          onClick={handleMockConnect}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[10px] phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[44px]"
          style={{ fontFamily: "'Press Start 2P', cursive" }}
        >
          {isConnecting ? 'CONNECTING...' : 'EXPLORE WITHOUT A DEVICE'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 phone-port:p-3 border-4 border-white bg-red-600 bg-opacity-80 text-white text-xs">
          <p style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}>
            ERROR
          </p>
          <p className="mt-2 text-[10px] opacity-90 leading-relaxed break-words">{error}</p>
          <p className="mt-2 text-[10px] opacity-60">
            No device? Use EXPLORE WITHOUT A DEVICE.
          </p>
        </div>
      )}

      {showMockInfo && (
        <RetroModal
          title="EXPLORE WITHOUT A DEVICE"
          confirmLabel="USE SIMULATED REAL-TIME DATA"
          cancelLabel="CANCEL"
          isBusy={isConnecting}
          onCancel={() => setShowMockInfo(false)}
          onConfirm={confirmMockConnect}
        >
          <p className="mb-3" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            Uses pre-recorded brain data to simulate real-time EEG.
          </p>
          <p className="opacity-80 mb-3" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            Perfect for exploring the arcade without a Muse device.
          </p>
          <p className="opacity-60" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            You can switch to a real device later from the menu.
          </p>

          {mockError && (
            <div className="mt-4 p-3 border-4 border-white bg-red-600 bg-opacity-80 text-white text-[10px]">
              <div style={{ fontFamily: "'Press Start 2P', cursive" }}>ERROR</div>
              <div className="opacity-80 mt-1">{mockError}</div>
            </div>
          )}
        </RetroModal>
      )}
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
