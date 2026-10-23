import { useState } from 'react';
import { useEEG } from '../contexts/MuseContext';
import '../styles/retro.css';
import { RetroModal } from './RetroModal';
import { relayAvailable } from '../lib/phoneRelay.js';
import { useT } from '../lib/i18n.js';

// Error texts are kept as i18n keys (translated when shown) so they follow a language switch
const NO_BLUETOOTH_MSG = 'core.muse.noBluetooth';
const BLUETOOTH_BLOCKED_MSG = 'core.muse.blocked';

/**
 * MuseConnector - Button to connect to Muse device
 * Shows connection status and handles connection flow
 */
export function MuseConnector({ onConnected }) {
  const { isConnected, connectMuse } = useEEG();
  const t = useT();
  const showErr = (m) => (typeof m === 'string' && m.startsWith('core.') ? t(m) : m);
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
        setError(looksBlocked || unavailable ? BLUETOOTH_BLOCKED_MSG : err.message || 'core.muse.failed');
      } else if (!isUserCancel) {
        setError(err.message || 'core.muse.failed');
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
      setMockError(err.message || 'core.muse.mockFailed');
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
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[12px] phone-port:leading-relaxed phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[52px] phone-port:bg-black/85 phone-port:[-webkit-text-stroke:0.3px_#fff] phone-port:[text-shadow:2px_2px_0_#000]"
          style={{ fontFamily: 'var(--font-retro)' }}
        >
          {isConnecting ? t('core.muse.connecting') : t('core.muse.athena')}
        </button>

        <button
          onClick={() => handleConnect()}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[12px] phone-port:leading-relaxed phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[52px] phone-port:bg-black/85 phone-port:[-webkit-text-stroke:0.3px_#fff] phone-port:[text-shadow:2px_2px_0_#000]"
          style={{ fontFamily: 'var(--font-retro)' }}
        >
          {isConnecting ? t('core.muse.connecting') : t('core.muse.classic')}
        </button>

        {relayAvailable && (
          <button
            onClick={() => handleConnect({ relay: true })}
            disabled={isConnecting}
            className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[12px] phone-port:leading-relaxed phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[52px] phone-port:bg-black/85 phone-port:[-webkit-text-stroke:0.3px_#fff] phone-port:[text-shadow:2px_2px_0_#000]"
            style={{ fontFamily: 'var(--font-retro)' }}
          >
            {isConnecting ? t('core.muse.waitPhone') : t('core.muse.viaPhone')}
          </button>
        )}

        <button
          onClick={handleMockConnect}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base short-land:text-[10px] px-8 py-4 short-land:px-4 short-land:py-2 mb-4 short-land:mb-2 phone-port:text-[12px] phone-port:leading-relaxed phone-port:px-3 phone-port:py-3 phone-port:mb-0 phone-port:w-full phone-port:min-h-[52px] phone-port:bg-black/85 phone-port:[-webkit-text-stroke:0.3px_#fff] phone-port:[text-shadow:2px_2px_0_#000]"
          style={{ fontFamily: 'var(--font-retro)' }}
        >
          {isConnecting ? t('core.muse.connectingDots') : t('core.muse.explore')}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 phone-port:p-3 border-4 border-white bg-red-600 bg-opacity-80 text-white text-xs">
          <p style={{ fontFamily: 'var(--font-retro)', lineHeight: '1.8' }}>
            {t('core.muse.error')}
          </p>
          <p className="mt-2 text-[10px] opacity-90 leading-relaxed break-words">{showErr(error)}</p>
          <p className="mt-2 text-[10px] opacity-60">
            {t('core.muse.noDevice')}
          </p>
        </div>
      )}

      {showMockInfo && (
        <RetroModal
          title={t('core.muse.explore')}
          confirmLabel={t('core.muse.useSim')}
          cancelLabel={t('core.muse.cancel')}
          isBusy={isConnecting}
          onCancel={() => setShowMockInfo(false)}
          onConfirm={confirmMockConnect}
        >
          <p className="mb-3" style={{ fontFamily: 'var(--font-retro)' }}>
            {t('core.muse.sim1')}
          </p>
          <p className="opacity-80 mb-3" style={{ fontFamily: 'var(--font-retro)' }}>
            {t('core.muse.sim2')}
          </p>
          <p className="opacity-60" style={{ fontFamily: 'var(--font-retro)' }}>
            {t('core.muse.sim3')}
          </p>

          {mockError && (
            <div className="mt-4 p-3 border-4 border-white bg-red-600 bg-opacity-80 text-white text-[10px]">
              <div style={{ fontFamily: 'var(--font-retro)' }}>{t('core.muse.error')}</div>
              <div className="opacity-80 mt-1">{showErr(mockError)}</div>
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
