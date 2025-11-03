import { useNavigate } from 'react-router-dom';
import '../styles/retro.css';
import background from '../assets/background.JPG';

export function Credits() {
  const navigate = useNavigate();

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundImage: `url(${background})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* VHS Effects */}
      <div className="scanlines-vhs"></div>
      <div className="noise"></div>
      <div className="noise noise-moving"></div>
      <div className="vhs-vignette"></div>

      {/* Content */}
      <div className="relative z-10 w-full h-full">
        {/* Left Third - Credits Panel */}
        <div className="absolute left-20 top-20 w-2/5 max-w-2xl">
          {/* Back Button */}
          <div className="mb-4">
            <button
              onClick={() => navigate(-1)}
              className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 hover:bg-[var(--nes-blue)] hover:text-black"
              style={{ fontFamily: "'Press Start 2P', cursive" }}
              aria-label="Back"
            >
              ← BACK
            </button>
          </div>

          {/* Title */}
          <h2
            className="text-2xl sm:text-3xl rgb-text text-white mb-4"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            ABOUT
          </h2>

      {/* About Text */}
      <div
        className="text-[10px] sm:text-xs leading-relaxed text-white opacity-90 space-y-3 pr-10"
        style={{ fontFamily: "'Press Start 2P', cursive" }}
      >
            {/* Original credits content remains */}
            <p>
              Made by
              <a
                href="https://itayinbar.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--nes-yellow)] underline hover:opacity-90 ml-2"
                title="Open Itay Inbar website"
              >
                Itay Inbar
              </a>.
            </p>
            <p>
              Neural signals acquired with <span className="text-[var(--nes-blue)]">Muse</span> by{' '}
              <span className="text-[var(--nes-green)]">Interaxon</span>.
            </p>
            <p className="opacity-80">
              A collaborative, open‑source effort — showcasing that usable neurotechnology already exists today.
            </p>

            {/* Why Muse section */}
            <div className="mt-6 pt-4 border-t-4 border-[var(--nes-gray)] border-opacity-40">
              <h3 className="text-sm sm:text-base text-white mb-3 rgb-text" style={{ fontFamily: "'Press Start 2P', cursive" }}>
                WHY MUSE?
              </h3>
              <p className="text-[10px] sm:text-xs">
                Muse is one of the most affordable and widely available consumer EEG headsets. If reliable control can be
                achieved with just two frontal dry electrodes, that’s a strong signal of robustness and real‑world viability.
              </p>
            </div>
          </div>
          {/* License & Privacy */}
          <div className="mt-6 pt-4 border-t-4 border-[var(--nes-gray)] border-opacity-40">
            <h3 className="text-sm sm:text-base text-white mb-3 rgb-text" style={{ fontFamily: "'Press Start 2P', cursive" }}>
              LICENSE & PRIVACY
            </h3>
            <p className="text-[10px] sm:text-xs">
              Brain Arcade — Open-source core (AGPL-3.0-or-later). Games under CC BY-SA 4.0.
              No data is saved or transmitted. See
              {' '}<a href="https://github.com/itayinbarr/brain-arcade/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer" className="text-[var(--nes-yellow)] underline">Privacy</a>,
              {' '}<a href="https://github.com/itayinbarr/brain-arcade/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-[var(--nes-yellow)] underline">License</a>,
              {' '}<a href="https://github.com/itayinbarr/brain-arcade/blob/main/LICENSE.games" target="_blank" rel="noopener noreferrer" className="text-[var(--nes-yellow)] underline">Games License</a>, and
              {' '}<a href="https://github.com/itayinbarr/brain-arcade" target="_blank" rel="noopener noreferrer" className="text-[var(--nes-yellow)] underline">Repo</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
