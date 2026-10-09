import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEEG } from '../contexts/MuseContext';
import { MuseConnector } from './MuseConnector';
import { ElectrodeSetupCheck } from './ElectrodeSetupCheck.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import '../styles/retro.css';
import background from '../assets/background.JPG';

/**
 * StartScreen - VHS/Retro video game start screen
 * Full-screen immersive experience with scanlines and glitch effects
 */
export function StartScreen() {
  const navigate = useNavigate();
  const { isConnected } = useEEG();
  const { ready, recheck15sBad } = useQuality();
  const [passedSetup, setPassedSetup] = useState(false);
  const [showingRecheck, setShowingRecheck] = useState(false);
  const [showLoadingQC, setShowLoadingQC] = useState(false);
  const [hasEnteredStartPhase, setHasEnteredStartPhase] = useState(false);
  const [time, setTime] = useState('00:00:00');
  const titleRef = useRef(null);

  // Update time display
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setTime(`${hours}:${minutes}:${seconds}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Mark setup as passed once first ready occurs
  useEffect(() => {
    if (ready && !passedSetup) setPassedSetup(true);
  }, [ready, passedSetup]);

  // After initial pass, re-show check only if 15s window is >=50% bad; keep until ready again
  useEffect(() => {
    if (!passedSetup) return;
    if (hasEnteredStartPhase) return; // once in start phase, never go back to checks
    if (!showingRecheck && recheck15sBad) setShowingRecheck(true);
    if (showingRecheck && ready) setShowingRecheck(false);
  }, [passedSetup, recheck15sBad, showingRecheck, ready, hasEnteredStartPhase]);

  // When Muse connects, show a brief loading screen before quality check
  useEffect(() => {
    let timer;
    if (isConnected) {
      setShowLoadingQC(true);
      timer = setTimeout(() => {
        setShowLoadingQC(false);
      }, 3000);
    } else {
      // If disconnected, stop loading indicator
      setShowLoadingQC(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isConnected]);

  // Once quality is valid after loading, lock into start phase permanently
  useEffect(() => {
    if (isConnected && ready && !showLoadingQC && !hasEnteredStartPhase) {
      setHasEnteredStartPhase(true);
    }
  }, [isConnected, ready, showLoadingQC, hasEnteredStartPhase]);

  // Split text into chars for animation
  useEffect(() => {
    if (titleRef.current) {
      const text = titleRef.current.textContent;
      titleRef.current.innerHTML = text
        .split('')
        .map(
          (char, i) =>
            `<span class="char" style="--char-index: ${i}">${char === ' ' ? '&nbsp;' : char}</span>`
        )
        .join('');
    }
  }, []);

  const handleStart = () => {
    if (isConnected) {
      navigate('/games');
    }
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* VHS Effects */}
      <div className="scanlines-vhs"></div>
      <div className="noise"></div>
      <div className="noise noise-moving"></div>
      <div className="vhs-vignette"></div>

      {/* Main Content */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {/* Top Left - Title */}
        <div className="absolute left-20 top-20 short-land:left-4 short-land:top-3">
          <h1
            ref={titleRef}
            className="text-4xl sm:text-5xl short-land:text-xl font-bold rgb-text type-effect text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            BRAIN ARCADE
          </h1>
        </div>

        {/* Top Right - Time */}
        <div className="absolute right-20 top-20 short-land:right-4 short-land:top-3">
          <div
            className="text-2xl sm:text-3xl short-land:text-sm rgb-text-fast text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            {time}
          </div>
        </div>

        {/* Bottom Left - Status */}
        <div className="absolute left-20 bottom-20 short-land:hidden">
          <div
            className="text-sm sm:text-base rgb-text-fast text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            {isConnected ? 'REC ●' : 'STANDBY'}
          </div>
        </div>

        {/* Bottom Right - About + GitHub + Privacy */}
        <div className="absolute right-20 bottom-20 short-land:right-4 short-land:bottom-3 flex flex-col items-end space-y-2 short-land:space-y-1">
          <button
            onClick={() => navigate('/about')}
            className="text-[10px] text-xs text-white opacity-80 hover:opacity-100 underline underline-offset-4 cursor-pointer"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
            aria-label="Open About"
          >
            ABOUT
          </button>
          <a
            href="https://github.com/itayinbarr/brain-arcade"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-xs text-white opacity-80 hover:opacity-100 underline underline-offset-4"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
            aria-label="Open GitHub Repository"
          >
            GITHUB
          </a>
          <button
            onClick={() => navigate('/privacy')}
            className="text-[10px] text-xs text-white opacity-80 hover:opacity-100 underline underline-offset-4 cursor-pointer"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
            aria-label="Open Privacy Policy"
          >
            PRIVACY POLICY
          </button>
        </div>

        {/* Center - Main UI */}
        <div className="absolute left-20 top-50 short-land:left-4 short-land:top-14">
          {!isConnected ? (
            <>
              {/* Subtitle */}
              <div className="mb-12-center">
                <p
                  className="text-xl short-land:text-[10px] text-white rgb-text uppercase"
                  style={{ fontFamily: "'Press Start 2P', cursive" }}
                >
                  Use your thoughts as a joystick
                </p>
              </div>

              {/* Connection UI */}
              <div className="w-full max-w-md mt-24 short-land:mt-2">
                <MuseConnector onConnected={() => {}} />
              </div>

              {/* Instructions */}
              <div className="mt-8 short-land:mt-2">
                <p
                  className="text-md short-land:text-[8px] text-white opacity-60"
                  style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}
                >
                  CONNECT YOUR MUSE DEVICE 
                  <br />
                  OR SIMULATE BRAIN DATA
                 
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Connected flow: 3s loading -> electrode check -> start phase (locked) */}
              {showLoadingQC && !hasEnteredStartPhase ? (
                <div className="text-center">
                  <p
                    className="text-xl text-white rgb-text"
                    style={{ fontFamily: "'Press Start 2P', cursive" }}
                  >
                    loading quality check...
                  </p>
                </div>
              ) : hasEnteredStartPhase || (ready && !showLoadingQC && passedSetup && !showingRecheck) ? (
                <div className="text-center">
                  <div className="mb-8 short-land:mb-1">
                    <div
                      className="text-6xl sm:text-8xl short-land:text-4xl rgb-text text-white mb-8 short-land:mb-2 blink"
                      style={{ fontFamily: "'Press Start 2P', cursive" }}
                    >
                      ▶
                    </div>
                  </div>

                  <button
                    onClick={handleStart}
                    className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-lg sm:text-xl px-8 py-4 bg-transparent text-white mt-12 short-land:mt-2"
                    style={{ fontFamily: "'Press Start 2P', cursive" }}
                  >
                    START
                  </button>

                  <p
                    className="text-xs text-white opacity-60 mt-8 short-land:mt-2 blink"
                    style={{ fontFamily: "'Press Start 2P', cursive" }}
                  >
                    PRESS START
                  </p>
                </div>
              ) : (
                <div className="mt-12">
                  <ElectrodeSetupCheck />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
