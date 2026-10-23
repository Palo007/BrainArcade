import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { SKIP_SECONDS } from '../lib/calibrationPrefs.js';
import { useQuality } from '../contexts/QualityContext.jsx';
import { ElectrodeSetupCheck } from './ElectrodeSetupCheck.jsx';
import { useT } from '../lib/i18n.js';
import '../styles/retro.css';

export function BaselineModal({ title } = {}) {
  const {
    visible,
    hide,
    inProgress,
    secondsRequested,
    secondsElapsed,
    start,
    cancel,
    isBaselineReady,
    phase,
    phaseCount,
    calibration,
    savedCalibration,
    autoSkip,
    setAutoSkip,
    skipping,
    baselineError,
  } = useBaseline();
  const t = useT();
  const [noteOpen, setNoteOpen] = useState(false);
  const calKey = calibration ? `${calibration.paf}|${calibration.reactivity}` : '';
  // Short note after calibration: poor headband fit (low reactivity) or no clear alpha peak
  useEffect(() => {
    if (!calibration || calibration.quick || !(calibration.fitWarning || !calibration.found)) { setNoteOpen(false); return undefined; }
    setNoteOpen(true);
    const t = setTimeout(() => setNoteOpen(false), 15000);
    return () => clearTimeout(t);
  }, [calKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ready } = useQuality();
  const navigate = useNavigate();

  if (isBaselineReady && noteOpen && calibration) {
    return (
      <div
        role="status"
        onClick={() => setNoteOpen(false)}
        style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 'min(420px, calc(100vw - 24px))', maxWidth: 420, cursor: 'pointer', fontFamily: 'var(--font-retro)' }}
        className="bg-black border-2 border-[var(--nes-yellow)] p-3 text-[9px] leading-relaxed"
      >
        {calibration.fitWarning ? t('core.base.fitWarning') : t('core.base.noPeak')}
      </div>
    );
  }
  if (!visible || isBaselineReady) return null;
  const twoPhase = phaseCount === 2;
  const eyesClosed = inProgress && phase === 'closed';
  const eyesOpen = inProgress && phase === 'open' && twoPhase;

  const remaining = Math.max(0, secondsRequested - secondsElapsed);
  const pct = Math.max(0, Math.min(100, Math.floor((secondsElapsed / Math.max(1, secondsRequested)) * 100)));

  const handleCancel = () => {
    // Only allowed before recording starts
    hide();
    navigate('/games', { replace: true });
  };

  return (
    <RetroModal
      title={title ?? t('core.base.title')}
      onCancel={inProgress ? cancel : handleCancel}
      onConfirm={inProgress ? undefined : (ready ? () => start(secondsRequested, { mode: 'full' }) : undefined)}
      confirmLabel={inProgress ? undefined : (ready ? t('core.base.start') : t('core.base.waiting'))}
      confirmVisible={!inProgress}
      confirmDisabled={!inProgress && !ready}
      showFooter={true}
      leftActions={!inProgress && ready && savedCalibration ? (
        <button type="button" className="nes-btn" onClick={() => start(secondsRequested, { mode: 'quick' })}>
          {t('core.base.quick', { s: secondsRequested })}
        </button>
      ) : null}
    >
      <div style={{ fontFamily: 'var(--font-retro)' }}>
        {/* Fixation cross area */}
        <div className="flex items-center justify-center mb-4">
          <div className="relative w-40 h-40">
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[var(--nes-gray)]" style={{ transform: 'translateX(-50%)' }} />
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[var(--nes-gray)]" style={{ transform: 'translateY(-50%)' }} />
          </div>
        </div>

        {/* Instructions and status below the cross */}
        {skipping ? (
          <>
            <p className="text-[12px] text-[var(--nes-yellow)] mb-2">{t('core.base.skipping')}</p>
            <p className="text-[10px] mb-3">
              {savedCalibration
                ? t('core.base.skipSaved', { paf: savedCalibration.paf.toFixed(1) })
                : t('core.base.skipNone')}
            </p>
          </>
        ) : eyesClosed ? (
          <>
            <p className="text-[12px] text-[var(--nes-yellow)] mb-2">{t('core.base.step1')}</p>
            <p className="text-[10px] mb-3">{t('core.base.step1Text')}</p>
          </>
        ) : eyesOpen ? (
          <>
            <p className="text-[12px] text-[var(--nes-green)] mb-2">{t('core.base.step2')}</p>
            <p className="text-[10px] mb-3">{t('core.base.step2Text')}</p>
          </>
        ) : (
          <>
            <p className="text-[10px] text-[var(--nes-yellow)] mb-2">{t('core.base.need')}</p>
            {!inProgress && twoPhase && (
              <p className="text-[10px] mb-3">{t('core.base.twoPhase', { s: secondsRequested })}</p>
            )}
            {!inProgress && !twoPhase && <p className="text-[10px] mb-3">{t('core.base.onePhase')}</p>}
            {!inProgress && savedCalibration && (
              <p className="text-[10px] mb-3 opacity-80">{t('core.base.quickNote', { paf: savedCalibration.paf.toFixed(1) })}</p>
            )}
          </>
        )}
        {baselineError && !inProgress && (
          <p className="text-[10px] mb-3 text-[var(--nes-red)]" role="alert">{baselineError.startsWith('core.') ? t(baselineError) : baselineError}</p>
        )}
        {!skipping && <p className="text-[10px] mb-3">{t('core.base.duration', { s: secondsRequested })}</p>}
        {!inProgress && (
          <>
            <button type="button" className="nes-btn mb-2" onClick={() => start(SKIP_SECONDS, { mode: 'skip' })}>
              {t('core.base.skipBtn')}
            </button>
            <p className="text-[10px] mb-2 opacity-80">{t('core.base.skipNote')}</p>
            <label className="flex items-center gap-2 text-[10px] mb-3 cursor-pointer min-h-[40px]">
              <input type="checkbox" className="w-5 h-5" checked={autoSkip} onChange={(e) => setAutoSkip(e.target.checked)} />
              {t('core.base.autoSkip')}
            </label>
          </>
        )}
        {!inProgress && (
          <div className="mb-3">
            <ElectrodeSetupCheck showValues={false} />
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full bg-black border border-[var(--nes-gray)] h-4 relative">
          <div
            className="bg-[var(--nes-green)] h-full transition-all"
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 text-center text-[10px] leading-4">{pct}%</div>
        </div>
        {inProgress && (
          <div className="mt-3 text-[10px] opacity-80">{t('core.base.remain', { s: remaining })}</div>
        )}
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
