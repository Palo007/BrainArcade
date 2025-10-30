import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEEG } from '../contexts/MuseContext';
import { MuseConnector } from './MuseConnector';
import '../styles/retro.css';

/**
 * StartScreen - VHS/Retro video game start screen
 * Full-screen immersive experience with scanlines and glitch effects
 */
export function StartScreen() {
  const navigate = useNavigate();
  const { isConnected } = useEEG();
  const [time, setTime] = useState('00:00');
  const titleRef = useRef(null);

  // Update time display
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setTime(`${minutes}:${seconds}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#2b52ff' }}>
      {/* VHS Effects */}
      <div className="scanlines-vhs"></div>
      <div className="noise"></div>
      <div className="noise noise-moving"></div>
      <div className="vhs-vignette"></div>

      {/* Main Content */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {/* Top Left - Title */}
        <div className="absolute left-20 top-20">
          <h1
            ref={titleRef}
            className="text-4xl sm:text-5xl font-bold rgb-text type-effect text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            BRAIN ARCADE
          </h1>
        </div>

        {/* Top Right - Time */}
        <div className="absolute right-20 top-20">
          <div
            className="text-2xl sm:text-3xl rgb-text-fast text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            {time}
          </div>
        </div>

        {/* Bottom Left - Status */}
        <div className="absolute left-20 bottom-20">
          <div
            className="text-sm sm:text-base rgb-text-fast text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            {isConnected ? 'REC ●' : 'STANDBY'}
          </div>
        </div>

        {/* Bottom Right - Mode */}
        <div className="absolute right-20 bottom-20">
          <div
            className="text-xs sm:text-sm text-white opacity-70"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            EEG MODE
          </div>
        </div>

        {/* Center - Main UI */}
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          {!isConnected ? (
            <>
              {/* Subtitle */}
              <div className="mb-12 text-center">
                <p
                  className="text-2xl text-white rgb-text uppercase"
                  style={{ fontFamily: "'Press Start 2P', cursive" }}
                >
                  Use your thoughts as a remote
                </p>
              </div>

              {/* Connection UI */}
              <div className="w-full max-w-md">
                <MuseConnector onConnected={() => {}} />
              </div>

              {/* Instructions */}
              <div className="mt-8 text-center">
                <p
                  className="text-md text-white opacity-60"
                  style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}
                >
                  CONNECT YOUR
                  <br />
                  MUSE DEVICE
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Connected - Show Start */}
              <div className="text-center">
                <div className="mb-8">
                  <div
                    className="text-6xl sm:text-8xl rgb-text text-white mb-8 blink"
                    style={{ fontFamily: "'Press Start 2P', cursive" }}
                  >
                    ▶
                  </div>
                </div>

                <button
                  onClick={handleStart}
                  className="retro-button border-white hover:bg-white hover:text-[#2b52ff] text-lg sm:text-xl px-8 py-4 bg-transparent text-white"
                  style={{ fontFamily: "'Press Start 2P', cursive" }}
                >
                  START
                </button>

                <p
                  className="text-xs text-white opacity-60 mt-8 blink"
                  style={{ fontFamily: "'Press Start 2P', cursive" }}
                >
                  PRESS START
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
