import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { useQuality } from '../contexts/QualityContext.jsx';
import { ElectrodeSetupCheck } from './ElectrodeSetupCheck.jsx';
import '../styles/retro.css';

export function BaselineModal({ title = 'BASELINE REQUIRED' }) {
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
  } = useBaseline();
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
        style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60, width: 'min(420px, calc(100vw - 24px))', maxWidth: 420, cursor: 'pointer', fontFamily: "'Press Start 2P', cursive" }}
        className="bg-black border-2 border-[var(--nes-yellow)] p-3 text-[9px] leading-relaxed"
      >
        {calibration.fitWarning
          ? 'Check headband fit: your alpha waves barely changed when you opened your eyes. Make sure the sensors touch your skin.'
          : 'No clear alpha peak found, so standard 8-13 Hz bands are used.'}
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
      title={title}
      onCancel={inProgress ? cancel : handleCancel}
      onConfirm={inProgress ? undefined : (ready ? () => start(secondsRequested, { mode: 'full' }) : undefined)}
      confirmLabel={inProgress ? undefined : (ready ? 'START' : 'waiting...')}
      confirmVisible={!inProgress}
      confirmDisabled={!inProgress && !ready}
      showFooter={true}
      leftActions={!inProgress && ready && savedCalibration ? (
        <button type="button" className="nes-btn" onClick={() => start(secondsRequested, { mode: 'quick' })}>
          QUICK ({secondsRequested}s)
        </button>
      ) : null}
    >
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        {/* Fixation cross area */}
        <div className="flex items-center justify-center mb-4">
          <div className="relative w-40 h-40">
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[var(--nes-gray)]" style={{ transform: 'translateX(-50%)' }} />
            <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[var(--nes-gray)]" style={{ transform: 'translateY(-50%)' }} />
          </div>
        </div>

        {/* Instructions and status below the cross */}
        {eyesClosed ? (
          <>
            <p className="text-[12px] text-[var(--nes-yellow)] mb-2">Step 1 of 2: close your eyes</p>
            <p className="text-[10px] mb-3">Close your eyes like a sleeping bunny and stay very still. zZz... A soft chime will tell you when to wake up.</p>
          </>
        ) : eyesOpen ? (
          <>
            <p className="text-[12px] text-[var(--nes-green)] mb-2">Step 2 of 2: open your eyes</p>
            <p className="text-[10px] mb-3">Wake up, little bunny! Look at the cross and stay still.</p>
          </>
        ) : (
          <>
            <p className="text-[10px] text-[var(--nes-yellow)] mb-2">This game needs a resting baseline.</p>
            {!inProgress && twoPhase && (
              <p className="text-[10px] mb-3">First close your eyes like a sleeping bunny for {secondsRequested}s, then open them and look at the cross for {secondsRequested}s. A soft chime tells you when to open.</p>
            )}
            {!inProgress && !twoPhase && <p className="text-[10px] mb-3">Focus on the cross, stay still and relaxed.</p>}
            {!inProgress && savedCalibration && (
              <p className="text-[10px] mb-3 opacity-80">Quick mode keeps your last alpha peak ({savedCalibration.paf.toFixed(1)} Hz) and only needs the eyes-open part.</p>
            )}
          </>
        )}
        <p className="text-[10px] mb-3">Duration: {secondsRequested}s per step</p>
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
          <div className="mt-3 text-[10px] opacity-80">Remain: {remaining}s • Stay relaxed and still</div>
        )}
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
