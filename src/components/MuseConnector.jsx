import { useState } from 'react';
import { useEEG } from '../contexts/MuseContext';
import '../styles/retro.css';

/**
 * MuseConnector - Button to connect to Muse device
 * Shows connection status and handles connection flow
 */
export function MuseConnector({ onConnected }) {
  const { isConnected, connectMuse } = useEEG();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

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

  if (isConnected) {
    return null; // Don't show anything when connected - handled by StartScreen
  }

  return (
    <div className="text-left">
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-white bg-transparent text-base px-8 py-4 mb-4"
        style={{ fontFamily: "'Press Start 2P', cursive" }}
      >
        {isConnecting ? 'CONNECTING...' : 'CONNECT'}
      </button>

      {error && (
        <div className="mt-4 p-4 border-4 border-white bg-red-600 bg-opacity-80 text-white text-xs">
          <p style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}>
            ERROR
          </p>
          <p className="mt-2 text-[10px] opacity-80">{error}</p>
          <p className="mt-2 text-[10px] opacity-60">
            Make sure Bluetooth is enabled and try again.
          </p>
        </div>
      )}
    </div>
  );
}
