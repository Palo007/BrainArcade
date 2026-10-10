import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEEG } from '../contexts/MuseContext';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { NavBar } from './NavBar';
import '../styles/retro.css';
import { RetroModal } from './RetroModal';
import { FrontalPauseOverlay } from './FrontalPauseOverlay.jsx';
import { isPageRoute, isFnirsRoute } from '../games/games.config';
import { ElectrodesButton, ElectrodesModal } from './ElectrodeOverlay.jsx';

/**
 * Layout - Main layout wrapper with responsive handling
 * Shows Muse connection icon in top right when connected
 * Special full-screen mode for start screen
 */
export function Layout({ children }) {
  const { isConnected, isMock, disconnectEEG } = useEEG();
  const { isBaselineReady, resetBaseline, ensureBaseline, show: showBaselineModal } = useBaseline();
  const { quality10s } = useQuality();
  const location = useLocation();
  const navigate = useNavigate();
  const isFullScreen = location.pathname === '/' || location.pathname === '/about';
  const isGamePage = location.pathname.startsWith('/game/');
  const isPage = isPageRoute(location.pathname); // kind: "page" -> no device guard
  const [showMenu, setShowMenu] = useState(false);
  const isFnirsGame = isFnirsRoute(location.pathname); // signal: 'fnirs' -> EEG-quality pauses are suppressed
  const [showMusePopup, setShowMusePopup] = useState(false);
  const [showElectrodes, setShowElectrodes] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isGameSwitching, setIsGameSwitching] = useState(false);
  const [gameCountdown, setGameCountdown] = useState(2);
  const [targetGameId, setTargetGameId] = useState(null);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [pendingRecalibrate, setPendingRecalibrate] = useState(false);
  const [didResetBaseline, setDidResetBaseline] = useState(false);
  const [didStartBaseline, setDidStartBaseline] = useState(false);

  // Close overlay menu on route change
  useEffect(() => {
    setShowMenu(false);
    setShowElectrodes(false);
  }, [location.pathname]);

  // Close overlays on ESC key (menu and Muse popup)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showElectrodes) {
          setShowElectrodes(false);
          return;
        }
        if (showMusePopup) {
          setShowMusePopup(false);
          return;
        }
        if (showMenu) setShowMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMenu, showMusePopup, showElectrodes]);

  // Handle switching countdown flow
  useEffect(() => {
    if (!isSwitching) return;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          navigate('/');
          setIsSwitching(false);
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSwitching, navigate]);

  // Handle game switching countdown flow (from pause menu)
  useEffect(() => {
    if (!isGameSwitching || !targetGameId) return;
    setGameCountdown(2);
    const interval = setInterval(() => {
      setGameCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          navigate(`/game/${targetGameId}`);
          setIsGameSwitching(false);
          setTargetGameId(null);
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isGameSwitching, targetGameId, navigate]);

  // Recalibration orchestrator: ensure baseline resets before starting collection
  useEffect(() => {
    if (!pendingRecalibrate) return;

    // Step 1: issue reset once
    if (!didResetBaseline) {
      resetBaseline();
      // Proactively show baseline modal; it will render once baseline clears
      try { showBaselineModal(); } catch {}
      setDidResetBaseline(true);
      return;
    }

    // Step 2: when baseline is cleared, start baseline collection
    if (didResetBaseline && !didStartBaseline && !isBaselineReady) {
      setDidStartBaseline(true);
      (async () => {
        try {
          await ensureBaseline({ seconds: 30 });
        } finally {
          setPendingRecalibrate(false);
          setDidResetBaseline(false);
          setDidStartBaseline(false);
          setIsRecalibrating(false);
          // Return to the Muse modal after completion
          setShowMusePopup(true);
        }
      })();
    }
  }, [pendingRecalibrate, didResetBaseline, didStartBaseline, isBaselineReady, ensureBaseline, resetBaseline]);

  // Unified layout (applies to all routes); content varies per route
  return (
    <div className="arcade-frame">
      <div className={`arcade-window ${isFullScreen ? '' : 'bg-[#181818]'}`}>
        {/* Top-right controls: Pause and Muse status */}
        {isConnected && !isFullScreen && (
          <div className="absolute top-2 right-2 sm:top-10 sm:right-10 short-land:top-2 short-land:right-2 z-50 flex flex-wrap justify-end items-center gap-2 sm:gap-4">
            {/* Pause button (only on game pages) */}
            {isGamePage && isConnected && (
              <button
                onClick={() => setShowMenu((v) => !v)}
                aria-label="Pause / Menu"
                className="bg-[var(--nes-dark)] border-4 short-land:border-2 border-[var(--nes-yellow)] text-[var(--nes-yellow)] px-3 py-2 short-land:py-0.5 min-h-[44px] min-w-[44px] hover:bg-[var(--nes-yellow)] hover:text-black transition-colors cursor-pointer"
                style={{ fontFamily: 'var(--font-retro)' }}
              >
                ❚❚
              </button>
            )}

            {/* Electrode check: any device page (not on kind: "page" routes), never ends the game */}
            {!isPage && <ElectrodesButton onClick={() => setShowElectrodes(true)} />}

            {/* Muse Connected Icon */}
            {isConnected && (
              <button
                className="flex items-center gap-2 bg-[var(--nes-dark)] border-4 short-land:border-2 px-3 py-2 phone-port:px-2 min-h-[44px] phone-port:min-w-[44px] short-land:py-0.5 hover:border-[var(--nes-yellow)] transition-colors cursor-pointer"
                onClick={() => setShowMusePopup(true)}
                title={`Muse status — ${quality10s?.label || 'Good'} • ${Math.round((quality10s?.stablePct || 1) * 100)}% stable${isMock ? ' • MOCK' : ''}`}
                style={{ borderColor: `var(${quality10s?.var || '--nes-green'})` }}
              >
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
                      fill={`var(${quality10s?.var || '--nes-green'})`}
                      stroke={`var(${quality10s?.var || '--nes-green'})`}
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
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse border border-white" style={{ backgroundColor: `var(${quality10s?.var || '--nes-green'})` }}></div>
                </div>
                <span className="text-[8px] phone-port:hidden" style={{ color: `var(${quality10s?.var || '--nes-green'})` }}>CONNECTED{isMock ? ' • MOCK' : ''}</span>
                <span className="hidden phone-port:inline text-xs" style={{ color: `var(${quality10s?.var || '--nes-green'})` }}>{isMock ? 'MOCK' : 'LIVE'}</span>
              </button>
            )}
          </div>
        )}

        {/* Main Container */}
        {isFullScreen ? (
          <>{children}</>
        ) : (
          <div className={`w-full h-full px-1 sm:px-4 py-2 sm:py-8 short-land:py-1 overflow-y-auto overflow-x-hidden overscroll-contain ${isConnected ? 'phone-port:pt-[64px]' : ''}`}>
            <div className={`w-full h-full ${isConnected ? 'phone-port:relative' : ''}`}>
              <div className="text-left p-2 sm:p-6 short-land:p-1 space-y-6 h-full">
                {/* Global not-connected guard for game pages */}
                {isGamePage && !isPage && !isConnected ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">⚠️</div>
                    <p className="text-[var(--nes-red)] mb-2">MUSE NOT CONNECTED</p>
                    <p className="text-xs text-gray-400 mb-6">Please return to home and connect your device</p>
                    <button
                      className="retro-button border-[var(--nes-yellow)] text-[var(--nes-yellow)] bg-transparent px-4 py-2 hover:bg-[var(--nes-yellow)] hover:text-black"
                      onClick={() => {
                        // Ensure clean state and go home to reconnect
                        try { disconnectEEG(); } catch {}
                        navigate('/');
                      }}
                    >
                      RETURN HOME TO CONNECT
                    </button>
                  </div>
                ) : (
                  children
                )}
              </div>
            </div>
          </div>
        )}

        {/* Overlay game menu (shows game selection) */}
        {showMenu && (
          <div
            className="absolute inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowMenu(false)}
          >
            <div
              className="w-[94%] sm:w-full max-w-4xl mx-auto bg-[var(--nes-dark)] border-4 border-white px-3 sm:px-6 pb-4 sm:pb-6 pt-0 max-h-[90%] sm:max-h-[80%] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <NavBar
                onActiveGameClick={(game) => {
                  const nextPath = `/game/${game.id}`;
                  const current = location.pathname;
                  setShowMenu(false);
                  if (current === nextPath) return;
                  setTargetGameId(game.id);
                  setIsGameSwitching(true);
                }}
              />
            </div>
          </div>
        )}
        {showElectrodes && isConnected && (
          <ElectrodesModal
            onClose={() => setShowElectrodes(false)}
            eegNote={isFnirsGame ? 'This game uses the fNIRS light sensors. Weak EEG contact does not pause it.' : null}
          />
        )}
        {/* Muse popup for switch/disconnect */}
      {showMusePopup && (
        <RetroModal
          title="MUSE OPTIONS"
          onCancel={() => setShowMusePopup(false)}
          cancelLabel="CANCEL"
          showFooter={true}
          leftActions={
            isBaselineReady ? (
              <button
                className="retro-button border-[var(--nes-green)] text-[var(--nes-green)] bg-transparent px-4 py-2 hover:bg-[var(--nes-green)] hover:text-black"
                onClick={() => {
                  // Close Muse modal and begin recalibration state machine
                  setShowMusePopup(false);
                  setIsRecalibrating(true);
                  setPendingRecalibrate(true);
                }}
              >
                RECALIBRATE BASELINE
              </button>
            ) : null
          }
        >
          <div className="space-y-3" style={{ fontFamily: 'var(--font-retro)' }}>
            <p className="text-[10px] opacity-80">Connected via {isMock ? 'Mock Data' : 'Real Device'}</p>
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              {!isMock && (
                <button
                  className="retro-button border-[var(--nes-yellow)] text-[var(--nes-yellow)] bg-transparent px-4 py-2 hover:bg-[var(--nes-yellow)] hover:text-black"
                  onClick={() => {
                    setShowMusePopup(false);
                    // Disconnect and redirect to home to reconnect in mock mode
                    disconnectEEG();
                    setIsSwitching(true);
                  }}
                >
                  SWITCH TO MOCK
                </button>
              )}
              {isMock && (
                <button
                  className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 hover:bg-[var(--nes-blue)] hover:text-black"
                  onClick={() => {
                    setShowMusePopup(false);
                    // Disconnect and redirect to home to reconnect to real device
                    disconnectEEG();
                    setIsSwitching(true);
                  }}
                >
                  SWITCH TO REAL
                </button>
              )}
              <button
                className="retro-button border-[var(--nes-red)] text-[var(--nes-red)] bg-transparent px-4 py-2 hover:bg-[var(--nes-red)] hover:text-black"
                onClick={() => {
                  setShowMusePopup(false);
                  disconnectEEG();
                  setIsSwitching(true);
                }}
              >
                DISCONNECT
              </button>
            </div>
            <p className="text-[9px] opacity-60 mt-1">Changes will return you to HOME to reconnect.</p>
          </div>
        </RetroModal>
      )}

      {/* Switching overlay */}
      {isSwitching && (
        <div className="absolute inset-0 z-[999] bg-black/80 flex items-center justify-center">
          <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] text-white px-6 py-5" style={{ fontFamily: 'var(--font-retro)' }}>
            <div className="text-sm text-[var(--nes-yellow)] mb-2">switching brain...</div>
            <div className="text-center text-3xl">{countdown}</div>
          </div>
        </div>
      )}
      {isGameSwitching && (
        <div className="absolute inset-0 z-[999] bg-black/80 flex items-center justify-center">
          <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] text-white px-6 py-5" style={{ fontFamily: 'var(--font-retro)' }}>
            <div className="text-sm text-[var(--nes-yellow)] mb-2">switching game...</div>
            <div className="text-center text-3xl">{gameCountdown}</div>
          </div>
        </div>
      )}
      {/* Global frontal (EEG) quality pause overlay; not for fNIRS games (signal: 'fnirs') */}
      {!isFnirsGame && <FrontalPauseOverlay />}
      </div>
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
