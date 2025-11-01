import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { useBiomarker } from '../../contexts/BiomarkerContext.jsx';
import { useGameHealth } from '../../hooks/useGameHealth.js';
import { useGameScore } from '../../hooks/useGameScore.js';
import { PixelHearts } from '../../components/PixelHearts.jsx';
import { GameOverScreen } from '../../components/GameOverScreen.jsx';
import '../../styles/retro.css';
import chillImg from './assets/chill.png';
import worriedImg from './assets/worried.png';
import fallingImg from './assets/falling.png';

export function SweetSpot() {
  const { ensureBaseline, isBaselineReady } = useBaseline();
  // Level 1: Cognitive joystick (0..1) for focus, built from FMT vs baseline
  const { value01 } = useJoystick('focus', {
    range: 0.4,
    baselineCenter: 0.5,
    autoAdjustBaseline: true // Enable adaptive baseline adjustment
  });
  const { value: frontalTheta, baseline: frontalThetaBaseline } = useBiomarker('frontal-midline-theta');

  // Smoothed height 0..1
  const [height, setHeight] = useState(0.5);
  const rafRef = useRef(null);

  // Calculate score from height
  const score = Math.round(height * 100);

  // Game mechanics: health and scoring
  const { health, isDead, reset: resetHealth } = useGameHealth({
    initialHealth: 100,
    drainWhen: score < 40,
    drainRate: 5,
  });

  const { score: gameScore, velocity, isAccumulating, reset: resetScore } = useGameScore({
    joystickValue: value01,
    baseRate: 10,
    minThreshold: 0.4,
    dropThreshold: 0.1,
    maxVelocity: 5,
    velocityBuildRate: 0.1,
    frozen: isDead, // Freeze score when game is over
  });

  // Generate random stars once
  const stars = useMemo(() => {
    const starCount = 150;
    return Array.from({ length: starCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.4 + 0.3,
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 3,
    }));
  }, []);

  useEffect(() => {
    // Require baseline at start (game decides this)
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

  useEffect(() => {
    // Extra smooth easing to joystick value
    const step = () => {
      setHeight((h) => h * 0.92 + value01 * 0.08);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value01]);

  // Show game over screen if dead
  if (isDead) {
    const handleRetry = () => {
      // Reset game-specific state without reloading or disconnecting
      resetHealth();
      resetScore();
      setHeight(0.5);
    };
    return (
      <GameOverScreen
        finalScore={gameScore}
        gameName="sweet-spot"
        joystickAxis="focus"
        joystickOptions={{
          range: 0.4,
          baselineCenter: 0.5,
          autoAdjustBaseline: true,
        }}
        onRetry={handleRetry}
      />
    );
  }

  // Layout metrics
  const imgSize = 280; // base size in px (responsive via CSS width below)
  const sprite = score > 70 ? chillImg : score > 40 ? worriedImg : fallingImg;

  return (
    <div className="absolute inset-0">
      {/* Main stage - full screen */}
      <div className="absolute inset-0 bg-black overflow-hidden">
          {/* Local styles */}
          <style>{`
            @keyframes twinkle {
              0%, 100% { opacity: 0.2; }
              50% { opacity: 1; }
            }
            @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
            .sprite-float { animation: float 2.5s ease-in-out infinite; }
            .star {
              position: absolute;
              background: white;
              border-radius: 50%;
              pointer-events: none;
            }
          `}</style>
        {!isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              Waiting for baseline…
            </div>
          </div>
        )}

        {/* Stars */}
        {stars.map((star) => (
          <div
            key={star.id}
            className="star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animation: `twinkle ${star.duration}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
              opacity: star.opacity,
            }}
          />
        ))}

        {/* Title */}
        <div className="absolute top-6 left-6">
          <h2 className="text-2xl text-[var(--nes-yellow)]">SWEET SPOT</h2>
          <p className="text-xs text-gray-400">Keep the character floating by staying focused</p>
        </div>

        {/* Sprite */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(-50%, calc(-50% + ${(0.5 - height) * 100}%))`,
          }}
        >
          <img
            src={sprite}
            alt="relaxation sprite"
            draggable={false}
            className="select-none sprite-float"
            style={{
              width: `min(${imgSize}px, 35vmin)`,
              height: 'auto',
              imageRendering: 'pixelated',
              filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.05)) drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
              pointerEvents: 'none',
              transition: 'opacity 0.15s ease-out',
            }}
          />
        </div>

        {/* Bottom right HUD */}
        <div className="absolute bottom-4 right-4 flex gap-6 text-white items-end" style={{ fontFamily: "'Press Start 2P', cursive" }}>
          <div className="text-right">
            <div className="text-[8px] opacity-60">HEALTH</div>
            <div className="mt-2">
              <PixelHearts health={health} maxHearts={3} size={20} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">SCORE</div>
            <div className="text-xl text-[var(--nes-yellow)]">{gameScore.toLocaleString()}</div>
            {isAccumulating && (
              <div className="text-[6px] text-[var(--nes-green)] opacity-80">x{velocity.toFixed(1)}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">FOCUS</div>
            <div className="text-xl">{score}</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">THETA</div>
            <div className="text-xl">{frontalTheta != null ? frontalTheta.toFixed(2) : '---'}</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] opacity-60">BASE</div>
            <div className="text-xl">{frontalThetaBaseline != null ? frontalThetaBaseline.toFixed(2) : '---'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
