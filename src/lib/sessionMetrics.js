/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Session metrics for Focus Ball (pure functions, no React).
// samples: [{ t: seconds since session start, v: 0..1 ball height, ok: signal quality good }]

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_STEP = 1; // seconds; a longer gap between samples is not counted as one long sample
const DEFAULT_STEP = 0.25;
const LIMIT_LO = 0.03; // ball height clamp limits in the games
const LIMIT_HI = 0.97;
const LIMIT_EPS = 0.02;
const STUCK_SHARE = 0.8; // more than this share of ok-time at one limit = signal stuck

function pickInsight({ score, energy, flow, increase, flowSec }) {
  const parts = [];
  if (score < 30) parts.push('NICE TRY!');
  if (flowSec >= 10) parts.push(`You held focus for ${Math.round(flowSec)} s in a row!`);
  const weakest = [
    ['energy', energy, 'Try to keep the ball a bit higher on average.'],
    ['flow', flow, 'Next time, try to keep the ball up a little longer without a drop.'],
    ['increase', increase ?? 0, 'When the ball drops, take a breath and start your counting again — it comes back faster with practice.'],
  ].sort((a, b) => a[1] - b[1])[0];
  if (parts.length === 0 || weakest[1] < 85) parts.push(weakest[2]);
  if (parts.length === 0) parts.push('Great job!');
  return parts.join(' ');
}

const DROP_MARGIN = 0.03; // a drop only counts below goal - margin (hysteresis against jitter near the goal)
const DROP_MIN_SEC = 1; // ...and only when it lasts at least this long (ok time)

export function computeSessionMetrics(samples, { goal = 0.62, durationSec = 180 } = {}) {
  const dur = Math.max(1, Number(durationSec) || 0);
  const list = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.v))
    .sort((a, b) => a.t - b.t);

  let okTime = 0;
  let aboveTime = 0;
  let vWeighted = 0;
  let run = 0;
  let flowSec = 0;
  let belowTime = 0; // ok-time since the current drop began
  let dropAcc = 0; // continuous ok-time below goal - margin (not yet a counted drop)
  let inBelow = false;
  let everAbove = false;
  let seenOk = false;
  const recoveries = [];
  let periods = 0;
  let loTime = 0; // ok-time with v at the bottom / top clamp limit
  let hiTime = 0;

  const oks = list.filter((s) => s.ok); // bad-quality samples are ignored entirely
  for (let i = 0; i < oks.length; i++) {
    const s = oks[i];
    const next = oks[i + 1];
    const w = next ? clamp(next.t - s.t, 0, MAX_STEP) : DEFAULT_STEP;
    const above = s.v >= goal;
    okTime += w;
    vWeighted += s.v * w;
    if (s.v <= LIMIT_LO + LIMIT_EPS) loTime += w;
    else if (s.v >= LIMIT_HI - LIMIT_EPS) hiTime += w;
    if (above) {
      everAbove = true;
      aboveTime += w;
      run += w;
      if (run > flowSec) flowSec = run;
      dropAcc = 0;
      if (inBelow) {
        recoveries.push(belowTime);
        inBelow = false;
      }
    } else {
      run = 0;
      if (inBelow) belowTime += w;
      else if (everAbove && s.v < goal - DROP_MARGIN) {
        dropAcc += w;
        if (dropAcc >= DROP_MIN_SEC) {
          inBelow = true;
          belowTime = dropAcc;
          periods++;
        }
      } else dropAcc = 0;
    }
    seenOk = true;
  }

  const timeAbovePct = okTime > 0 ? (aboveTime / okTime) * 100 : 0;
  const energy = okTime > 0 ? (vWeighted / okTime) * 100 : 0;
  const flow = Math.min(100, (flowSec / (0.5 * dur)) * 100);

  let avgRecoverySec = null;
  let increase;
  if (!seenOk || !everAbove) increase = null; // n/a: the goal was never reached, so there was nothing to recover from
  else if (periods === 0) increase = 100;
  else if (recoveries.length === 0) increase = 0;
  else {
    avgRecoverySec = recoveries.reduce((a, b) => a + b, 0) / recoveries.length;
    increase = clamp(100 * (1 - (avgRecoverySec - 5) / 55), 0, 100);
  }

  const finite = (x) => (Number.isFinite(x) ? x : 0);
  const score = Math.round(finite(0.4 * timeAbovePct + 0.2 * energy + 0.2 * flow + 0.2 * (increase ?? 0)));
  const stars = score >= 75 ? 3 : score >= 55 ? 2 : score >= 30 ? 1 : 0;
  const insight = pickInsight({ score, energy, flow, increase, flowSec });

  // Degenerate: the value sat at a clamp limit for most of the time, so it says nothing about focus
  const degenerate = okTime > 0 && Math.max(loTime, hiTime) > STUCK_SHARE * okTime;
  const degenerateSide = degenerate ? (loTime >= hiTime ? 'low' : 'high') : null;

  return { score, stars, energy, flow, flowSec, increase, avgRecoverySec, timeAbovePct, okSec: okTime, degenerate, degenerateSide, insight };
}
