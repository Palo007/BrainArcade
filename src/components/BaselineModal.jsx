import React from 'react';
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
  } = useBaseline();
  const { ready } = useQuality();
  const navigate = useNavigate();

  if (!visible || isBaselineReady) return null;

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
      onConfirm={inProgress ? undefined : (ready ? () => start(secondsRequested) : undefined)}
      confirmLabel={inProgress ? undefined : (ready ? 'START' : 'waiting...')}
      confirmVisible={!inProgress}
      confirmDisabled={!inProgress && !ready}
      showFooter={true}
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
        <p className="text-[10px] text-[var(--nes-yellow)] mb-2">This game needs a resting baseline.</p>
        <p className="text-[10px] mb-3">Focus on the cross, stay still and relaxed.</p>
        <p className="text-[10px] mb-3">Duration: {secondsRequested}s</p>
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
