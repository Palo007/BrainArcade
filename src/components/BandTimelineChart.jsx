/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Canvas chart: stacked relative band powers over time + focus line, optional fNIRS ΔHbO strip.
import React, { useEffect, useRef, useState } from 'react';
import { TIMELINE_BANDS } from '../lib/sessionTimeline.js';
import { useT } from '../lib/i18n.js';

const BAND_VARS = { delta: '--nes-purple', theta: '--nes-blue', alpha: '--nes-green', beta: '--nes-yellow', gamma: '--nes-red' };
const BAND_FALLBACK = { delta: '#8040FF', theta: '#40C0FF', alpha: '#00C020', beta: '#FCC060', gamma: '#FC8080' };
const INK = '#222';

function themeColor(name, fallback) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

const mmss = (s) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const GAP_S = 2; // a longer pause between points breaks the lines / areas
const HBO_TREND_HALF_S = 60; // half-width of the moving average removed from ΔHbO (slow drift)

function draw(canvas, points, width) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const hasHbo = points.some((p) => p.hbo !== null && p.hbo !== undefined);
  const H = hasHbo ? 230 : 170;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, H);
  const padL = 56;
  const padR = 6;
  const padT = 6;
  const axisH = 16;
  const bandH = hasHbo ? 120 : 140;
  const x0 = padL;
  const x1 = width - padR;
  const t0 = points[0].t;
  const tMax = Math.max(points[points.length - 1].t, t0 + 1);
  const X = (t) => x0 + ((t - t0) / (tMax - t0)) * (x1 - x0);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;

  // Stacked bands (bottom = delta, top = gamma); relative power sums to 1 per second.
  const cum = (p, k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += p.bands[TIMELINE_BANDS[i]] || 0;
    return s;
  };
  const Y = (v) => padT + (1 - v) * bandH;
  // Split into runs without gaps (> GAP_S between points); null values are skipped by the callers.
  const runs = (pts) => {
    const out = [];
    let cur = [];
    for (const p of pts) {
      if (cur.length && p.t - cur[cur.length - 1].t > GAP_S) { out.push(cur); cur = []; }
      cur.push(p);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const strokeRuns = (pts, Yf, key) => {
    for (const run of runs(pts)) {
      if (run.length < 2) continue;
      ctx.beginPath();
      run.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.t), Yf(p[key])));
      ctx.stroke();
    }
  };
  const bandRuns = runs(points);
  TIMELINE_BANDS.forEach((b, k) => {
    ctx.fillStyle = themeColor(BAND_VARS[b], BAND_FALLBACK[b]);
    for (const run of bandRuns) {
      if (run.length < 2) continue;
      ctx.beginPath();
      run.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](X(p.t), Y(cum(p, k + 1))));
      for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(X(run[i].t), Y(cum(run[i], k)));
      ctx.closePath();
      ctx.fill();
    }
  });
  // Focus line (0..1) on the same panel; null focus (no baseline yet) is skipped.
  const fp = points.filter((p) => p.focus !== null && p.focus !== undefined);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  strokeRuns(fp, Y, 'focus');
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x0, padT, x1 - x0, bandH);
  ctx.fillStyle = INK;
  ctx.textAlign = 'right';
  ctx.fillText('100%', x0 - 3, padT + 8);
  ctx.fillText('0%', x0 - 3, padT + bandH);

  let yAxis = padT + bandH;
  if (hasHbo) {
    const top = yAxis + 10;
    const h = 50;
    // ΔHbO is relative to the fixed calibration baseline and drifts by several µM over minutes, far more
    // than a task response (~0.5-1 µM). Subtract a local straight-line fit over a centred 2-min window:
    // the drift goes (also at the session edges, where a plain average lags), responses of 5-30 s stay.
    // Stored data stays raw.
    const raw = points.filter((p) => p.hbo !== null && p.hbo !== undefined);
    const hp = raw.map((p) => {
      let n = 0, st = 0, sy = 0, stt = 0, sty = 0;
      for (const q of raw) {
        const dt = q.t - p.t;
        if (Math.abs(dt) > HBO_TREND_HALF_S) continue;
        n++; st += dt; sy += q.hbo; stt += dt * dt; sty += dt * q.hbo;
      }
      const den = n * stt - st * st;
      const trend = den > 1e-9 ? (sy * stt - st * sty) / den : sy / n; // fitted value at dt = 0
      return { ...p, hbo: p.hbo - trend };
    });
    let lo = Math.min(...hp.map((p) => p.hbo));
    let hi = Math.max(...hp.map((p) => p.hbo));
    if (hi - lo < 0.2) { lo -= 0.1; hi += 0.1; }
    const YH = (v) => top + (1 - (v - lo) / (hi - lo)) * h;
    ctx.strokeRect(x0, top, x1 - x0, h);
    if (lo < 0 && hi > 0) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, YH(0));
      ctx.lineTo(x1, YH(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 1.5;
    strokeRuns(hp, YH, 'hbo');
    ctx.lineWidth = 1;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText('ΔHbO (µM)', x0 - 3, top + 10);
    yAxis = top + h;
  }
  // Time axis
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText('0:00', x0, yAxis + axisH - 3);
  ctx.textAlign = 'center';
  ctx.fillText(mmss((tMax - t0) / 2), (x0 + x1) / 2, yAxis + axisH - 3);
  ctx.textAlign = 'right';
  ctx.fillText(mmss(tMax - t0), x1, yAxis + axisH - 3);
  return hasHbo;
}

export function BandTimelineChart({ points }) {
  const t = useT();
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(300);
  const [hasHbo, setHasHbo] = useState(false);
  const usable = Array.isArray(points) && points.length >= 2;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const set = () => setWidth(Math.max(200, Math.round(el.clientWidth)));
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [usable]);

  useEffect(() => {
    if (usable && ref.current) setHasHbo(draw(ref.current, points, width));
  }, [points, width, usable]);

  if (!usable) return <p className="text-xs">{t('core.band.noData')}</p>;
  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={ref} className="w-full block" role="img" aria-label={t('core.band.aria')} />
      <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px]">
        {TIMELINE_BANDS.map((b) => (
          <li key={b} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 border border-black/60" style={{ background: `var(${BAND_VARS[b]}, ${BAND_FALLBACK[b]})` }} />
            {t(`core.band.${b}`)}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span className="inline-block w-3 border-t-2 border-black" />
          {t('core.band.focus')}
        </li>
        {hasHbo && (
          <li className="flex items-center gap-1">
            <span className="inline-block w-3 border-t-2" style={{ borderColor: '#c0392b' }} />
            {t('core.band.hbo')}
          </li>
        )}
      </ul>
    </div>
  );
}
