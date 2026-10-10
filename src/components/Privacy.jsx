import { useNavigate } from 'react-router-dom';
import '../styles/retro.css';
import background from '../assets/background.JPG';

export function Privacy() {
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
        {/* Left Third - Privacy Panel */}
        <div className="absolute left-20 top-40 w-1/3 max-w-xl short-land:left-4 short-land:top-3 short-land:bottom-3 short-land:max-w-none short-land:w-3/5 short-land:overflow-y-auto phone-port:left-4 phone-port:right-4 phone-port:top-4 phone-port:bottom-4 phone-port:w-auto phone-port:max-w-none phone-port:overflow-y-auto">
          {/* Back Button */}
          <div className="mb-4 short-land:mb-2">
            <button
              onClick={() => navigate(-1)}
              className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 short-land:py-1 short-land:text-[10px] hover:bg-[var(--nes-blue)] hover:text-black"
              style={{ fontFamily: "'Press Start 2P', cursive" }}
              aria-label="Back"
            >
              ← BACK
            </button>
          </div>

          {/* Title */}
          <h2
            className="text-2xl sm:text-3xl short-land:text-base rgb-text text-white mb-4 short-land:mb-2"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            PRIVACY POLICY
          </h2>

          {/* Privacy Text */}
          <div
            className="text-[10px] sm:text-xs leading-relaxed text-white opacity-90 space-y-3 pr-6"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            <p>
              This project is open‑source. You can inspect the source code
              at any time to verify how it works.
            </p>
            <p>
              We do not collect or transmit any personal data or usage
              analytics. Nothing leaves your device.
            </p>
            <p>
              Stored on your device only: child nicknames, session summaries
              and per-child calibration (localStorage), and, if you switch it
              on, a raw EEG/fNIRS recording (browser private file storage)
              until you save or delete it. Downloads, shares and CSV export
              happen only when you ask.
            </p>
            <p>
              Delete it any time: Clear history per child, delete a profile,
              delete a recording, or clear this site's data in your browser.
            </p>
            <p>
              All processing happens locally on your device solely to enable
              gameplay and interactions. Disconnect your device at any time to
              stop all processing immediately.
            </p>
            <p className="opacity-80">
              If you fork or host your own version, please review any changes
              you introduce. This policy applies to this open‑source version
              as provided here.
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
