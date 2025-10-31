import { useState } from 'react';
import { useEEG } from '../contexts/MuseContext';
import '../styles/retro.css';
import { RetroModal } from './RetroModal';

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

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await connectMuse();
      if (onConnected) {
        onConnected();
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to Muse device');
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
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base px-8 py-4 mb-4"
          style={{ fontFamily: "'Press Start 2P', cursive" }}
        >
          {isConnecting ? 'CONNECTING…' : 'CONNECT'}
        </button>

        <button
          onClick={handleMockConnect}
          disabled={isConnecting}
          className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base px-8 py-4 mb-4"
          style={{ fontFamily: "'Press Start 2P', cursive" }}
        >
          {isConnecting ? 'CONNECTING…' : 'FAKE CONNECT'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 border-4 border-white bg-red-600 bg-opacity-80 text-white text-xs">
          <p style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}>
            ERROR
          </p>
          <p className="mt-2 text-[10px] opacity-80">{error}</p>
          <p className="mt-2 text-[10px] opacity-60">
            For device connect: enable Bluetooth. For FAKE CONNECT: no device needed.
          </p>
        </div>
      )}

      {showMockInfo && (
        <RetroModal
          title="FAKE CONNECT"
          confirmLabel="USE MOCK DATA"
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
