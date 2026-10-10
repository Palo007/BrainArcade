/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Plain-language summary lines for the parent report. Pure functions, no React, no medical claims.

const GOAL = 0.62; // same goal line as Focus Ball
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return r ? `${m} min ${r} s` : `${m} min`;
}

// Share of timeline seconds with focus at or above the goal (0..100), or null without focus data.
export function focusPctFromTimeline(points) {
  const f = (points || []).map((p) => p.focus).filter(fin);
  if (!f.length) return null;
  return (f.filter((v) => v >= GOAL).length / f.length) * 100;
}

// session: this session's history record (or {}), earlier: earlier records of the same child and game
// (any order), points: timeline points of this session, calibration: loadCalibration() result or null.
// Returns an array of {key, text}.
export function buildParentSummary({ session = {}, earlier = [], points = [], calibration = null } = {}) {
  const lines = [];
  const playedSec = fin(session.playedSec) ? session.playedSec : points.length ? points[points.length - 1].t - points[0].t : null;
  if (fin(playedSec) && playedSec > 0) lines.push({ key: 'length', text: `Session length: ${formatDuration(playedSec)}.` });

  const pct = fin(session.timeAbovePct) ? session.timeAbovePct : focusPctFromTimeline(points);
  if (fin(pct) && session.valid !== false) lines.push({ key: 'focus', text: `Time in focus: ${Math.round(pct)}% of the session.` });

  const invalid = session.valid === false;
  const prev = earlier.filter((s) => s && s.valid !== false).slice(-5); // unusable sessions are not history
  if (invalid) {
    lines.push({ key: 'invalid', text: 'The signal was not usable in this session (for example stuck or too weak), so its numbers do not show focus. Check the headband fit.' });
  } else if (prev.length) {
    // Score is only comparable between rounds of the same length; time in focus always is.
    const usePct = fin(pct) && prev.every((s) => fin(s.timeAbovePct));
    const sameLen = fin(session.durationSec) && prev.every((s) => s.durationSec === session.durationSec);
    const useScore = !usePct && sameLen && fin(session.score) && prev.every((s) => fin(s.score));
    const cur = usePct ? pct : useScore ? session.score : null;
    const base = usePct ? mean(prev.map((s) => s.timeAbovePct)) : useScore ? mean(prev.map((s) => s.score)) : null;
    if (fin(cur) && fin(base)) {
      const diff = cur - base;
      const limit = usePct ? 5 : Math.max(3, Math.abs(base) * 0.1);
      const word = diff >= limit ? 'higher than' : diff <= -limit ? 'lower than' : 'about the same as';
      const what = usePct ? 'Time in focus' : 'The score';
      const n = prev.length === 1 ? 'the last session' : `the last ${prev.length} sessions`;
      lines.push({ key: 'compare', text: `${what} was ${word} ${n} of this game.` });
    }
  } else {
    lines.push({ key: 'compare', text: 'No earlier sessions of this game to compare with yet.' });
  }

  if (calibration && fin(calibration.paf)) {
    lines.push({ key: 'paf', text: `Personal alpha peak: ${calibration.paf.toFixed(1)} Hz. It is a personal reference for the colour bands, not a score.` });
  }
  if (points.some((p) => fin(p.hbo))) {
    lines.push({ key: 'fnirs', text: 'The forehead light sensor was on. The lower chart shows its relative change.' });
  }
  lines.push({ key: 'note', text: 'This is a play summary, not a medical result. Short sessions vary a lot.' });
  return lines;
}
