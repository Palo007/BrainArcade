import React, { useEffect, useRef, useState } from 'react';
import { useEEG } from '../../contexts/MuseContext.jsx';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { useBiomarker } from '../../contexts/BiomarkerContext.jsx';
import '../../styles/retro.css';

export function SweetSpot() {
  const { isConnected } = useEEG();
  const { ensureBaseline, isBaselineReady } = useBaseline();
  const { value01 } = useJoystick('relaxation', { range: 0.4, baselineCenter: 0.8 });
  const { value: frontalTheta, baseline: frontalThetaBaseline } = useBiomarker('frontal-midline-theta');

  // Smoothed height 0..1
  const [height, setHeight] = useState(0.5);
  const rafRef = useRef(null);

  useEffect(() => {
    // Require baseline at start
    ensureBaseline({ seconds: 30 });
  }, [ensureBaseline]);

  useEffect(() => {
    // Smooth animate to joystick value
    const step = () => {
      setHeight((h) => h * 0.9 + value01 * 0.1);
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
  const ballSize = 24;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center mb-2">
        <h2 className="text-2xl text-[var(--nes-yellow)]">SWEET SPOT</h2>
        <p className="text-xs text-gray-400">Raise the ball by relaxing</p>
      </div>

      {/* Main stage */}
      <div className="flex gap-4 items-stretch">
        {/* Stage */}
        <div className="flex-1 border-4 border-[var(--nes-yellow)] bg-black p-4 relative overflow-hidden">
          {!isBaselineReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
              <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
                Waiting for baseline…
              </div>
            </div>
          )}
          <div className="text-[10px] text-[var(--nes-yellow)] mb-2">RELAXATION</div>
          <div className="relative h-[360px] border-4 border-[var(--nes-yellow)] bg-[#111]">
            {/* Center line and tick marks */}
            <div className="absolute left-1/2 top-2 bottom-2 w-[1px] bg-[var(--nes-gray)] opacity-40" />
            {[0.25, 0.5, 0.75].map((p) => (
              <div key={p} className="absolute left-2 right-2 h-[1px] bg-[var(--nes-gray)] opacity-20" style={{ top: `${(1 - p) * 100}%` }} />
            ))}

            {/* Ball */}
            <div
              className="absolute left-1/2 -ml-3 rounded-full shadow"
              style={{
                bottom: `${height * 100}%`,
                transform: `translate(-50%, ${-ballSize / 2}px)`,
                width: `${ballSize}px`,
                height: `${ballSize}px`,
                background: 'radial-gradient(circle at 30% 30%, #FFF380, #E0A030)',
                border: '2px solid #C08820',
              }}
            />
          </div>
        </div>

        {/* Sidebar with joystick value */}
        <div className="w-60 shrink-0 space-y-4">
          <div className="border-4 border-[var(--nes-yellow)] p-4 bg-[var(--nes-dark)]">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">STATUS</div>
            <div className="text-4xl text-center" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              {Math.round(value01 * 100)}
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
