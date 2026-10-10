import React from 'react';
import { useJoystick } from '../contexts/JoystickContext.jsx';
import '../styles/retro.css';

export function Joystick({ axis, label, range = 0.4, hintLow, hintHigh }) {
  const { value01 } = useJoystick(axis, { range });
  const pct = Math.round(value01 * 100);
  return (
    <div className="text-white" style={{ fontFamily: 'var(--font-retro)' }}>
      <div className="flex items-center justify-between mb-1 text-[10px]">
        <div className="opacity-80">{label || axis}</div>
        <div className="text-[var(--nes-yellow)]">{pct}</div>
      </div>
      <div className="relative h-4 w-full bg-black border border-[var(--nes-gray)]">
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-[var(--nes-gray)] opacity-60" />
        <div className="absolute top-0 bottom-0 bg-[var(--nes-green)]" style={{ width: `${pct}%` }} />
      </div>
      {(hintLow || hintHigh) && (
        <div className="flex justify-between mt-1 text-[9px] opacity-70">
          <span>{hintLow}</span>
          <span>{hintHigh}</span>
        </div>
      )}
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
