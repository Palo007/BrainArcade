/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Plain-language summary for parents: session length, time in focus, comparison with the last 5
// sessions of the same child and game, personal alpha peak. No medical claims.
import React, { useMemo } from 'react';
import { loadSessions, sessionsForChild } from '../lib/sessionStore.js';
import { useProfiles } from '../contexts/ProfileContext.jsx';
import { loadCalibration } from '../lib/paf.js';
import { buildParentSummary } from '../lib/parentSummary.js';

// sessionId: this session's record id (null when unknown); game: optional game id to compare with.
export function ParentSummary({ sessionId, points, game = null }) {
  const { activeId } = useProfiles();
  const lines = useMemo(() => {
    const all = loadSessions();
    // Without an id the session is unknown ({}): never guess that the newest stored record is this one.
    const idx = sessionId ? all.findIndex((s) => s.id === sessionId) : -1;
    const session = idx >= 0 ? all[idx] : {};
    const childId = session.childId || activeId;
    const before = idx >= 0 ? all.slice(0, idx) : all;
    const gameId = session.game || game;
    const earlier = sessionsForChild(before, childId).filter((s) => !gameId || s.game === gameId);
    return buildParentSummary({ session, earlier, points: points || [], calibration: loadCalibration() });
  }, [sessionId, points, game, activeId]);
  return (
    <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed text-left">
      {lines.map((l) => <li key={l.key}>{l.text}</li>)}
    </ul>
  );
}
