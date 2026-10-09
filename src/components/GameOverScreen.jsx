import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { ElectrodeSetupCheck } from './ElectrodeSetupCheck.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { useJoystick } from '../contexts/JoystickContext.jsx';
import { recordSession, isDemoMode } from '../lib/sessionStore.js';
import '../styles/retro.css';

/**
 * Modular Game Over Screen with quality checks and adaptive adjustments
 *
 * Features:
 * - Shows final score and highscore (stored per game)
 * - Electrode quality check before retry
 * - Monitors joystick values during readiness period
 * - Adjusts baseline if user is consistently below threshold
 * - Reusable across all games
 *
 * @param {Object} props
 * @param {number} props.finalScore - The final score achieved
 * @param {string} props.gameName - Unique game identifier for highscore storage
 * @param {string} props.joystickAxis - The joystick axis to monitor (e.g., 'focus')
 * @param {Object} props.joystickOptions - Options for joystick (range, baselineCenter, etc.)
 * @param {Function} props.onRetry - Called when user retries after passing checks
 * @param {number} props.readinessDuration - Duration of readiness check in seconds (default: 5)
 * @param {number} props.lowThreshold - Joystick threshold to trigger adjustment (default: 0.1)
 */
export function GameOverScreen({
  finalScore = 0,
  gameName = 'default',
  joystickAxis = 'focus',
  joystickOptions = {},
  onRetry,
  readinessDuration = 5,
  lowThreshold = 0.1,
  playedSec,
  outcome,
}) {
  const navigate = useNavigate();
  const { ready: qualityReady, quality10s } = useQuality();
  const { resetBaseline, ensureBaseline } = useBaseline();
  const { value01 } = useJoystick(joystickAxis, joystickOptions);

  // Readiness check state
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readinessElapsed, setReadinessElapsed] = useState(0);
  const [needsRecalibration, setNeedsRecalibration] = useState(false);

  // Track joystick values during readiness check
  const joystickSamplesRef = useRef([]);
  const readinessStartRef = useRef(null);

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
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const secs = Number.isFinite(playedSec) && playedSec > 0 ? Math.round(playedSec) : undefined;
    const id = recordSession(gameName, {
      score: Math.round(finalScore),
      qualityPct: quality10s ? Math.round(quality10s.stablePct * 100) : undefined,
      durationSec: secs,
      playedSec: secs,
      outcome: outcome || undefined,
    });
    if (!id && !isDemoMode()) setSaveFailed(true);
  }, [gameName, finalScore, quality10s, playedSec, outcome]);

  // Monitor joystick values during readiness check
  useEffect(() => {
    if (!checkingReadiness) return;

    // Sample joystick value
    joystickSamplesRef.current.push(value01);

    // Keep only recent samples (last 2 seconds worth, ~20 samples)
    if (joystickSamplesRef.current.length > 20) {
      joystickSamplesRef.current.shift();
    }
  }, [value01, checkingReadiness]);

  // Readiness timer
  useEffect(() => {
    if (!checkingReadiness) return;

    const startTime = Date.now();
    readinessStartRef.current = startTime;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setReadinessElapsed(elapsed);

      if (elapsed >= readinessDuration) {
        clearInterval(timer);

        // Analyze joystick samples
        const samples = joystickSamplesRef.current;
        if (samples.length > 0) {
          const avgValue = samples.reduce((sum, val) => sum + val, 0) / samples.length;
          const belowThresholdRatio = samples.filter(v => v < lowThreshold).length / samples.length;

          // If majority of samples are below threshold, suggest recalibration
          if (belowThresholdRatio > 0.7 || avgValue < lowThreshold) {
            setNeedsRecalibration(true);
          }
        }
      }
    }, 100);

    return () => clearInterval(timer);
  }, [checkingReadiness, readinessDuration, lowThreshold]);

  const handleStartReadinessCheck = () => {
    joystickSamplesRef.current = [];
    setReadinessElapsed(0);
    setNeedsRecalibration(false);
    setCheckingReadiness(true);
  };

  const handleRecalibrate = async () => {
    // Reset baseline to trigger recalibration
    resetBaseline();
    setCheckingReadiness(false);
    setNeedsRecalibration(false);

    // Trigger baseline collection - this will show the baseline modal
    await ensureBaseline({ seconds: 30 });

    // After baseline completes, automatically retry the game
    handleRetry();
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  const handleMenu = () => {
    navigate('/games');
  };

  // Readiness check is complete when time has elapsed and quality is good
  const readinessComplete = readinessElapsed >= readinessDuration && qualityReady;
  const readinessProgress = Math.min(100, Math.floor((readinessElapsed / readinessDuration) * 100));

  // Axis-aware wording
  const axisAdjective = (() => {
    switch (joystickAxis) {
      case 'relaxation':
        return 'calm';
      case 'focus':
      case 'focused-attention':
        return 'focused';
      default:
        return 'steady';
    }
  })();
  const lowAxisLabel = (() => {
    switch (joystickAxis) {
      case 'relaxation':
        return 'Low relaxation detected';
      case 'focus':
      case 'focused-attention':
        return 'Low focus detected';
      default:
        return 'Low readiness detected';
    }
  })();

  // Determine button state
  let confirmLabel = 'RETRY';
  let confirmDisabled = false;
  let onConfirm = handleRetry;

  if (needsRecalibration) {
    confirmLabel = 'RECALIBRATE';
    confirmDisabled = false;
    onConfirm = handleRecalibrate;
  } else if (checkingReadiness) {
    if (!readinessComplete) {
      confirmLabel = 'waiting...';
      confirmDisabled = true;
    } else {
      confirmLabel = 'RETRY';
      confirmDisabled = false;
      onConfirm = handleRetry;
    }
  } else {
    confirmLabel = 'CHECK READINESS';
    confirmDisabled = false;
    onConfirm = handleStartReadinessCheck;
  }

  return (
    <RetroModal
      title="GAME OVER"
      confirmLabel={confirmLabel}
      cancelLabel="CHOOSE GAME"
      onConfirm={onConfirm}
      onCancel={handleMenu}
      confirmVisible={true}
      confirmDisabled={confirmDisabled}
    >
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        {/* Score display */}
        <div className="text-center mb-4">
          <div className="text-[var(--nes-gray)] mb-2 text-[8px]">FINAL SCORE</div>
          <div className="text-4xl text-[var(--nes-yellow)] mb-2">
            {finalScore.toLocaleString()}
          </div>

          {isNewHighscore && (
            <div className="text-[var(--nes-green)] text-[8px] mb-2">NEW HIGHSCORE!</div>
          )}

          <div className="text-[var(--nes-gray)] mb-1 text-[8px]">HIGHSCORE</div>
          <div className="text-xl text-white">
            {Math.max(finalScore, currentHighscore).toLocaleString()}
          </div>
        </div>

        {isDemoMode() && (
          <div className="text-center text-[8px] opacity-70 mb-3">Demo mode — not saved</div>
        )}
        {saveFailed && (
          <div className="text-center text-[8px] text-red-400 mb-3">History full — not saved</div>
        )}

        {/* Readiness check UI */}
        {checkingReadiness && (
          <div className="mb-4">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">Checking readiness...</div>

            {/* Electrode quality check */}
            <div className="mb-3">
              <ElectrodeSetupCheck showValues={false} />
            </div>

            {/* Progress bar */}
            <div className="w-full bg-black border border-[var(--nes-gray)] h-4 relative mb-2">
              <div
                className="bg-[var(--nes-green)] h-full transition-all"
                style={{ width: `${readinessProgress}%` }}
              />
              <div className="absolute inset-0 text-center text-[10px] leading-4">
                {readinessProgress}%
              </div>
            </div>

            <div className="text-[8px] opacity-80">
              {readinessElapsed < readinessDuration
                ? `${readinessDuration - readinessElapsed}s remaining • Stay ${axisAdjective} and still`
                : qualityReady
                  ? 'Ready to play!'
                  : 'Adjust electrodes for better signal'
              }
            </div>
          </div>
        )}

        {/* Recalibration message */}
        {needsRecalibration && (
          <div className="mb-4 p-3 border border-[var(--nes-yellow)] bg-black/40">
            <div className="text-[10px] text-[var(--nes-yellow)] mb-2">{lowAxisLabel}</div>
            <div className="text-[8px] text-gray-300 leading-relaxed">
              Your baseline may have shifted. Recalibrate for better experience.
            </div>
          </div>
        )}

        {/* Instructions when not checking */}
        {!checkingReadiness && !needsRecalibration && (
          <div className="text-center">
            <p className="text-[8px] text-gray-300 leading-relaxed mb-3">
              Before retrying, let's ensure your electrodes are properly connected.
            </p>
            <div className="text-[10px] text-[var(--nes-cyan)]">
              Click "CHECK READINESS" to begin
            </div>
          </div>
        )}
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
