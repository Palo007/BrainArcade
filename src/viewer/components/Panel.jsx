/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Collapsible retro panel + small controls used by the recording viewer.
import React, { useRef } from 'react';
import { useT } from '../../lib/i18n.js';
import { downloadBlob, THEME } from './theme.js';
import { valueAt } from '../lib/series.js';

const font = { fontFamily: 'var(--font-retro)' };

function exportPng(root, name) {
  const cvs = [...root.querySelectorAll('canvas[data-export]')].filter((c) => c.width && c.height);
  if (!cvs.length) return;
  const w = Math.max(...cvs.map((c) => c.width));
  const h = cvs.reduce((s, c) => s + c.height, 0);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, w, h);
  let y = 0;
  for (const c of cvs) { ctx.drawImage(c, 0, y); y += c.height; }
  out.toBlob((b) => b && downloadBlob(b, `${name}.png`), 'image/png');
}

export function Panel({ id, title, color = 'var(--nes-blue)', open, onToggle, right, children, pngName }) {
  const body = useRef(null);
  const t = useT();
  return (
    <section className="border-4 bg-[var(--nes-dark)] mb-3" style={{ borderColor: open ? color : 'var(--nes-gray)', ...font }}>
      <header className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          className="flex-1 text-left text-[10px] sm:text-xs py-2 min-h-[36px] uppercase"
          style={{ color }}
          aria-expanded={open}
          aria-controls={`panel-${id}`}
          onClick={() => onToggle(id)}
        >
          {open ? '▼' : '▶'} {title}
        </button>
        {open && right}
        {open && pngName && (
          <button type="button" className="text-[8px] border-2 border-[var(--nes-gray)] px-2 py-1 text-gray-300 hover:border-white" onClick={() => exportPng(body.current, pngName)} title={t('viewer.pngTitle')}>
            PNG
          </button>
        )}
      </header>
      {open && <div id={`panel-${id}`} ref={body} className="px-2 pb-2 text-[10px] text-gray-200">{children}</div>}
    </section>
  );
}

/** Segmented choice: options = [[value, label], ...] */
export function Seg({ value, options, onChange, label, color = 'var(--nes-yellow)' }) {
  return (
    <div className="inline-flex items-center gap-1 flex-wrap mr-3 mb-1" role="group" aria-label={label}>
      {label && <span className="text-[9px] text-gray-400 mr-1">{label}</span>}
      {options.map(([v, l]) => {
        const sel = v === value;
        return (
          <button
            key={String(v)}
            type="button"
            aria-pressed={sel}
            onClick={() => onChange(v)}
            className="border-2 px-2 py-1 min-h-[30px] text-[9px] whitespace-nowrap"
            style={{ borderColor: color, background: sel ? color : 'transparent', color: sel ? '#000' : color }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, children, color = 'var(--nes-green)' }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="border-2 px-2 py-1 min-h-[30px] text-[9px] mr-2 mb-1 whitespace-nowrap"
      style={{ borderColor: color, background: on ? color : 'transparent', color: on ? '#000' : color }}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, color = 'var(--nes-yellow)', wide = false }) {
  return (
    <div className={`border-2 border-[var(--nes-gray)] px-2 py-1 min-w-0 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <div className="text-[8px] text-gray-400 uppercase truncate">{label}</div>
      <div className="text-xs sm:text-sm truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-[8px] text-gray-400 truncate">{sub}</div>}
    </div>
  );
}

/** Legend with the value of each series at the cursor */
export function Legend({ items, cursor, format = (v) => (Number.isFinite(v) ? v.toFixed(2) : '–') }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] mb-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-[3px]" style={{ background: it.color }} />
          <span className="text-gray-300">{it.label}</span>
          {it.t && Number.isFinite(cursor) && <span style={{ color: it.color }}>{(it.format || format)(valueAt(it.t, it.y, cursor))}</span>}
        </span>
      ))}
    </div>
  );
}

export function Note({ children }) {
  return <p className="text-[9px] text-gray-400 leading-relaxed my-1">{children}</p>;
}
