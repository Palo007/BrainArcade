/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Plain-language summary lines for the parent report. Pure functions, no React, no medical claims.
import { sessionSetup } from './playSetup.js';
import { t } from './i18n.js';

const GOAL = 0.62; // same goal line as Focus Ball
// Head motion limits for the report (percent of measured seconds). First guesses from adult recordings
// (MOTION-SENSOR-USES.html); set them again after the child test day.
const CALM_MOVING_PCT = 10;
const RESTLESS_MOVING_PCT = 25;
const MANY_BIG_PCT = 10;
const OFTEN_TILTED_PCT = 30;
const LOW_FOCUS_PCT = 30;
const MIN_MOTION_SEC = 30; // shorter sessions say too little about movement
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

// Head movement line + at most two tips, from the session's motion fields (sessionTimeline.motionSummary).
// Movement is a reading condition, never a diagnosis: the tips are about the setup, not the child.
export function motionLines(session = {}, focusPct = null) {
  const { motionSec, movingPct, bigMovePct, tiltedPct } = session;
  if (!fin(motionSec) || motionSec < MIN_MOTION_SEC || !fin(movingPct)) return [];
  const lines = [];
  const big = fin(bigMovePct) && bigMovePct > 0 ? t('report.summary.motionBig', { pct: Math.round(bigMovePct) }) : '';
  const tilt = fin(tiltedPct) && tiltedPct > 0 ? t('report.summary.motionTilt', { pct: Math.round(tiltedPct) }) : '';
  lines.push({ key: 'motion', text: t('report.summary.motion', { pct: Math.round(movingPct), big, tilt }) });

  const tips = [];
  const restless = movingPct >= RESTLESS_MOVING_PCT;
  const calm = movingPct < CALM_MOVING_PCT && !(fin(tiltedPct) && tiltedPct >= OFTEN_TILTED_PCT);
  const lowFocus = fin(focusPct) && session.valid !== false && focusPct < LOW_FOCUS_PCT;
  if (lowFocus && restless) {
    tips.push(t('report.summary.tipLowRestless'));
  } else if (lowFocus && movingPct < CALM_MOVING_PCT) {
    tips.push(t('report.summary.tipLowStill'));
  }
  if (restless) {
    tips.push(t(session.setup === 'hands' ? 'report.summary.tipMoveHands' : 'report.summary.tipMove'));
  }
  if (fin(bigMovePct) && bigMovePct >= MANY_BIG_PCT) tips.push(t('report.summary.tipBig'));
  if (fin(tiltedPct) && tiltedPct >= OFTEN_TILTED_PCT) tips.push(t('report.summary.tipTilt'));
  if (!tips.length && calm) tips.push(t('report.summary.tipCalm'));
  tips.slice(0, 2).forEach((text, i) => lines.push({ key: i ? 'motionTip2' : 'motionTip', text }));
  return lines;
}

// session: this session's history record (or {}), earlier: earlier records of the same child and game
// (any order), points: timeline points of this session, calibration: loadCalibration() result or null,
// alphaPeak: false for games that do not use the alpha peak (fNIRS games): no peak line at all.
// Returns an array of {key, text}.
export function buildParentSummary({ session = {}, earlier = [], points = [], calibration = null, alphaPeak = true } = {}) {
  const lines = [];
  const playedSec = fin(session.playedSec) ? session.playedSec : points.length ? points[points.length - 1].t - points[0].t : null;
  if (fin(playedSec) && playedSec > 0) lines.push({ key: 'length', text: t('report.summary.length', { duration: formatDuration(playedSec) }) });
  // How the child played: posture changes muscle noise, so sessions from different setups compare less well.
  if (session.date || session.setup) {
    const setup = sessionSetup(session);
    lines.push({ key: 'setup', text: setup === 'unknown' ? t('report.summary.setupUnknown') : t('report.summary.setup', { setup: t(`report.setup.${setup}`) }) });
  }

  // Only the game's own number: the timeline focus value is a different signal from the forehead light sensor.
  const pct = fin(session.timeAbovePct) ? session.timeAbovePct : null;
  const thing = t(session.game === 'glow-orb' ? 'report.summary.thingOrb' : session.game === 'focus-ball' ? 'report.summary.thingBall' : 'report.summary.thingSignal');
  const basisSec = fin(session.okSec) && session.okSec > 0 ? session.okSec : fin(session.playedSec) && session.playedSec > 0 ? session.playedSec : null;
  if (fin(pct) && session.valid !== false) {
    const detail = basisSec ? t('report.summary.focusDetail', { done: formatDuration((pct / 100) * basisSec), total: formatDuration(basisSec) }) : '';
    lines.push({ key: 'focus', text: t('report.summary.focus', { thing, pct: Math.round(pct), detail }) });
  }

  // Signal quality of the brain games (round record): held and frozen time. High = fix the pose, not bad focus.
  if (fin(session.heldPct) || fin(session.frozenPct)) {
    const h = fin(session.heldPct) ? t('report.summary.held', { pct: Math.round(session.heldPct) }) : null;
    const f = fin(session.frozenPct) ? t('report.summary.frozen', { pct: Math.round(session.frozenPct) }) : null;
    lines.push({ key: 'signal', text: t('report.summary.signal', { parts: [h, f].filter(Boolean).join(', ') }) });
  }

  lines.push(...motionLines(session, pct));

  const invalid = session.valid === false;
  const prev = earlier.filter((s) => s && s.valid !== false).slice(-5); // unusable sessions are not history
  if (invalid) {
    lines.push({ key: 'invalid', text: t('report.summary.invalid') });
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
      const word = t(diff >= limit ? 'report.summary.higher' : diff <= -limit ? 'report.summary.lower' : 'report.summary.same');
      const what = usePct ? t('report.summary.whatPct', { thing }) : t('report.summary.whatScore');
      const n = t('report.summary.lastN', { n: prev.length });
      lines.push({ key: 'compare', text: t('report.summary.compare', { what, word, n }) });
    }
  } else {
    lines.push({ key: 'compare', text: t('report.summary.noEarlier') });
  }

  if (!alphaPeak) {
    // fNIRS games: the alpha peak plays no part, so neither the value nor "not measured" is shown
  } else if (calibration && fin(calibration.paf)) {
    lines.push({ key: 'paf', text: t('report.summary.paf', { hz: calibration.paf.toFixed(1) }) });
  } else {
    // Without this line parents think the peak was dropped: it is stored per player and per device
    lines.push({ key: 'paf', text: t('report.summary.pafNone') });
  }
  if (points.some((p) => fin(p.hbo))) {
    const usable = !invalid && session.fnirsUsed !== false && !(fin(session.okSec) && session.okSec <= 0);
    lines.push({ key: 'fnirs', text: t(usable ? 'report.summary.fnirsOk' : 'report.summary.fnirsPoor') });
  }
  lines.push({ key: 'note', text: t('report.summary.note') });
  return lines;
}
