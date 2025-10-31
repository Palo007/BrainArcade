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
        <div className="absolute left-20 top-40 w-1/3 max-w-xl">
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
            CREDITS
          </h2>

          {/* Credits Text */}
          <div className="text-[10px] sm:text-xs leading-relaxed text-white opacity-90 space-y-3 pr-6"
               style={{ fontFamily: "'Press Start 2P', cursive" }}>
            <p>
              Made by 
              <a
                href="https:/itayinbar.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--nes-yellow)] underline hover:opacity-90 ml-2"
                title="Open Itay Inbar on GitHub"
              >
                Itay Inbar
              </a>.
            </p>
            <p>
              Brain data powered by <span className="text-[var(--nes-blue)]">Muse</span> by
              {' '}<span className="text-[var(--nes-green)]">Interaxon</span>.
            </p>
            <p className="opacity-80">
              A collaborative, open‑source effort by builders -
              showcasing that usable neurotechnology already exists today.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
