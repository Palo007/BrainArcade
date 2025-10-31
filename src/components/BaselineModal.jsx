import React from 'react';
import { RetroModal } from './RetroModal.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import '../styles/retro.css';

export function BaselineModal({ title = 'BASELINE REQUIRED' }) {
  const {
    visible,
    hide,
    inProgress,
    secondsRequested,
    secondsElapsed,
    start,
    isBaselineReady,
  } = useBaseline();

  if (!visible || isBaselineReady) return null;

  const remaining = Math.max(0, secondsRequested - secondsElapsed);
  const pct = Math.max(0, Math.min(100, Math.floor((secondsElapsed / secondsRequested) * 100)));

  return (
    <RetroModal
      title={title}
      onCancel={inProgress ? undefined : hide}
      onConfirm={inProgress ? undefined : () => start(secondsRequested)}
      confirmLabel={inProgress ? undefined : 'START'}
      showFooter={!inProgress}
    >
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        <p className="text-[10px] text-[var(--nes-yellow)] mb-3">This game needs a resting baseline.</p>
        <p className="text-[10px] mb-4">Duration: {secondsRequested}s</p>
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

