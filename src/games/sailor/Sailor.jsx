import React, { useEffect, useRef, useState } from 'react';
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
  const [barrelX, setBarrelX] = useState(50); // Start at center (50%)
  const [barrelMoving, setBarrelMoving] = useState(false); // Is barrel moving left?
  const [collected, setCollected] = useState(0); // Number of barrels collected
  const [hasWon, setHasWon] = useState(false); // Reached right checkpoint
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(Date.now());

  const RIGHT_CHECKPOINT = 85; // Win when sailor reaches this point
  const BARREL_STOP_DISTANCE = 15; // Barrel stops this % ahead of sailor

  // Thresholds
  const LOW_THRESHOLD = 0.3;
  const HIGH_THRESHOLD = 0.7;
  const GOOD_RANGE = value01 >= LOW_THRESHOLD && value01 <= HIGH_THRESHOLD;
  const OVER_ENGAGED = value01 > HIGH_THRESHOLD;
  const UNDER_ENGAGED = value01 < LOW_THRESHOLD;

  // Health system - drains when over-engaged
  const { health, isDead, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    drainWhen: OVER_ENGAGED,
    drainRate: 5,
  });

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

      // Update sailor position based on engagement
      setSailorX(prevX => {
        let speed;
        if (UNDER_ENGAGED) {
          speed = 1; // Very slow (1% per second)
        } else if (GOOD_RANGE) {
          speed = 10; // Good speed (10% per second)
        } else if (OVER_ENGAGED) {
          speed = 8; // Still moves but losing health (8% per second)
        }
        const newX = Math.min(prevX + speed * deltaTime, 95); // Cap at 95%

        // Check if reached right checkpoint
        if (newX >= RIGHT_CHECKPOINT) {
          setHasWon(true);
        }

        return newX;
      });

      // Update barrel position - moves left if active, stops when close enough to sailor
      setBarrelX(prevX => {
        if (!barrelMoving) return prevX;

        // Move left toward sailor
        const moveSpeed = 8; // 8% per second
        const targetX = sailorX + BARREL_STOP_DISTANCE;

        // If barrel has reached the target distance ahead of sailor, stop moving
        if (prevX <= targetX) {
          setBarrelMoving(false);
          return targetX;
        }

        return Math.max(prevX - moveSpeed * deltaTime, targetX);
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    lastTimeRef.current = Date.now();
    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isBaselineReady, isDead, hasWon, UNDER_ENGAGED, GOOD_RANGE, OVER_ENGAGED, barrelMoving, sailorX, RIGHT_CHECKPOINT, BARREL_STOP_DISTANCE]);

  // Collision detection and barrel collection
  useEffect(() => {
    if (isDead || hasWon) return;

    // Check if sailor has reached the barrel (within 5% tolerance)
    if (sailorX >= barrelX - 5 && !barrelMoving) {
      // Collection!
      setCollected(prev => prev + 1);

      // Spawn new barrel from the right
      setBarrelX(90); // Start from right side
      setBarrelMoving(true); // Start moving left toward sailor
    }
  }, [sailorX, barrelX, isDead, hasWon, barrelMoving]);

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
      setBarrelX(50);
      setBarrelMoving(false);
      setCollected(0);
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
            className="absolute sailor-float"
            style={{
              left: `${sailorX}%`,
              transform: 'translate(-50%, -50%)',
              width: 'min(120px, 15vmin)',
              transition: 'left 0.1s linear',
            }}
          >
            <img
              src={sailorImg}
              alt="Sailor"
              className="w-full h-auto"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Barrel */}
          <div
            className="absolute barrel-float"
            style={{
              left: `${barrelX}%`,
              transform: 'translate(-50%, 15%)', // Lowered significantly to align with sailor's bottom
              width: 'min(80px, 10vmin)',
              transition: 'left 0.1s linear',
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
      <div className="absolute bottom-4 right-4 bg-black/70 border-2 border-white p-3 font-mono text-white">
        <div className="flex items-center gap-3 mb-2">
          <PixelHearts health={health} maxHearts={3} size={16} />
        </div>
        <div className="text-sm space-y-1">
          <div>SCORE: {Math.floor(gameScore)}</div>
          <div>BARRELS: {collected}</div>
          <div className="text-xs opacity-70">
            ENGAGEMENT: {(value01 * 100).toFixed(0)}%
          </div>
        </div>

        {/* Engagement Status Indicator */}
        <div className="mt-2 text-xs">
          {UNDER_ENGAGED && <div className="text-red-400">⚠ TOO LOW</div>}
          {GOOD_RANGE && <div className="text-green-400">✓ ENGAGED</div>}
          {OVER_ENGAGED && <div className="text-yellow-400">⚠ TOO HIGH</div>}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 border-2 border-white px-4 py-2 font-mono text-white text-center text-sm">
        <div>Stay engaged to sail toward your lost train of thought!</div>
        <div className="text-xs opacity-70 mt-1">Keep engagement between 30-70% for best speed</div>
      </div>
    </div>
  );
}
