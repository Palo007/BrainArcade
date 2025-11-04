import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useBlinkDetector } from '../../contexts/BlinkContext.jsx';
import { PixelHearts } from '../../components/PixelHearts.jsx';
import { GameOverScreen } from '../../components/GameOverScreen.jsx';
import { GameHint } from '../../components/GameHint.jsx';
import { RetroModal } from '../../components/RetroModal.jsx';
import '../../styles/retro.css';
import './eye-animations.css';

export function BlinkingContest() {
  // Game state
  const [showWelcome, setShowWelcome] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [blinksRemaining, setBlinksRemaining] = useState(3);
  const [blinkTimestamps, setBlinkTimestamps] = useState([]);
  const [currentAnimation, setCurrentAnimation] = useState(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [score, setScore] = useState(0);
  const [isDead, setIsDead] = useState(false);

  // Refs
  const gameStartTimeRef = useRef(null);
  const scoreIntervalRef = useRef(null);
  const animationTimeoutRef = useRef(null);

  // Blink detection
  const { resetBlinks } = useBlinkDetector(
    useCallback((timestamp) => {
      if (!gameStarted || isDead) return;

      // Record blink timestamp
      const gameTime = Date.now() - gameStartTimeRef.current;
      setBlinkTimestamps(prev => [...prev, gameTime]);

      // Reduce blinks remaining
      setBlinksRemaining(prev => {
        const newRemaining = prev - 1;

        // Show double-blink animation immediately
        setCurrentAnimation('double-blink');

        // After animation, check if we should show grin or sad
        if (animationTimeoutRef.current) {
          clearTimeout(animationTimeoutRef.current);
        }

        animationTimeoutRef.current = setTimeout(() => {
          setCurrentAnimation(null);

          // After the first blink, we can compare intervals
          if (blinkTimestamps.length >= 1) {
            setBlinkTimestamps(currentTimestamps => {
              const allTimestamps = [...currentTimestamps, gameTime];

              if (allTimestamps.length >= 2) {
                // Calculate intervals between consecutive blinks
                const intervals = [];
                for (let i = 1; i < allTimestamps.length; i++) {
                  intervals.push(allTimestamps[i] - allTimestamps[i - 1]);
                }

                // Compare last interval with previous
                if (intervals.length >= 2) {
                  const lastInterval = intervals[intervals.length - 1];
                  const previousInterval = intervals[intervals.length - 2];

                  // Show grin if improving (lasting longer), sad if declining
                  setTimeout(() => {
                    setCurrentAnimation(lastInterval > previousInterval ? 'grin' : 'sad');

                    // Clear animation after it plays
                    setTimeout(() => {
                      setCurrentAnimation(null);
                    }, 1200);
                  }, 200);
                }
              }

              return currentTimestamps;
            });
          }

          // Check if game over
          if (newRemaining <= 0) {
            setIsDead(true);
            if (scoreIntervalRef.current) {
              clearInterval(scoreIntervalRef.current);
            }
          }
        }, 600); // Duration of double-blink animation

        return newRemaining;
      });
    }, [gameStarted, isDead, blinkTimestamps])
  );

  // Start game
  const handleStart = () => {
    setShowWelcome(false);
    setGameStarted(true);
    gameStartTimeRef.current = Date.now();

    // Start score accumulation with increasing velocity
    let baseRate = 10; // Points per second
    scoreIntervalRef.current = setInterval(() => {
      setTimeElapsed(prev => {
        const newTime = prev + 0.1; // Update every 100ms

        // Increase velocity slightly over time (up to 2x after 60 seconds)
        const velocity = 1 + Math.min(newTime / 60, 1);
        setScore(s => s + (baseRate * 0.1 * velocity));

        return newTime;
      });
    }, 100);
  };

  // Retry game
  const handleRetry = () => {
    setShowWelcome(true);
    setGameStarted(false);
    setBlinksRemaining(3);
    setBlinkTimestamps([]);
    setCurrentAnimation(null);
    setTimeElapsed(0);
    setScore(0);
    setIsDead(false);
    resetBlinks();

    if (scoreIntervalRef.current) {
      clearInterval(scoreIntervalRef.current);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scoreIntervalRef.current) {
        clearInterval(scoreIntervalRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Show game over screen if dead
  if (isDead) {
    return (
      <GameOverScreen
        finalScore={Math.round(score)}
        gameName="blinking-contest"
        onRetry={handleRetry}
        customMessage="You blinked 3 times!"
      />
    );
  }

  return (
    <div className="absolute inset-0" style={{ backgroundColor: '#EA9AB2' }}>
      {/* Welcome Modal */}
      {showWelcome && (
        <RetroModal
          title="BLINKING CONTEST"
          confirmLabel="START"
          onConfirm={handleStart}
          confirmVisible={true}
          showFooter={true}
        >
          <p style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}>
            Welcome to the blinking contest.<br /><br />
            You have 3 blinks before losing.<br /><br />
            Try to stay as long as possible without blinking!
          </p>
        </RetroModal>
      )}

      {/* Main Game Area */}
      {!showWelcome && (
        <>
          {/* Title */}
          <div className="absolute top-6 left-6 w-[min(480px,60vw)]">
            <h2 className="text-2xl text-[var(--nes-dark)]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              BLINKING CONTEST
            </h2>
            <p className="text-xs text-[var(--nes-dark)] mt-2" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              Don't blink!
            </p>
          </div>

          {/* Eyes Container */}
          <div className="eyes-wrapper">
            <div className="eye-container">
              <div
                className={`eye left ${currentAnimation === 'double-blink' ? 'double-blink' : ''} ${currentAnimation === 'grin' ? 'grin' : ''} ${currentAnimation === 'sad' ? 'sad' : ''}`}
                key={`eye-left-${currentAnimation}`}
              />
            </div>
            <div className="eye-container">
              <div
                className={`eye right delayed ${currentAnimation === 'double-blink' ? 'double-blink' : ''} ${currentAnimation === 'grin' ? 'grin' : ''} ${currentAnimation === 'sad' ? 'sad' : ''}`}
                key={`eye-right-${currentAnimation}`}
              />
            </div>
          </div>

          {/* HUD - Bottom Right */}
          <div
            className="absolute bottom-8 right-8 flex gap-6 text-[var(--nes-dark)] items-end"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            <div className="text-right">
              <div className="text-[8px] opacity-80">BLINKS</div>
              <div className="mt-2">
                <PixelHearts health={(blinksRemaining / 3) * 100} maxHearts={3} size={20} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] opacity-80">SCORE</div>
              <div className="text-xl">
                {Math.round(score).toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[8px] opacity-80">TIME</div>
              <div className="text-xl">
                {timeElapsed.toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Game Hint - Bottom Left */}
          <GameHint
            position="bottom-left"
            offset={8}
            scheme="dark"
            align="left"
            primary="Don't blink!"
            secondary="3 blinks and you lose"
          />
        </>
      )}
    </div>
  );
}

/* SPDX-License-Identifier: CC-BY-SA-4.0
   Copyright (c) 2025 Itay Inbar
*/
