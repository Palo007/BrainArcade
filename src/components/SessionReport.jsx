/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Reusable end-of-session screen: Focus Score, stars, three bars, insight.
import React from 'react';
import '../styles/retro.css';

const FONT = { fontFamily: "'Press Start 2P', cursive" };

function Bar({ label, value, note, color }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className="text-left">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color }}>{label}</span>
        <span>{pct}</span>
      </div>
      <div className="h-4 border-2 border-white/70 bg-black/50">
        <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[9px] text-gray-300 mt-1 leading-relaxed">{note}</p>
    </div>
  );
}

export function SessionReport({ metrics, points = 0, bestScore = 0, isNewBest = false, onPlayAgain, onExit }) {
  const m = metrics || {};
  const stars = m.stars || 0;
  const flowSec = Math.round(m.flowSec || 0);
  return (
    <div
      className="border-4 border-[var(--nes-yellow)] bg-black/80 px-6 py-5 text-center text-white w-full max-w-xl max-h-full overflow-y-auto"
      style={FONT}
    >
      <p className="text-xs text-gray-300 mb-1">FOCUS SCORE</p>
      <p className="text-6xl text-[var(--nes-yellow)] leading-none mb-2">{Math.round(m.score || 0)}</p>
      <p className="text-3xl mb-1 text-[var(--nes-yellow)]" aria-label={`${stars} of 3 stars`}>
        {'★'.repeat(stars)}
        <span className="text-gray-600">{'★'.repeat(3 - stars)}</span>
      </p>
      {isNewBest && <p className="text-xs text-[var(--nes-green)] mb-2">NEW BEST!</p>}

      <div className="space-y-4 my-4">
        <Bar label="ENERGY" value={m.energy || 0} color="#ffd84a" note="How high your focus was on average" />
        <Bar label="INCREASE" value={m.increase || 0} color="#5ee0ff" note="How fast you got focus back after a drop" />
        <Bar label="FLOW" value={m.flow || 0} color="#7dff7d" note={`Your longest time with the ball up: ${flowSec} s`} />
      </div>

      <div className="flex justify-around text-xs mb-4">
        <div>
          <p className="text-gray-300 text-[9px] mb-1">BALL UP</p>
          <p className="text-[var(--nes-yellow)]">{Math.round(m.timeAbovePct || 0)}%</p>
        </div>
        <div>
          <p className="text-gray-300 text-[9px] mb-1">POINTS</p>
          <p className="text-[var(--nes-yellow)]">{Math.round(points)}</p>
        </div>
        <div>
          <p className="text-gray-300 text-[9px] mb-1">BEST</p>
          <p className="text-[var(--nes-yellow)]">{Math.round(bestScore)}</p>
        </div>
      </div>

      {m.insight && <p className="text-[10px] leading-relaxed mb-5 text-gray-100">{m.insight}</p>}

      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={onPlayAgain}
          className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black"
        >
          PLAY AGAIN
        </button>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="border-4 border-white/70 px-4 py-3 text-xs text-white hover:bg-white hover:text-black"
          >
            EXIT
          </button>
        )}
      </div>
    </div>
  );
}
