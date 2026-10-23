import { Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n.js';
import '../styles/retro.css';
import background from '../assets/background.JPG';

// Fills {name} markers of a translated text with React nodes (links, colored spans)
function fill(text, nodes) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return <Fragment key={i}>{m && nodes[m[1]] !== undefined ? nodes[m[1]] : part}</Fragment>;
  });
}

const LINK = 'text-[var(--nes-yellow)] underline';
const REPO = 'https://github.com/itayinbarr/brain-arcade';

export function Credits() {
  const navigate = useNavigate();
  const t = useT();

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
        <div className="absolute left-20 top-20 w-2/5 max-w-2xl short-land:left-4 short-land:top-3 short-land:bottom-3 short-land:max-w-none short-land:w-3/5 short-land:overflow-y-auto phone-port:left-4 phone-port:right-4 phone-port:top-4 phone-port:bottom-4 phone-port:w-auto phone-port:max-w-none phone-port:overflow-y-auto">
          {/* Back Button */}
          <div className="mb-4 short-land:mb-2">
            <button
              onClick={() => navigate(-1)}
              className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 short-land:py-1 short-land:text-[10px] hover:bg-[var(--nes-blue)] hover:text-black"
              style={{ fontFamily: 'var(--font-retro)' }}
              aria-label={t('core.credits.back')}
            >
              {t('core.credits.backBtn')}
            </button>
          </div>

          {/* Title */}
          <h2
            className="text-2xl sm:text-3xl short-land:text-base rgb-text text-white mb-4 short-land:mb-2"
            style={{ fontFamily: 'var(--font-retro)' }}
          >
            {t('core.credits.about')}
          </h2>

      {/* About Text */}
      <div
        className="text-[10px] sm:text-xs leading-relaxed text-white opacity-90 space-y-3 pr-10"
        style={{ fontFamily: 'var(--font-retro)' }}
      >
            {/* Original credits content remains */}
            <p>
              {t('core.credits.madeBy')}
              <a
                href="https://itayinbar.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--nes-yellow)] underline hover:opacity-90 ml-2"
                title={t('core.credits.authorSite')}
              >
                Itay Inbar
              </a>.
            </p>
            <p>
              {fill(t('core.credits.signals'), {
                muse: <span className="text-[var(--nes-blue)]">Muse</span>,
                interaxon: <span className="text-[var(--nes-green)]">Interaxon</span>,
              })}
            </p>
            <p className="opacity-80">
              {t('core.credits.effort')}
            </p>

            {/* Why Muse section */}
            <div className="mt-6 pt-4 border-t-4 border-[var(--nes-gray)] border-opacity-40">
              <h3 className="text-sm sm:text-base text-white mb-3 rgb-text" style={{ fontFamily: 'var(--font-retro)' }}>
                {t('core.credits.whyTitle')}
              </h3>
              <p className="text-[10px] sm:text-xs">
                {t('core.credits.whyText')}
              </p>
            </div>
          </div>
          {/* License & Privacy */}
          <div className="mt-6 pt-4 border-t-4 border-[var(--nes-gray)] border-opacity-40">
            <h3 className="text-sm sm:text-base text-white mb-3 rgb-text" style={{ fontFamily: 'var(--font-retro)' }}>
              {t('core.credits.licenseTitle')}
            </h3>
            <p className="text-[10px] sm:text-xs">
              {fill(t('core.credits.license'), {
                privacy: <a href={`${REPO}/blob/main/PRIVACY.md`} target="_blank" rel="noopener noreferrer" className={LINK}>{t('core.credits.linkPrivacy')}</a>,
                license: <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer" className={LINK}>{t('core.credits.linkLicense')}</a>,
                games: <a href={`${REPO}/blob/main/LICENSE.games`} target="_blank" rel="noopener noreferrer" className={LINK}>{t('core.credits.linkGames')}</a>,
                repo: <a href={REPO} target="_blank" rel="noopener noreferrer" className={LINK}>{t('core.credits.linkRepo')}</a>,
              })}
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
