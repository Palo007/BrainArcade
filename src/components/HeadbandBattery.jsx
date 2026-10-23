/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Headband charge chip for the game menu. Shown only while a headband is connected and has sent a level.
// Sources: Athena adapter and phone relay keep {values:[pct]} in _battery; the classic Muse keeps batteryLevel.
import React, { useEffect, useState } from 'react';
import { useEEG } from '../contexts/MuseContext.jsx';

const POLL_MS = 5000;

function readHeadbandBattery(muse) {
  const raw = muse?._battery?.values?.[0] ?? muse?.batteryLevel;
  const v = raw == null ? NaN : Number(raw); // Number(null) would be 0 %
  return Number.isFinite(v) && v >= 0 ? Math.min(100, Math.round(v)) : null;
}

function useHeadbandBattery() {
  const { muse, isConnected, isMock } = useEEG() || {};
  const [pct, setPct] = useState(null);
  useEffect(() => {
    if (!muse || !isConnected || isMock) { setPct(null); return undefined; }
    const tick = () => setPct(readHeadbandBattery(muse));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [muse, isConnected, isMock]);
  return pct;
}

export function HeadbandBattery({ className = '' }) {
  const pct = useHeadbandBattery();
  if (pct == null) return null;
  const color = pct <= 15 ? 'var(--nes-red)' : pct <= 30 ? 'var(--nes-yellow)' : 'var(--nes-green)';
  return (
    <span
      role="status"
      title={`Headband battery ${pct}%`}
      aria-label={`Headband battery ${pct} percent`}
      style={{ fontFamily: 'var(--font-retro)', borderColor: color, color }}
      className={`inline-flex items-center gap-1 border-2 px-2 min-h-[36px] text-[10px] bg-black/40 whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">🔋</span>
      {pct}%
    </span>
  );
}
