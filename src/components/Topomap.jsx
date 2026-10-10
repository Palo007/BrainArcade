/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Canvas topomap of 4 Muse electrodes (TP9/AF7/AF8/TP10): inverse-distance interpolation on a head
// outline. Ported from Muse_Capture&Analysis mind_monitor_viewer/app.js (drawTopomap), without Google Charts.
import React, { useEffect, useRef } from 'react';

const LABELS = ['TP9', 'AF7', 'AF8', 'TP10'];
// Unit-circle positions, x right, y towards the nose
const POS = [[-0.9, -0.25], [-0.55, 0.72], [0.55, 0.72], [0.9, -0.25]];
const STOPS = [[0, 32, 120], [0, 140, 255], [0, 200, 160], [255, 200, 0], [210, 30, 30]];
const RES = 120;
const NEUTRAL = [150, 170, 190];

function spectralColor(t) {
  const n = STOPS.length - 1;
  const scaled = Math.min(1, Math.max(0, t)) * n;
  const i = Math.min(n - 1, Math.floor(scaled));
  const f = scaled - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
}

// values: 4 relative alpha powers (0..1) in TP9, AF7, AF8, TP10 order; null = no data
export function Topomap({ values, title = 'Alpha (relative)' }) {
  const ref = useRef(null);
  const vals = (values || []).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  const ok = vals.filter((v) => v !== null);
  const min = ok.length ? Math.min(...ok) : 0;
  const spread = ok.length ? Math.max(...ok) - min : 0;
  // Under 5 points apart: no real difference, so one neutral colour. Otherwise a fixed span of at least 10 points.
  const flat = spread < 0.05;
  const span = ok.length ? Math.max(0.1, spread) : 1;
  const key = vals.join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !ok.length) return;
    canvas.width = RES;
    canvas.height = RES;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(RES, RES);
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const nx = (x / (RES - 1)) * 2 - 1;
        const ny = (1 - y / (RES - 1)) * 2 - 1;
        const i = (y * RES + x) * 4;
        if (nx * nx + ny * ny > 1) continue; // transparent outside the head
        let w = 0;
        let sum = 0;
        POS.forEach(([sx, sy], s) => {
          if (vals[s] === null) return;
          const d = Math.max(0.001, Math.hypot(nx - sx, ny - sy));
          w += (vals[s] / (d * d));
          sum += 1 / (d * d);
        });
        const [r, g, b] = flat ? NEUTRAL : spectralColor((w / sum - min) / span);
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, flat]);

  if (!ok.length) return <p className="text-xs">Not enough data for the head map.</p>;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const sensor = (s) => ({ left: `${(POS[s][0] * 0.5 + 0.5) * 100}%`, top: `${(-POS[s][1] * 0.5 + 0.5) * 100}%` });
  return (
    <figure className="inline-block text-center m-0" style={{ width: 170 }}>
      <div className="relative" style={{ width: 170, height: 170 }}>
        <canvas ref={ref} className="w-full h-full" role="img" aria-label={`${title} on the head`} style={{ imageRendering: 'auto' }} />
        <svg viewBox="-1.12 -1.12 2.24 2.24" className="absolute inset-0 w-full h-full" aria-hidden="true" fill="none" stroke="#222" strokeWidth="0.03">
          <circle cx="0" cy="0" r="1" />
          <path d="M-0.12 -1 L0 -1.12 L0.12 -1" />
          <path d="M-1 -0.12 Q-1.1 0 -1 0.12 M1 -0.12 Q1.1 0 1 0.12" />
        </svg>
        {LABELS.map((l, s) => (
          <span
            key={l}
            className="absolute text-[8px] leading-none px-[2px] bg-white/85 border border-black/60 text-black"
            style={{ ...sensor(s), transform: 'translate(-50%, -50%)' }}
          >
            {l}
            <span className="block">{vals[s] !== null ? pct(vals[s]) : '–'}</span>
          </span>
        ))}
      </div>
      {flat ? (
        <figcaption className="text-[9px] mt-1">No clear difference between sensors.</figcaption>
      ) : (
        <>
          <div className="mt-1 h-2 border border-black/60" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${spectralColor(t).join(',')})`).join(',')})` }} />
          <figcaption className="flex justify-between text-[9px]">
            <span>{pct(min)}</span>
            <span>{title}</span>
            <span>{pct(min + span)}</span>
          </figcaption>
        </>
      )}
    </figure>
  );
}
