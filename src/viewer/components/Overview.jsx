/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Whole-recording strip with the visible range as a brush: drag the box to move it, drag elsewhere to
// select a new range, tap to centre the view there.
import React, { useEffect, useRef } from 'react';
import { THEME, EVENT_STYLE, useWidth, padLeft } from './theme.js';

const H = 44;

export function Overview({ series, duration, view, cursor, onView, onCursor, events }) {
  const wrap = useRef(null);
  const cv = useRef(null);
  const W = useWidth(wrap);
  const drag = useRef(null);

  useEffect(() => {
    const c = cv.current;
    if (!c || W < 50) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    c.style.width = `${W}px`; c.style.height = `${H}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x0 = padLeft(W), x1 = W - 6, pw = x1 - x0;
    const X = (t) => x0 + (t / Math.max(1e-6, duration)) * pw;
    ctx.fillStyle = THEME.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = THEME.frame; ctx.strokeRect(x0 + 0.5, 0.5, pw - 1, H - 1);
    ctx.fillStyle = THEME.axis; ctx.font = '9px ui-monospace, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillText('ALL', x0 - 4, H / 2);
    if (series?.t && series.y) {
      // min/max envelope per column
      const mn = new Float32Array(pw).fill(Infinity), mx = new Float32Array(pw).fill(-Infinity);
      const n = series.t.length;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const v = series.y[i];
        if (!(v === v)) continue;
        const col = Math.min(pw - 1, Math.max(0, Math.floor(X(series.t[i]) - x0)));
        if (v < mn[col]) mn[col] = v;
        if (v > mx[col]) mx[col] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi > lo) {
        const Y = (v) => H - 3 - ((v - lo) / (hi - lo)) * (H - 6);
        ctx.strokeStyle = series.color || '#00C020';
        ctx.beginPath();
        for (let col = 0; col < pw; col++) {
          if (mx[col] < mn[col]) continue;
          ctx.moveTo(x0 + col + 0.5, Y(mn[col])); ctx.lineTo(x0 + col + 0.5, Y(mx[col]) - 0.5);
        }
        ctx.stroke();
      }
    }
    for (const e of events || []) {
      const st = EVENT_STYLE[e.kind];
      if (!st?.line) continue;
      ctx.strokeStyle = st.color;
      const x = Math.round(X(e.t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    const a = X(view.t0), b = X(view.t1);
    ctx.fillStyle = 'rgba(252,192,96,0.18)';
    ctx.fillRect(a, 1, Math.max(2, b - a), H - 2);
    ctx.strokeStyle = '#FCC060'; ctx.lineWidth = 2;
    ctx.strokeRect(a, 1, Math.max(2, b - a), H - 2);
    ctx.lineWidth = 1;
    if (Number.isFinite(cursor)) {
      ctx.strokeStyle = THEME.cursor;
      const x = Math.round(X(cursor)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }, [W, series, duration, view, cursor, events]);

  const tAt = (clientX) => {
    const r = cv.current.getBoundingClientRect();
    const x0 = padLeft(r.width), pw = r.width - 6 - x0;
    return Math.min(duration, Math.max(0, ((clientX - r.left - x0) / pw) * duration));
  };
  const onDown = (e) => {
    cv.current.setPointerCapture?.(e.pointerId);
    const t = tAt(e.clientX);
    const inside = t >= view.t0 && t <= view.t1 && view.t1 - view.t0 < duration * 0.98;
    drag.current = { t, x: e.clientX, inside, view: { ...view }, moved: false };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    if (!d.moved) return;
    const t = tAt(e.clientX);
    if (d.inside) onView(d.view.t0 + (t - d.t), d.view.t1 + (t - d.t));
    else onView(Math.min(d.t, t), Math.max(d.t, t));
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || e.type !== 'pointerup') return;
    const t = tAt(e.clientX);
    const half = (view.t1 - view.t0) / 2;
    onView(t - half, t + half);
    onCursor?.(t);
  };

  return (
    <div ref={wrap} className="w-full select-none" style={{ height: H }}>
      <canvas
        ref={cv}
        style={{ touchAction: 'pan-y' }}
        aria-label="Whole recording overview; drag to choose the visible range"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(view.t0)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
