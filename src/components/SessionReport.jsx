/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Reusable end-of-session screen: Focus Score, stars, three bars, insight.
import React, { useState } from 'react';
import { updateSession } from '../lib/sessionStore.js';
import { ParentReport } from './ParentReport.jsx';
import '../styles/retro.css';

const FONT = { fontFamily: "'Press Start 2P', cursive" };

const FEELINGS = ['😣', '😕', '😐', '🙂', '😄'];
const GOAL_LINE = 0.62;

// Inline SVG of v over time; goal line dashed, above-goal area tinted.
function ActivityGraph({ samples }) {
  const pts = (samples || []).filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.v));
  if (pts.length < 2) return null;
  const W = 300;
  const H = 90;
  const tMax = Math.max(pts[pts.length - 1].t, 1);
  const X = (t) => (t / tMax) * W;
  const Y = (v) => H - Math.max(0, Math.min(1, v)) * H;
  const gy = Y(GOAL_LINE);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  // Polygons between the curve and the goal line, only where the curve is above the goal.
  const above = pts.reduce((acc, p, i) => {
    const prev = pts[i - 1];
    const on = p.v >= GOAL_LINE;
    const x = X(p.t).toFixed(1);
    const yy = Y(p.v).toFixed(1);
    if (on) {
      if (prev && prev.v < GOAL_LINE) {
        const f = (GOAL_LINE - prev.v) / (p.v - prev.v);
        acc.cur.push([X(prev.t + (p.t - prev.t) * f), gy]);
      }
      if (!acc.cur.length) acc.cur.push([X(p.t), gy]);
      acc.cur.push([Number(x), Number(yy)]);
    } else if (acc.cur.length) {
      const f = (GOAL_LINE - prev.v) / (p.v - prev.v);
      acc.cur.push([X(prev.t + (p.t - prev.t) * f), gy]);
      acc.done.push(acc.cur);
      acc.cur = [];
    }
    return acc;
  }, { cur: [], done: [] });
  if (above.cur.length) {
    above.cur.push([above.cur[above.cur.length - 1][0], gy]);
    above.done.push(above.cur);
  }
  const polys = above.done.map((poly) => poly.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' '));
  return (
    <div className="my-4">
      <p className="text-xs text-gray-300 mb-1 text-left">ACTIVITY</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24 border-2 border-white/70 bg-black/50" preserveAspectRatio="none" role="img" aria-label="Activity over time">
        {polys.map((pp, i) => (
          <polygon key={i} points={pp} fill="rgba(255,216,74,0.30)" />
        ))}
        <line x1="0" x2={W} y1={gy} y2={gy} stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeDasharray="4 3" />
        <path d={line} fill="none" stroke="#5ee0ff" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

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

export function SessionReport({ metrics, points = 0, bestScore = 0, isNewBest = false, onPlayAgain, onExit, samples, sessionId = null, insufficient = false }) {
  const m = metrics || {};
  const stars = m.stars || 0;
  const flowSec = Math.round(m.flowSec || 0);
  const [feeling, setFeeling] = useState(0);
  const [saved, setSaved] = useState(false);
  const pick = (n) => {
    setFeeling(n);
    setSaved(updateSession(sessionId, { feeling: n }));
  };
  const shell = 'border-4 border-[var(--nes-yellow)] bg-black/80 px-6 py-5 text-center text-white w-full max-w-xl max-h-full overflow-y-auto';
  if (insufficient) {
    return (
      <div className={shell} style={FONT}>
        <p className="text-sm text-[var(--nes-yellow)] mb-4">NOT ENOUGH SIGNAL</p>
        <p className="text-[10px] leading-relaxed mb-5 text-gray-100">Not enough signal — check the headband and try again.</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={onPlayAgain}
            className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black"
          >
            PLAY AGAIN
          </button>
          {onExit && (
            <button type="button" onClick={onExit} className="border-4 border-white/70 px-4 py-3 text-xs text-white hover:bg-white hover:text-black">
              EXIT
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={shell} style={FONT}>
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

      <ActivityGraph samples={samples} />

      <div className="mb-5">
        <p className="text-xs text-gray-300 mb-2">HOW DID YOU FEEL?</p>
        <div className="flex gap-2 justify-center">
          {FEELINGS.map((e, i) => (
            <button
              key={e}
              type="button"
              onClick={() => pick(i + 1)}
              aria-label={`Feeling ${i + 1} of 5`}
              aria-pressed={feeling === i + 1}
              className={`border-4 px-2 py-1 text-xl ${feeling === i + 1 ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)]/20' : 'border-white/60'}`}
            >
              {e}
            </button>
          ))}
        </div>
        {saved && <p className="text-[9px] text-[var(--nes-green)] mt-2">Saved</p>}
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

      <div className="mt-5">
        <ParentReport sessionId={sessionId} seconds={samples?.length ? samples[samples.length - 1].t : 0} />
      </div>
    </div>
  );
}
