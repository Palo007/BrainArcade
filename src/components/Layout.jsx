import { useLocation } from 'react-router-dom';
import { useEEG } from '../contexts/MuseContext';
import '../styles/retro.css';

/**
 * Layout - Main layout wrapper with responsive handling
 * Shows Muse connection icon in top right when connected
 * Special full-screen mode for start screen
 */
export function Layout({ children }) {
  const { isConnected } = useEEG();
  const location = useLocation();
  const isStartScreen = location.pathname === '/';

  // Full-screen layout for start screen
  if (isStartScreen) {
    return <div className="w-full h-screen overflow-hidden">{children}</div>;
  }

  // Standard layout for games
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#181818]">
      {/* Muse Connected Icon - Top Right */}
      {isConnected && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 bg-[var(--nes-dark)] border-4 border-[var(--nes-green)] px-3 py-2">
            <div className="relative">
              {/* Brain Icon */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                className="animate-pulse"
              >
                <path
                  d="M12 2C10.34 2 9 3.34 9 5c0 .35.07.68.18 1-.26.09-.51.2-.75.35A3.97 3.97 0 004 10c0 .77.22 1.49.59 2.1-.37.61-.59 1.33-.59 2.1 0 1.7 1.06 3.14 2.56 3.71.49.93 1.32 1.63 2.31 1.94.24 1.7 1.68 3.04 3.42 3.14 1.41.08 2.67-.52 3.52-1.49.85.97 2.11 1.57 3.52 1.49 1.74-.1 3.18-1.44 3.42-3.14.99-.31 1.82-1.01 2.31-1.94C20.94 17.24 22 15.8 22 14.1c0-.77-.22-1.49-.59-2.1.37-.61.59-1.33.59-2.1 0-1.83-1.24-3.37-2.93-3.84-.24-.15-.49-.26-.75-.35.11-.32.18-.65.18-1 0-1.66-1.34-3-3-3-1.31 0-2.42.84-2.83 2.01C12.89 2.87 12.46 2 12 2z"
                  fill="var(--nes-green)"
                  stroke="var(--nes-green)"
                  strokeWidth="1"
                />
                {/* EEG Wave Lines */}
                <path
                  d="M8 12h2l1-2 1 4 1-2h2"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              {/* Connection Indicator Dot */}
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--nes-green)] rounded-full animate-pulse border border-white"></div>
            </div>
            <span className="text-[8px] text-[var(--nes-green)]">MUSE</span>
          </div>
        </div>
      )}

      {/* Main Container - Centered with max width */}
      <div className="w-full min-h-screen flex items-start justify-center p-4 py-8">
        <div className="w-full max-w-6xl">
          <div className="arcade-cabinet crt-container overflow-auto max-h-[calc(100vh-4rem)]">
            <div className="text-left p-4 sm:p-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
