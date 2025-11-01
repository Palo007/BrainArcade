import React, { useEffect, useRef, useState } from 'react';
import { useEEG } from '../../contexts/MuseContext.jsx';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { useBiomarker } from '../../contexts/BiomarkerContext.jsx';
import '../../styles/retro.css';
import chillImg from './assets/chill.png';
import worriedImg from './assets/worried.png';
import fallingImg from './assets/falling.png';

export function SweetSpot() {
  const { isConnected } = useEEG();
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { value01 } = useJoystick('relaxation', { range: 0.4, baselineCenter: 0.8 });
  const { value: frontalTheta, baseline: frontalThetaBaseline } = useBiomarker('frontal-midline-theta');

  // Smoothed height 0..1
  const [height, setHeight] = useState(0.5);
  const rafRef = useRef(null);

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

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-[var(--nes-red)] mb-2">MUSE NOT CONNECTED</p>
        <p className="text-xs text-gray-400">Please return to home and connect your device</p>
      </div>
    );
  }

  // Layout metrics
  const imgSize = 160; // base size in px (responsive via CSS width below)

  const score = Math.round(height * 100);
  const sprite = score > 70 ? chillImg : score > 40 ? worriedImg : fallingImg;

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Title */}
      <div className="text-left p-6 pb-2">
        <h2 className="text-2xl text-[var(--nes-yellow)]">SWEET SPOT</h2>
        <p className="text-xs text-gray-400">Keep the character floating by staying relaxed</p>
      </div>

      {/* Main stage - full screen */}
      <div className="flex-1 bg-black relative overflow-hidden min-h-0">
          {/* Local styles for starfield */}
          <style>{`
            .starfield, .starfield2, .starfield3 { position: absolute; inset: 0; pointer-events: none; }
            .starfield {
              background-image: radial-gradient(circle, #ffffff 1px, transparent 1px);
              background-size: 120px 120px;
              image-rendering: pixelated;
              animation: twinkle1 3.2s steps(2,end) infinite;
            }
            .starfield2 {
              background-image: radial-gradient(circle, #ffffff 1px, transparent 1px);
              background-size: 95px 85px;
              animation: twinkle2 2.7s steps(2,end) infinite;
              image-rendering: pixelated;
            }
            .starfield3 {
              background-image: radial-gradient(circle, #ffffff 1px, transparent 1px);
              background-size: 150px 110px;
              animation: twinkle3 4.1s steps(2,end) infinite;
              image-rendering: pixelated;
            }
            @keyframes twinkle1 { 0%,100% { opacity: 0; } 50% { opacity: 0.4; } }
            @keyframes twinkle2 { 0%,100% { opacity: 0; } 50% { opacity: 0.35; } }
            @keyframes twinkle3 { 0%,100% { opacity: 0; } 50% { opacity: 0.3; } }
          `}</style>
        {!isBaselineReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              Waiting for baseline…
            </div>
          </div>
        )}

        {/* Stars */}
        <div className="starfield" />
        <div className="starfield2" />
        <div className="starfield3" />

        {/* Sprite */}
        <img
          src={sprite}
          alt="relaxation sprite"
          draggable={false}
          className="absolute left-1/2 top-1/2 select-none"
          style={{
            transform: `translate(-50%, calc(-50% + ${(0.5 - height) * 35}%))`,
            width: `min(${imgSize}px, 20vmin)`,
            height: 'auto',
            imageRendering: 'pixelated',
            filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.05)) drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
            pointerEvents: 'none',
            transition: 'opacity 0.15s ease-out',
          }}
        />

        {/* Bottom right HUD */}
        <div className="absolute bottom-4 right-4 flex gap-6 text-white" style={{ fontFamily: "'Press Start 2P', cursive" }}>
          <div className="text-right">
            <div className="text-[8px] opacity-60">RELAX</div>
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
