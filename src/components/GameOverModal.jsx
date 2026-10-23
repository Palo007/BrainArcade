import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal';
import { useT, locale } from '../lib/i18n.js';

/**
 * Game Over modal component with retry and menu options
 *
 * @param {Object} props
 * @param {number} props.finalScore - The final score achieved
 * @param {Function} props.onRetry - Custom retry handler (default: reload window)
 * @param {boolean} props.showScore - Whether to display the score (default: true)
 */
export function GameOverModal({ finalScore = 0, onRetry, showScore = true }) {
  const navigate = useNavigate();
  const t = useT();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default behavior: reload the page to restart the game
      window.location.reload();
    }
  };

  const handleMenu = () => {
    navigate('/games');
  };

  return (
    <RetroModal
      title={t('core.over.title')}
      confirmLabel={t('core.over.chooseGame')}
      cancelLabel={t('core.over.retry')}
      onConfirm={handleMenu}
      onCancel={handleRetry}
      confirmVisible={true}
    >
      <div className="text-center">
        {showScore && (
          <>
            <div className="text-[var(--nes-gray)] mb-2">{t('core.over.finalScore')}</div>
            <div
              className="text-4xl text-[var(--nes-yellow)] mb-4"
              style={{ fontFamily: 'var(--font-retro)' }}
            >
              {finalScore.toLocaleString(locale())}
            </div>
          </>
        )}
        <p className="text-xs text-gray-300 leading-relaxed">
          {t('core.over.practice')}
        </p>
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
