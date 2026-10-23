/* SPDX-License-Identifier: AGPL-3.0-or-later */
// "How do you play today?" picker (start screen) and the one-tap setup chip (top bar).
import React from 'react';
import { usePlaySetup } from '../contexts/PlaySetupContext.jsx';
import { SETUPS, SETUP_INFO, nextSetup } from '../lib/playSetup.js';
import '../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };

/** Three big options. The choice is saved at once (per child and device). */
export function PlaySetupPicker() {
  const { setup, setSetup } = usePlaySetup();
  // ARIA radio group: one tab stop, arrow keys move the choice
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const k = SETUPS[(SETUPS.indexOf(setup) + step + SETUPS.length) % SETUPS.length];
    setSetup(k);
    e.currentTarget.querySelector(`[data-setup="${k}"]`)?.focus();
  };
  return (
    <div className="w-[30rem] max-w-full mx-auto" style={FONT}>
      <p className="text-sm short-land:text-[10px] phone-port:text-[11px] text-white rgb-text mb-3 short-land:mb-1 phone-port:bg-black/70 phone-port:px-2 phone-port:py-1 phone-port:inline-block">
        HOW DO YOU PLAY TODAY?
      </p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How do you play today?" onKeyDown={onKeyDown}>
        {SETUPS.map((k) => {
          const on = k === setup;
          const i = SETUP_INFO[k];
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-setup={k}
              onClick={() => setSetup(k)}
              className={`flex flex-col items-center justify-center gap-1 border-4 short-land:border-2 px-1 py-3 short-land:py-1 min-h-[96px] short-land:min-h-[64px] cursor-pointer transition-colors ${
                on ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-white bg-black/80 text-white hover:border-[var(--nes-yellow)]'
              }`}
            >
              <span className="text-3xl short-land:text-xl leading-none" aria-hidden="true">{i.icon}</span>
              <span className="text-[10px] short-land:text-[8px] leading-snug">{i.label}</span>
              <span className={`text-[8px] short-land:hidden leading-snug ${on ? 'text-black/70' : 'text-gray-400'}`}>{i.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Top-bar chip: shows the setup, one tap moves to the next one. Never touches the game. */
export function PlaySetupChip() {
  const { setup, setSetup } = usePlaySetup();
  const i = SETUP_INFO[setup];
  const next = SETUP_INFO[nextSetup(setup)];
  return (
    <button
      type="button"
      onClick={() => setSetup(nextSetup(setup))}
      aria-label={`Play setup: ${i.label}. Tap for ${next.label}`}
      title={`Play setup: ${i.label} (tap: ${next.label})`}
      className="inline-flex items-center justify-center gap-1 bg-[var(--nes-dark)] border-4 short-land:border-2 border-white text-white px-2 py-2 short-land:py-0 min-h-[44px] min-w-[44px] short-land:min-h-[36px] short-land:min-w-[36px] text-[11px] hover:bg-white hover:text-black transition-colors cursor-pointer"
      style={FONT}
    >
      <span aria-hidden="true" className="text-base leading-none">{i.icon}</span>
      <span className="phone-port:hidden compact:hidden">{i.short}</span>
    </button>
  );
}
