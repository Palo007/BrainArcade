/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Shared END screen actions: PLAY AGAIN (back to the START screen), CHOOSE GAME, parent report.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ParentReport } from './ParentReport.jsx';
import '../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };

export function GameEndActions({ onPlayAgain, sessionId = null, game = null, seconds = 0 }) {
  const navigate = useNavigate();
  return (
    <div style={FONT}>
      <div className="flex gap-3 justify-center flex-wrap">
        <button
          type="button"
          onClick={onPlayAgain}
          className="border-4 border-[var(--nes-green)] px-4 py-3 text-xs text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black"
        >
          PLAY AGAIN
        </button>
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="border-4 border-white/70 px-4 py-3 text-xs text-white hover:bg-white hover:text-black"
        >
          CHOOSE GAME
        </button>
      </div>
      <div className="mt-4">
        <ParentReport sessionId={sessionId} game={game} seconds={seconds} />
      </div>
    </div>
  );
}
