import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { recordSession, isDemoMode } from '../lib/sessionStore.js';
import { takePausedSec } from '../hooks/useSignalPause.js';
import { GameEndActions } from './GameEndActions.jsx';
import { useT, locale } from '../lib/i18n.js';
import '../styles/retro.css';

/**
 * Shared Game Over screen: final score, highscore (stored per game), session save,
 * and the common end actions (PLAY AGAIN returns to the game's START screen).
 */
export function GameOverScreen({
  finalScore = 0,
  gameName = 'default',
  onRetry,
  playedSec,
  outcome,
  customMessage,
}) {
  const navigate = useNavigate();
  const t = useT();
  const { quality10s } = useQuality();

  // Highscore management
  const highscoreKey = `highscore_${gameName}`;
  const currentHighscore = parseInt(localStorage.getItem(highscoreKey) || '0', 10);
  const isNewHighscore = finalScore > currentHighscore;

  // Save highscore if it's a new record
  useEffect(() => {
    if (isNewHighscore) {
      localStorage.setItem(highscoreKey, finalScore.toString());
    }
  }, [isNewHighscore, finalScore, highscoreKey]);

  // Session history: one summary row per game over (shared by every game using this screen)
  const recordedRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [poorSignal, setPoorSignal] = useState(false);
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const secs = Number.isFinite(playedSec) && playedSec > 0 ? Math.round(playedSec) : undefined;
    // Poor signal: the electrode-check pause covered most of the round (good share < 30%)
    const pausedSec = takePausedSec();
    const poor = secs ? pausedSec / secs > 0.7 : false;
    if (poor) setPoorSignal(true);
    const id = recordSession(gameName, {
      score: Math.round(finalScore),
      qualityPct: quality10s ? Math.round(quality10s.stablePct * 100) : undefined,
      durationSec: secs,
      playedSec: secs,
      outcome: outcome || undefined,
      ...(poor ? { valid: false, invalidReason: 'bad-quality' } : {}),
    });
    if (id) setSavedId(id);
    else if (!isDemoMode()) setSaveFailed(true);
  }, [gameName, finalScore, quality10s, playedSec, outcome]);

  const handleRetry = () => {
    if (onRetry) onRetry();
    else window.location.reload();
  };

  return (
    <RetroModal title={t('core.over.title')} showFooter={false} onCancel={() => navigate('/games')}>
      <div style={{ fontFamily: 'var(--font-retro)' }}>
        <div className="text-center mb-4">
          <div className="text-[var(--nes-gray)] mb-2 text-[8px]">{t('core.over.finalScore')}</div>
          <div className="text-4xl text-[var(--nes-yellow)] mb-2">
            {finalScore.toLocaleString(locale())}
          </div>
          {customMessage && <p className="text-[9px] text-gray-300 mb-2">{customMessage}</p>}

          {isNewHighscore && (
            <div className="text-[var(--nes-green)] text-[8px] mb-2">{t('core.over.newHigh')}</div>
          )}

          <div className="text-[var(--nes-gray)] mb-1 text-[8px]">{t('core.over.highscore')}</div>
          <div className="text-xl text-white">
            {Math.max(finalScore, currentHighscore).toLocaleString(locale())}
          </div>
        </div>

        {poorSignal && (
          <div className="text-center text-[8px] text-[var(--nes-yellow)] mb-3">
            {t('core.over.poorSignal')}
          </div>
        )}
        {isDemoMode() && (
          <div className="text-center text-[8px] opacity-70 mb-3">{t('core.over.demo')}</div>
        )}
        {saveFailed && (
          <div className="text-center text-[8px] text-red-400 mb-3">{t('core.over.historyFull')}</div>
        )}

        <GameEndActions onPlayAgain={handleRetry} sessionId={savedId} game={gameName} seconds={playedSec} />
      </div>
    </RetroModal>
  );
}
