import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { useBiomarker } from '../../contexts/BiomarkerContext.jsx';
import { useGameHealth } from '../../hooks/useGameHealth.js';
import { useGameScore } from '../../hooks/useGameScore.js';
import { PixelHearts } from '../../components/PixelHearts.jsx';
import { GameOverScreen } from '../../components/GameOverScreen.jsx';
import { Animations } from './components/Animations.jsx';
import sailorImg from './assets/sailor-right.png';
import barrelImg from './assets/barrel.png';
import sceneImg from './assets/scene.png';
import './sailor-animations.css';
import '../../styles/retro.css';

export function Sailor() {
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { value01 } = useJoystick('engagement', {
    range: 0.4,
    autoAdjustBaseline: true
  });
  const { value: engagementValue } = useBiomarker('engagement-index');

  // Game state
  const [sailorX, setSailorX] = useState(15); // Start at 15% from left
  const [hasWon, setHasWon] = useState(false); // Reached barrel
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(Date.now());

  const BARREL_X = 75; // Barrel fixed position (75% from left)

  // Thresholds
  const LOW_THRESHOLD = 0.3;
  const HIGH_THRESHOLD = 0.7;

  // Keep latest joystick value in a ref for the game loop
  const latestEngagementRef = useRef(value01);
  useEffect(() => {
    latestEngagementRef.current = value01 ?? 0.5;
  }, [value01]);

  // Convenience flags for HUD only (do not drive the game loop)
  const GOOD_RANGE = value01 >= LOW_THRESHOLD && value01 <= HIGH_THRESHOLD;
  const OVER_ENGAGED = value01 > HIGH_THRESHOLD;
  const UNDER_ENGAGED = value01 < LOW_THRESHOLD;

  // Health system - drains when over-engaged
  const { health, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    drainWhen: false,
    drainRate: 0,
  });

  // Calculate if dead based on visual hearts (matches PixelHearts component logic)
  const MAX_HEARTS = 3;
  const isDead = useMemo(() => {
    const healthPercentage = Math.max(0, Math.min(100, health)) / 100;
    const filledHearts = Math.round(healthPercentage * MAX_HEARTS);
    return filledHearts === 0;
  }, [health]);

  // Scoring system - accumulates when in good range
  const { score: gameScore, velocity, reset: resetScore } = useGameScore({
    joystickValue: value01,
    baseRate: 10,
    minThreshold: LOW_THRESHOLD,
    maxVelocity: 5,
    velocityBuildRate: 0.1,
    frozen: isDead || hasWon,
  });

  // Ensure baseline is ready
  useEffect(() => {
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

  // Game loop
  useEffect(() => {
    if (!isBaselineReady || isDead || hasWon) return;

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = now;

      // Read latest engagement each frame and compute speed
      const v = latestEngagementRef.current ?? 0.5;
      let speed = 0;
      if (v < LOW_THRESHOLD) {
        speed = 1; // Very slow (1% per second)
      } else if (v <= HIGH_THRESHOLD) {
        speed = 10; // Good speed (10% per second)
      } else {
        speed = 12; // Slightly faster than mid-range without health penalty
      }

      // Update sailor position
      setSailorX((prevX) => {
        const newX = Math.min(prevX + speed * deltaTime, 95); // Cap at 95%
        if (newX >= BARREL_X - 3) setHasWon(true);
        return newX;
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    lastTimeRef.current = Date.now();
    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isBaselineReady, isDead, hasWon]);

  // Waiting for baseline
  if (!isBaselineReady) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-sky-300 to-blue-400">
        <div className="text-center">
          <div className="text-xl font-mono mb-4">CALIBRATING BRAINWAVES</div>
          <div className="text-sm font-mono opacity-70">Relax for 30 seconds...</div>
        </div>
      </div>
    );
  }

  // Game over (win or loss)
  if (isDead || hasWon) {
    const handleRetry = () => {
      resetHealth();
      resetScore();
      setSailorX(15);
      setHasWon(false);
      lastTimeRef.current = Date.now();
    };

    const message = hasWon
      ? "You've recollected your train of thought!"
      : "Seems like you lost your train of thought...";

    return (
      <GameOverScreen
        finalScore={gameScore}
        gameName="sailor"
        joystickAxis="engagement"
        joystickOptions={{ range: 0.4 }}
        onRetry={handleRetry}
        customMessage={message}
      />
    );
  }

  // Main game render
  return (
    <div className="absolute inset-0 overflow-hidden" style={{
      background: 'linear-gradient(to bottom, #87CEEB 0%, #E0F6FF 50%, #4A90A4 100%)',
    }}>
      {/* Background Scene */}
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{
          backgroundImage: `url(${sceneImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          opacity: 0.6,
        }}
      />

      {/* Decorative Animations (birds, clouds, fish) */}
      <Animations />

      {/* Game Elements */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Water Level Line (60% down from top) */}
        <div className="absolute w-full" style={{ top: '60%' }}>

          {/* Sailor */}
          <div
            className="absolute"
            style={{
              left: `${sailorX}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="sailor-float" style={{ width: 'min(120px, 15vmin)' }}>
              <img
                src={sailorImg}
                alt="Sailor"
                className="w-full h-auto"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>

          {/* Barrel */}
          <div
            className="absolute barrel-float"
            style={{
              left: `${BARREL_X}%`,
              transform: 'translate(-50%, 15%)',
              width: 'min(80px, 10vmin)',
            }}
          >
            <img
              src={barrelImg}
              alt="Barrel"
              className="w-full h-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      </div>

      {/* HUD */}
      <div className="absolute bottom-8 right-8 flex gap-6 text-white items-end" style={{ fontFamily: "'Press Start 2P', cursive" }}>
        <div className="text-right">
          <div className="text-[8px] opacity-60">HEALTH</div>
          <div className="mt-2">
            <PixelHearts health={health} maxHearts={MAX_HEARTS} size={20} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] opacity-60">SCORE</div>
          <div className="text-xl text-[var(--nes-yellow)]">{Math.floor(gameScore)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] opacity-60">ENGAGE</div>
          <div className="text-xl">{(value01 * 100).toFixed(0)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] opacity-60">X</div>
          <div className="text-xl">{sailorX.toFixed(1)}%</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] opacity-60">STATUS</div>
          <div className="text-[10px] mt-1">
            {UNDER_ENGAGED && <div className="text-red-400">LOW</div>}
            {GOOD_RANGE && <div className="text-[var(--nes-green)]">OK</div>}
            {OVER_ENGAGED && <div className="text-yellow-400">HIGH</div>}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 border-2 border-white px-4 py-2 text-white text-center" style={{ fontFamily: "'Press Start 2P', cursive", fontSize: '10px' }}>
        <div>Reach the barrel to recollect your train of thought!</div>
        <div className="text-[8px] opacity-70 mt-1">Engagement 30-70% = best speed</div>
      </div>
    </div>
  );
}
