/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Lane builders (custom draw callbacks) for TimeChart: state stripes, per-second shading, spectrogram.
import { lowerBound } from '../lib/series.js';

/**
 * Lane of horizontal state stripes. rows: [{ label, t, y, color: (v) => css | null, end }]
 * Each sample holds until the next one (or `end`, or maxHold seconds).
 */
export function stripeLane(rows, { weight = 1, label, maxHold = Infinity } = {}) {
  return {
    label,
    weight,
    yRange: [0, rows.length],
    yTicks: [],
    series: [],
    draw(ctx, { x0, x1, y0, y1, X, t0, t1 }) {
      const rh = (y1 - y0) / rows.length;
      rows.forEach((r, k) => {
        const top = y0 + k * rh;
        if (r.t && r.y) {
          const n = r.t.length;
          let i = Math.max(0, lowerBound(r.t, t0) - 1);
          for (; i < n && r.t[i] <= t1; i++) {
            const c = r.color(r.y[i]);
            if (!c) continue;
            const e = Math.min(i + 1 < n ? r.t[i + 1] : (r.end ?? t1), r.t[i] + maxHold);
            const a = Math.max(x0, X(r.t[i])), b = Math.min(x1, X(e));
            if (b <= a - 0.5) continue;
            ctx.fillStyle = c;
            ctx.fillRect(a, top + 1, Math.max(1, b - a), rh - 2);
          }
        }
        ctx.fillStyle = '#d8d8d8';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (rh >= 9) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const w = ctx.measureText(r.label).width + 4;
          ctx.fillRect(x0 + 2, top + rh / 2 - 6, w, 12);
          ctx.fillStyle = '#d8d8d8';
          ctx.fillText(r.label, x0 + 4, top + rh / 2);
        }
      });
    },
  };
}

/** Draw callback shading spans where a per-second flag series is 1 */
export function flagShade(t, y, color, step = 1) {
  return (ctx, { x0, x1, y0, y1, X, t0, t1 }) => {
    if (!t || !y) return;
    ctx.fillStyle = color;
    let i = Math.max(0, lowerBound(t, t0 - step));
    for (; i < t.length && t[i] <= t1; i++) {
      if (y[i] !== 1) continue;
      const a = Math.max(x0, X(t[i])), b = Math.min(x1, X(t[i] + step));
      if (b > a) ctx.fillRect(a, y0, Math.max(1, b - a), y1 - y0);
    }
  };
}

const HEAT = [[0, 0, 40], [40, 0, 120], [140, 0, 140], [230, 60, 60], [255, 170, 0], [255, 255, 180]];
function heat(v) {
  const x = Math.min(1, Math.max(0, v)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(x));
  const f = x - i;
  return HEAT[i].map((c, k) => c + (HEAT[i + 1][k] - c) * f);
}

/** Spectrogram draw callback: spec from analysis.spectrogram, getFrame(f) -> Float32 bins (linear) or null */
export function spectrogramDraw(spec, getFrame, [lo, hi], fMax) {
  return (ctx, { x0, y0, y1, t0, t1, plotW }) => {
    if (!spec?.n) return;
    const nb = Math.min(spec.nBins, Math.floor(fMax / spec.df));
    const w = Math.max(1, Math.floor(plotW));
    const img = new ImageData(w, nb);
    const span = t1 - t0;
    for (let x = 0; x < w; x++) {
      const t = t0 + ((x + 0.5) / w) * span;
      let f = lowerBound(spec.t, t);
      if (f >= spec.n || (f > 0 && Math.abs(spec.t[f - 1] - t) < Math.abs(spec.t[f] - t))) f--;
      if (f < 0 || Math.abs(spec.t[f] - t) > 1.5) continue;
      const fr = getFrame(f);
      if (!fr) continue;
      for (let k = 0; k < nb; k++) {
        const v = fr[k];
        if (!(v > 0)) continue;
        const [r, g, b] = heat((Math.log10(v) - lo) / (hi - lo));
        const p = ((nb - 1 - k) * w + x) * 4;
        img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
      }
    }
    const off = document.createElement('canvas');
    off.width = w; off.height = nb;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = span < 120;
    // bins are 1..nb * df; lane y range is [df, nb*df]
    ctx.drawImage(off, x0, y0, plotW, y1 - y0);
  };
}

export const heatGradient = `linear-gradient(90deg, ${HEAT.map((c) => `rgb(${c.join(',')})`).join(',')})`;
