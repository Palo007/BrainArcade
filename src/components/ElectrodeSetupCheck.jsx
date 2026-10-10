import React, { useEffect, useMemo, useState } from 'react';
import { useQuality, CHANNEL_INFO } from '../contexts/QualityContext.jsx';
import '../styles/retro.css';

export function ElectrodeSetupCheck({ onReady, showValues = true }) {
  const { channelRms, perChannelBad, adjusting, ready } = useQuality();
  const [shownReady, setShownReady] = useState(false);

  useEffect(() => {
    if (ready && !shownReady) {
      setShownReady(true);
      if (onReady) onReady();
    }
  }, [ready, shownReady, onReady]);

  const issues = useMemo(() => {
    const out = [];
    perChannelBad.forEach((bad, idx) => {
      if (bad) {
        const info = CHANNEL_INFO[idx];
        const part = `${info.side} ${info.area}`;
        out.push(`${part} isn't put well.`);
      }
    });
    return out;
  }, [perChannelBad]);

  return (
    <div className="w-full max-w-lg min-w-[22rem] phone-port:min-w-0 border-4 border-white bg-[var(--nes-dark)] p-4 text-white" style={{ fontFamily: "'Press Start 2P', cursive" }}>
      <h4 className="text-[var(--nes-yellow)] text-xs mb-3">ELECTRODE CHECK</h4>
      {adjusting ? (
        <div className="text-[10px] flex items-center gap-2 mb-3">
          <span className="animate-pulse">▮▯▮</span>
          <span>evaluating setup...</span>
        </div>
      ) : (
        <p className="text-[10px] opacity-80 mb-2">Hold still. Ensure contacts on skin.</p>
      )}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          // Desired visual order:
          // Row 1: left forehead (AF7), right forehead (AF8)
          // Row 2: left ear (TP9), right ear (TP10)
          1, 2, 0, 3,
        ].map((idx) => {
          const info = CHANNEL_INFO[idx];
          // 1 s RMS in µV: steadier than the single latest sample, and 0 shows a flat (dead) channel
          const abs = Math.round(channelRms[idx] || 0);
          const bad = perChannelBad[idx];
          return (
            <div key={info.id} className={`flex items-center justify-between border px-2 py-1 text-[10px] ${bad ? 'border-[var(--nes-red)]' : 'border-[var(--nes-green)]'}`}>
              <span className={`${bad ? 'text-[var(--nes-red)]' : 'text-[var(--nes-green)]'}`}>{info.label}</span>
              {showValues ? (
                <span className="opacity-80 font-mono tabular-nums w-12 text-right">{abs}</span>
              ) : (
                <span className={`w-2 h-2 rounded-full ${bad ? 'bg-[var(--nes-red)]' : 'bg-[var(--nes-green)]'}`}></span>
              )}
            </div>
          );
        })}
      </div>
      {issues.length > 0 ? (
        <ul className="text-[10px] text-[var(--nes-red)] list-disc ml-4">
          {issues.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      ) : (
        <div className="text-[10px] text-[var(--nes-green)]">Clean to go after 5s of stability.</div>
      )}
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
