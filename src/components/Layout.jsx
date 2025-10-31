import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useEEG } from '../contexts/MuseContext';
import { NavBar } from './NavBar';
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
  const isGamePage = location.pathname.startsWith('/game/');
  const [showMenu, setShowMenu] = useState(false);

  // Close overlay menu on route change
  useEffect(() => {
    setShowMenu(false);
  }, [location.pathname]);

  // Close on ESC key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && showMenu) setShowMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMenu]);

  // Full-screen layout for start screen
  if (isStartScreen) {
    return (
      <div className="arcade-frame">
        <div className="arcade-window">
          {children}
        </div>
      </div>
    );
  }

  // Standard layout for games
  return (
    <div className="arcade-frame">
      <div className="arcade-window bg-[#181818]">
        {/* Top-right controls: Pause and Muse status */}
        {(isGamePage || isConnected) && (
          <div className="absolute top-10 right-10 z-50 flex items-center gap-4">
            {/* Pause button (only on game pages) */}
            {isGamePage && (
              <button
                onClick={() => setShowMenu((v) => !v)}
                aria-label="Pause / Menu"
                className="bg-[var(--nes-dark)] border-4 border-[var(--nes-yellow)] text-[var(--nes-yellow)] px-3 py-2 hover:bg-[var(--nes-yellow)] hover:text-black transition-colors"
                style={{ fontFamily: "'Press Start 2P', cursive" }}
              >
                ❚❚
              </button>
            )}

            {/* Muse Connected Icon */}
            {isConnected && (
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
            )}
          </div>
        )}

        {/* Main Container - Use full available width inside the rounded screen */}
        <div className="w-full h-full px-4 py-8">
          <div className="w-full h-full  ">
            <div className="text-left p-6 space-y-6 h-full">
              {children}
            </div>
          </div>
        </div>

        {/* Overlay game menu (shows game selection) */}
        {showMenu && (
          <div
            className="absolute inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowMenu(false)}
          >
            <div
              className="w-full max-w-4xl mx-auto bg-[var(--nes-dark)] border-4 border-white p-6 max-h-[80%] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <NavBar onActiveGameClick={() => setShowMenu(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
