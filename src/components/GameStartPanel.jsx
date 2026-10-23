/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Shared START screen overlay for every PLAY game.
import React from 'react';
import { SignalCheck } from './ElectrodeOverlay.jsx';
import '../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };

// Option chip class (selected = yellow)
// eslint-disable-next-line react-refresh/only-export-components
export const startChip = (on) =>
  `border-2 px-3 py-2 text-[10px] ${on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-white/60 text-white'}`;

export function OptionLabel({ children }) {
  return <p className="text-[9px] text-gray-300 mb-2">{children}</p>;
}

export function GameStartPanel({ title, children, onStart, best = 0, startLabel = 'START', signalNote, onRecalibrate }) {
  // phone-port:pb-20 keeps the panel above the games' bottom buttons (SOUND, STOP)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center px-4 pt-24 pb-4 phone-port:pb-20 pointer-events-none">
      <div
        className="border-4 border-[var(--nes-yellow)] bg-black/75 px-6 py-5 text-center text-white max-w-lg w-full max-h-full overflow-y-auto pointer-events-auto"
        style={FONT}
      >
        <h2 className="text-sm text-[var(--nes-yellow)] mb-3">{title}</h2>
        {children}
        {onStart && (
          <>
            <div className="text-left border-2 border-white/30 bg-black/40 p-3 mb-5">
              <SignalCheck compact eegNote={signalNote} />
            </div>
            <button
              type="button"
              onClick={onStart}
              className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black"
            >
              {startLabel}
            </button>
            {onRecalibrate && (
              <div>
                <button
                  type="button"
                  onClick={onRecalibrate}
                  className="border-2 border-white/60 px-3 py-2 text-[10px] text-white mt-3"
                >
                  RECALIBRATE
                </button>
              </div>
            )}
          </>
        )}
        {best > 0 && <p className="text-[9px] text-gray-400 mt-3">BEST {best}</p>}
      </div>
    </div>
  );
}
