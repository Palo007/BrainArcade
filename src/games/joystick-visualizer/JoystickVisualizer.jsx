import React, { useEffect, useMemo } from 'react';
import { useBaseline } from '../../contexts/BaselineContext.jsx';
import { useJoystick } from '../../contexts/JoystickContext.jsx';
import { JOYSTICK_AXES } from '../../contexts/JoystickContext.jsx';
import '../../styles/retro.css';
import brainCommandCenterImg from './assets/brain_command_center.png';

function AxisTile({ axis }) {
  const { value01 } = useJoystick(axis, {
    range: 0.6,
    autoAdjustBaseline: true,
  });
  const pct = Math.round(value01 * 100);

  return (
    <div className="p-3 border-2 border-[var(--nes-blue)]/70 bg-black text-white" style={{ fontFamily: "'Press Start 2P', cursive" }}>
      <div className="flex items-center justify-between mb-2 text-[10px]">
        <div className="opacity-80 uppercase text-[var(--nes-blue)]">{axis}</div>
        <div className="text-[var(--nes-blue)]">{pct}</div>
      </div>
      <div className="relative h-4 w-full bg-black border border-[var(--nes-blue)]/40">
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[var(--nes-blue)]/30" />
        <div className="absolute top-0 bottom-0 bg-[var(--nes-blue)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BrainCommandCenter() {
  const { ensureBaseline, isBaselineReady } = useBaseline();

  // Build axis list from JOYSTICK_AXES, skipping obvious aliases
  const axes = useMemo(() => {
    return Object.keys(JOYSTICK_AXES).filter((k) => k !== 'focused-attention');
  }, []);

  const anyNeedsBaseline = axes.some((a) => JOYSTICK_AXES[a]?.requiresBaseline);

  useEffect(() => {
    if (anyNeedsBaseline) {
      ensureBaseline({ seconds: 30 });
    }
  }, [anyNeedsBaseline, ensureBaseline]);

  return (
    <div className="absolute inset-0 bg-black text-white overflow-auto">
      {!isBaselineReady && anyNeedsBaseline && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="border-4 border-[var(--nes-yellow)] bg-[var(--nes-dark)] px-4 py-3 text-[10px]" style={{ fontFamily: "'Press Start 2P', cursive" }}>
            Waiting for baseline…
          </div>
        </div>
      )}

      {/* Title (aligned like SweetSpot) */}
      <div className="absolute top-6 left-6 w-[min(480px,60vw)]">
        <h2 className="text-2xl text-[var(--nes-yellow)] text-left">BRAIN COMMAND CENTER</h2>
        <p className="text-xs text-gray-400 mt-2 text-left">Check out your brain's cognitive traits in real-time</p>
      </div>

      <div className="p-6 pt-24 min-h-full flex flex-col items-center">

        <div className="w-full max-w-6xl mx-auto flex gap-6 items-start">
          {/* Left: Image */}
          <div className="flex-shrink-0">
            <img
              src={brainCommandCenterImg}
              alt="Brain Command Center"
              className="select-none"
              draggable={false}
              style={{
                width: 'min(40vmin, 380px)',
                height: 'auto',
                imageRendering: 'pixelated',
                filter: 'drop-shadow(0 2px 0 rgba(255,255,255,0.05)) drop-shadow(0 8px 16px rgba(0,0,0,0.6))',
              }}
            />
          </div>

          {/* Right: Two columns of joystick blocks */}
          <div className="flex-1">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(240px, 1fr))' }}>
              {axes.map((axis) => (
                <AxisTile key={axis} axis={axis} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
