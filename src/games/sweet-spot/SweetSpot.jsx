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
  const imgSize = 320; // base size in px (responsive via CSS width below)

  const score = Math.round(height * 100);
  const sprite = score > 70 ? chillImg : score > 40 ? worriedImg : fallingImg;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center mb-2">
        <h2 className="text-2xl text-[var(--nes-yellow)]">SWEET SPOT</h2>
        <p className="text-xs text-gray-400">Keep the character floating by staying relaxed</p>
      </div>

      {/* Main stage */}
      <div className="flex gap-4 items-stretch">
        {/* Stage */}
        <div className="flex-1 bg-black p-0 relative overflow-hidden">
          {/* Local styles for starfield */}
          <style>{`
            .starfield, .starfield2 { position: absolute; inset: 0; pointer-events: none; }
            .starfield {
              background-image: radial-gradient(#ffffff 1px, transparent 1px);
              background-size: 6px 6px; /* pixel-like spacing */
              animation: starScroll 60s linear infinite, twinkle 1.8s steps(2,end) infinite;
              image-rendering: pixelated;
              opacity: 0.6;
            }
            .starfield2 {
              background-image: radial-gradient(#ffffff 1px, transparent 1px);
              background-size: 3px 3px;
              animation: starScroll2 120s linear infinite, twinkle 2.4s steps(2,end) infinite;
              image-rendering: pixelated;
              opacity: 0.35;
            }
            @keyframes starScroll { from { background-position: 0 0; } to { background-position: -1200px 800px; } }
            @keyframes starScroll2 { from { background-position: 0 0; } to { background-position: -800px 1200px; } }
            @keyframes twinkle { 0%,100% { opacity: 0.55; } 50% { opacity: 0.95; } }
          `}</style>
          {!isBaselineReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
                Waiting for baseline…
              </div>
            </div>
          )}
          <div className="relative h-[420px]">
            {/* Stars */}
            <div className="starfield" />
            <div className="starfield2" />

            {/* Sprite */}
            <img
              src={sprite}
              alt="relaxation sprite"
              draggable={false}
              className="absolute left-1/2 select-none"
              style={{
                top: `${(1 - height) * 100}%`,
                transform: `translate(-50%, -50%)`,
                width: `min(${imgSize}px, 38vmin)`,
                height: 'auto',
                imageRendering: 'pixelated',
                filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.05)) drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
                pointerEvents: 'none',
                transition: 'opacity 0.15s ease-out',
              }}
            />
          </div>
        </div>

        {/* Sidebar with joystick value */}
        <div className="w-60 shrink-0 space-y-4">
          <div className="border-4 border-[var(--nes-yellow)] p-4 bg-[var(--nes-dark)]">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">STATUS</div>
            <div className="text-4xl text-center" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              {score}
            </div>
            <div className="text-[8px] text-gray-400 text-center mt-1">relaxation</div>
          </div>

          <div className="border-4 border-[var(--nes-yellow)] p-4 bg-[var(--nes-dark)]">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">MIDLINE THETA</div>
            <div className="text-2xl text-center font-mono">
              {frontalTheta != null ? frontalTheta.toFixed(2) : '---'}
            </div>
            <div className="text-[8px] text-gray-400 text-center mt-1">AF7/AF8 avg (band power)</div>
          </div>

          <div className="border-4 border-[var(--nes-yellow)] p-4 bg-[var(--nes-dark)]">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">BASELINE (MIDLINE THETA)</div>
            <div className="text-2xl text-center font-mono">
              {frontalThetaBaseline != null ? frontalThetaBaseline.toFixed(2) : '---'}
            </div>
            <div className="text-[8px] text-gray-400 text-center mt-1">recorded average</div>
          </div>
        </div>
      </div>
    </div>
  );
}
