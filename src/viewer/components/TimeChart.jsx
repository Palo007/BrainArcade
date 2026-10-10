/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Canvas time chart for the recording viewer: one or more stacked lanes sharing the time axis, min/max
// downsampling per pixel column, events (markers / blinks), shaded spans (gaps, headband off), a cursor
// on a separate overlay canvas (cheap redraw while playing) and wheel / drag / pinch zoom-pan.
// Replaces the Google Charts layer of mind_monitor_viewer/app.js (handleWheelZoom, startPanDrag, ...).
import React, { useEffect, useRef } from 'react';
import { lowerBound, timeTicks, niceTicks, fmtElapsed } from '../lib/series.js';
import { formatWall } from '../lib/csvParse.js';
import { THEME, EVENT_STYLE, useWidth, padLeft } from './theme.js';

const PAD_R = 6;
const PAD_T = 4;
const AXIS_H = 16;
const LANE_GAP = 6;

function laneBoxes(lanes, H) {
  const plotH = H - PAD_T - AXIS_H;
  const weights = lanes.map((l) => l.weight || 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const avail = plotH - LANE_GAP * (lanes.length - 1);
  let y = PAD_T;
  return lanes.map((l, i) => {
    const h = (avail * weights[i]) / total;
    const box = { y0: y, y1: y + h };
    y += h + LANE_GAP;
    return box;
  });
}

function autoRange(lane, t0, t1) {
  let mn = Infinity, mx = -Infinity;
  for (const s of lane.series) {
    if (!s.t || !s.y) continue;
    const n = s.n ?? s.t.length;
    const i0 = Math.max(0, lowerBound(s.t, t0, n) - 1);
    const i1 = Math.min(n, lowerBound(s.t, t1, n) + 1);
    const stride = Math.max(1, Math.floor((i1 - i0) / 20000));
    for (let i = i0; i < i1; i += stride) {
      const v = s.y[i];
      if (v === v) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
  }
  if (!(mx >= mn)) return [0, 1];
  if (lane.includeZero) { mn = Math.min(0, mn); mx = Math.max(0, mx); }
  if (mx - mn < 1e-9) { const d = Math.abs(mx) * 0.1 || 1; return [mn - d, mx + d]; }
  const pad = (mx - mn) * 0.06;
  return [mn - pad, mx + pad];
}

function drawSeries(ctx, s, X, Y, t0, t1, x0, plotW) {
  const n = s.n ?? s.t.length;
  if (!n) return;
  const t = s.t, y = s.y;
  const i0 = Math.max(0, lowerBound(t, t0, n) - 1);
  const i1 = Math.min(n, lowerBound(t, t1, n) + 1);
  const gap = s.gap ?? Infinity;
  if (s.dots) {
    ctx.fillStyle = s.color;
    const r = s.dots;
    for (let i = i0; i < i1; i++) { const v = y[i]; if (v === v) ctx.fillRect(X(t[i]) - r / 2, Y(v) - r / 2, r, r); }
    return;
  }
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width || 1.25;
  ctx.setLineDash(s.dash || []);
  ctx.beginPath();
  let pen = false;
  if (i1 - i0 > plotW * 2 && !s.step) {
    // min/max per pixel column
    let col = -1, mn = 0, mx = 0, first = 0, last = 0, has = false, lastT = -Infinity;
    const flush = () => {
      if (!has) return;
      const x = x0 + col + 0.5;
      if (pen) ctx.lineTo(x, Y(first)); else ctx.moveTo(x, Y(first));
      ctx.lineTo(x, Y(mn)); ctx.lineTo(x, Y(mx)); ctx.lineTo(x, Y(last));
      pen = true;
      has = false;
    };
    for (let i = i0; i < i1; i++) {
      const v = y[i];
      const ti = t[i];
      if (!(v === v) || ti - lastT > gap) { flush(); pen = false; }
      lastT = ti;
      if (!(v === v)) continue;
      const c = Math.floor(X(ti) - x0);
      if (c !== col) { flush(); col = c; mn = mx = first = last = v; has = true; continue; }
      if (v < mn) mn = v; if (v > mx) mx = v; last = v; has = true;
    }
    flush();
  } else {
    let lastT = -Infinity, lastY = 0;
    for (let i = i0; i < i1; i++) {
      const v = y[i];
      if (!(v === v)) { pen = false; continue; }
      const x = X(t[i]);
      const yy = Y(v);
      if (pen && t[i] - lastT > gap) pen = false;
      if (!pen) ctx.moveTo(x, yy);
      else if (s.step) { ctx.lineTo(x, lastY); ctx.lineTo(x, yy); } else ctx.lineTo(x, yy);
      pen = true;
      lastT = t[i];
      lastY = yy;
    }
    if (s.step && pen) ctx.lineTo(X(Math.min(t1, s.end ?? t1)), lastY);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function setupCanvas(canvas, W, H) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * lanes: [{ label, series: [{ t, y, n?, color, label?, gap?, step?, width?, dash? }], yRange?: [lo, hi],
 *           yFormat?, yTicks?, hBands?: [{ lo, hi, color }], weight?, includeZero?, draw?(ctx, geom) }]
 * view: { t0, t1 }, bounds: [0, duration], cursor (s), onCursor(t), onView(t0, t1),
 * events: [{ t, kind, text }], shades: [{ a, b, color }], clock: { startMs, on }
 */
export function TimeChart({ lanes, height = 160, view, bounds, cursor, onCursor, onView, events, shades, clock, title = 'chart', showEvents = true }) {
  const wrap = useRef(null);
  const base = useRef(null);
  const over = useRef(null);
  const W = useWidth(wrap);

  // Base layer: data, axes, events
  useEffect(() => {
    const canvas = base.current;
    if (!canvas || W < 50 || !lanes?.length) return;
    const ctx = setupCanvas(canvas, W, height);
    const x0 = padLeft(W), x1 = W - PAD_R;
    const plotW = x1 - x0;
    const { t0, t1 } = view;
    const span = Math.max(1e-6, t1 - t0);
    const X = (t) => x0 + ((t - t0) / span) * plotW;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, height);
    const boxes = laneBoxes(lanes, height);
    const yAll0 = boxes[0].y0, yAll1 = boxes[boxes.length - 1].y1;
    // shaded spans
    for (const sh of shades || []) {
      if (sh.b < t0 || sh.a > t1) continue;
      ctx.fillStyle = sh.color || THEME.shade;
      const a = Math.max(x0, X(sh.a)), b = Math.min(x1, X(sh.b));
      ctx.fillRect(a, yAll0, Math.max(1, b - a), yAll1 - yAll0);
    }
    // time grid + axis
    const { ticks, step } = timeTicks(t0, t1, plotW, W < 480 ? 64 : 80);
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    for (const tk of ticks) {
      const x = Math.round(X(tk)) + 0.5;
      ctx.strokeStyle = THEME.grid;
      ctx.beginPath(); ctx.moveTo(x, yAll0); ctx.lineTo(x, yAll1); ctx.stroke();
      ctx.fillStyle = THEME.axis;
      const label = clock?.on && Number.isFinite(clock.startMs) ? formatWall(clock.startMs + tk * 1000, { millis: step < 1 }) : fmtElapsed(tk, step);
      ctx.fillText(label, Math.min(x1 - 20, Math.max(x0 + 20, x)), height - AXIS_H + 3);
    }
    lanes.forEach((lane, li) => {
      const { y0, y1 } = boxes[li];
      const [lo, hi] = lane.yRange || autoRange(lane, t0, t1);
      const Y = (v) => y1 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (y1 - y0);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, plotW, y1 - y0); ctx.clip();
      for (const hb of lane.hBands || []) {
        ctx.fillStyle = hb.color;
        const ya = Y(hb.hi), yb = Y(hb.lo);
        ctx.fillRect(x0, ya, plotW, yb - ya);
      }
      // y grid
      const yt = lane.yTicks || niceTicks(lo, hi, (y1 - y0) > 80 ? 4 : 2);
      ctx.strokeStyle = THEME.grid;
      for (const v of yt) { const yy = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
      if (lane.draw) lane.draw(ctx, { x0, x1, y0, y1, X, Y, t0, t1, plotW, lo, hi });
      for (const s of lane.series) if (s.t && s.y) drawSeries(ctx, s, X, Y, t0, t1, x0, plotW);
      ctx.restore();
      // y labels
      ctx.fillStyle = THEME.axis;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const yf = lane.yFormat || ((v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : +v.toFixed(2)));
      for (const v of yt) { const yy = Y(v); if (yy > y0 + 4 && yy < y1 - 2) ctx.fillText(String(yf(v)), x0 - 3, yy); }
      if (lane.label) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = lane.labelColor || THEME.text;
        ctx.fillText(lane.label, x0 + 4, y0 + 2);
      }
      ctx.strokeStyle = THEME.frame;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, plotW - 1, y1 - y0 - 1);
    });
    // events
    if (showEvents) {
      for (const e of events || []) {
        if (e.t < t0 || e.t > t1) continue;
        const st = EVENT_STYLE[e.kind] || EVENT_STYLE.other;
        const x = Math.round(X(e.t)) + 0.5;
        ctx.strokeStyle = st.color;
        ctx.fillStyle = st.color;
        if (st.line) {
          ctx.setLineDash(st.dash || []);
          ctx.beginPath(); ctx.moveTo(x, yAll0); ctx.lineTo(x, yAll1); ctx.stroke();
          ctx.setLineDash([]);
          if (e.label) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(e.label, x + 2, yAll0 + 12); }
        } else {
          ctx.beginPath(); ctx.moveTo(x, yAll0); ctx.lineTo(x, yAll0 + 6); ctx.stroke();
        }
      }
    }
  }, [W, height, lanes, view, events, shades, clock, showEvents]);

  // Overlay: cursor
  useEffect(() => {
    const canvas = over.current;
    if (!canvas || W < 50) return;
    const ctx = setupCanvas(canvas, W, height);
    ctx.clearRect(0, 0, W, height);
    const x0 = padLeft(W), x1 = W - PAD_R;
    const { t0, t1 } = view;
    if (!Number.isFinite(cursor) || cursor < t0 || cursor > t1) return;
    const x = Math.round(x0 + ((cursor - t0) / Math.max(1e-6, t1 - t0)) * (x1 - x0)) + 0.5;
    ctx.strokeStyle = THEME.cursor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, height - AXIS_H); ctx.stroke();
  }, [W, height, cursor, view]);

  // Wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const el = over.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!onView) return;
      // plain vertical wheel scrolls the page; Ctrl+wheel (and trackpad pinch) zooms, Shift / sideways pans
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !sideways) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const x0 = padLeft(r.width), x1 = r.width - PAD_R;
      const { t0, t1 } = view;
      const f = Math.min(1, Math.max(0, (e.clientX - r.left - x0) / (x1 - x0)));
      const tc = t0 + f * (t1 - t0);
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (sideways || (e.shiftKey && !e.ctrlKey)) { const d = ((sideways ? e.deltaX : dy) / (x1 - x0)) * (t1 - t0); onView(t0 + d, t1 + d); return; }
      const k = Math.exp(dy * 0.002);
      onView(tc - (tc - t0) * k, tc + (t1 - tc) * k);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view, onView]);

  // Drag pan, pinch zoom, tap = move cursor
  const ptr = useRef({ pts: new Map(), start: null });
  const timeAt = (clientX) => {
    const el = over.current;
    const r = el.getBoundingClientRect();
    const x0 = padLeft(r.width), x1 = r.width - PAD_R;
    return view.t0 + ((clientX - r.left - x0) / (x1 - x0)) * (view.t1 - view.t0);
  };
  const onDown = (e) => {
    const p = ptr.current;
    p.pts.set(e.pointerId, e.clientX);
    over.current.setPointerCapture?.(e.pointerId);
    if (p.pts.size === 1) p.start = { x: e.clientX, time: Date.now(), view: { ...view }, moved: false };
    if (p.pts.size === 2) {
      const xs = [...p.pts.values()];
      p.pinch = { d: Math.abs(xs[0] - xs[1]) || 1, view: { ...view }, tc: timeAt((xs[0] + xs[1]) / 2) };
    }
  };
  const onMove = (e) => {
    const p = ptr.current;
    if (!p.pts.has(e.pointerId) || !onView) return;
    p.pts.set(e.pointerId, e.clientX);
    const r = over.current.getBoundingClientRect();
    const pw = r.width - padLeft(r.width) - PAD_R;
    if (p.pts.size >= 2 && p.pinch) {
      const xs = [...p.pts.values()];
      const d = Math.abs(xs[0] - xs[1]) || 1;
      const k = p.pinch.d / d;
      const { t0, t1 } = p.pinch.view;
      const tc = p.pinch.tc;
      onView(tc - (tc - t0) * k, tc + (t1 - tc) * k);
      if (p.start) p.start.moved = true;
      return;
    }
    if (!p.start) return;
    const dx = e.clientX - p.start.x;
    if (Math.abs(dx) > 4) p.start.moved = true;
    if (!p.start.moved) return;
    const { t0, t1 } = p.start.view;
    const dt = (-dx / pw) * (t1 - t0);
    onView(t0 + dt, t1 + dt);
  };
  const onUp = (e) => {
    const p = ptr.current;
    const wasSingle = p.pts.size === 1;
    p.pts.delete(e.pointerId);
    if (p.pts.size < 2) p.pinch = null;
    if (wasSingle && p.start && !p.start.moved && e.type === 'pointerup' && onCursor) {
      const t = timeAt(e.clientX);
      if (Number.isFinite(t)) onCursor(Math.min(bounds[1], Math.max(bounds[0], t)));
    }
    if (!p.pts.size) p.start = null;
  };

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      <canvas ref={base} data-export={title} className="absolute inset-0" aria-label={title} role="img" />
      <canvas
        ref={over}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={() => onView && onView(bounds[0], bounds[1])}
      />
    </div>
  );
}
