/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Alpha peak over time: trend by real date (peak + spread + centre of gravity), residual spectrum of the
// first vs latest calibration, alpha reactivity, plain-language summary and CSV export. No medical claims.
import React, { useMemo } from 'react';
import { loadPafHistory, pafTrend, SPEC_GRID, PAF_STABLE_HZ, REACTIVITY_MIN } from '../lib/paf.js';
import { useT, locale } from '../lib/i18n.js';

const W = 600;
const PAD = { l: 58, r: 16, t: 16, b: 30 };
const PINK = '#ff6b9d';
const CYAN = '#5ee0ff';
const GREY = '#9ca3af';
const GRID = 'rgba(255,255,255,0.15)';
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const f1 = (v) => (fin(v) ? v.toFixed(1) : '-');
const dShort = (iso) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function scale(d0, d1, r0, r1) {
  return (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) * (r1 - r0)) / (d1 - d0));
}

function TrendByDate({ list, trend }) {
  const t = useT();
  const h = 190;
  const ts = list.map((e) => Date.parse(e.date));
  const vals = list.flatMap((e) => [e.paf, e.pafLo, e.pafHi, e.cog]).filter(fin);
  const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
  const half = Math.max(1, (Math.max(...vals) - Math.min(...vals)) / 2 + 0.4);
  const yLo = Math.floor((mid - half) * 2) / 2, yHi = Math.ceil((mid + half) * 2) / 2;
  const x = scale(Math.min(...ts), Math.max(...ts), PAD.l + 8, W - PAD.r - 8);
  const y = scale(yLo, yHi, h - PAD.b, PAD.t);
  const ticks = [];
  for (let v = yLo; v <= yHi + 1e-9; v += yHi - yLo > 3 ? 1 : 0.5) ticks.push(v);
  const ref = trend.first.paf;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto block" role="img" aria-label={t('report.alpha.trendAria')}>
      <rect x={PAD.l} width={W - PAD.l - PAD.r} y={y(Math.min(yHi, ref + PAF_STABLE_HZ))}
        height={Math.max(0, y(Math.max(yLo, ref - PAF_STABLE_HZ)) - y(Math.min(yHi, ref + PAF_STABLE_HZ)))} fill="rgba(125,255,125,0.08)" />
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="15" fill={GREY}>{v.toFixed(1)}</text>
        </g>
      ))}
      <path d={path(list.map((e, i) => [x(ts[i]), y(e.paf)]))} fill="none" stroke={PINK} strokeWidth="2" />
      {list.map((e, i) => (
        <g key={i}>
          {fin(e.pafLo) && fin(e.pafHi) && <line x1={x(ts[i])} x2={x(ts[i])} y1={y(e.pafLo)} y2={y(e.pafHi)} stroke={PINK} strokeWidth="5" opacity="0.4" />}
          <circle cx={x(ts[i])} cy={y(e.paf)} r="3.5" fill={PINK}><title>{`${dShort(e.date)}: ${f1(e.paf)} Hz`}</title></circle>
          {fin(e.cog) && <circle cx={x(ts[i])} cy={y(e.cog)} r="4" fill="none" stroke={CYAN} strokeWidth="1.5" />}
        </g>
      ))}
      <text x={PAD.l} y={h - 6} fontSize="15" fill={GREY}>{dShort(list[0].date)}</text>
      {list.length > 1 && <text x={W - PAD.r} y={h - 6} fontSize="15" fill={GREY} textAnchor="end">{dShort(list[list.length - 1].date)}</text>}
    </svg>
  );
}

function SpectrumCompare({ first, last }) {
  const t = useT();
  const h = 170;
  const fx = (i) => SPEC_GRID.from + i * SPEC_GRID.step;
  const all = [...(first?.spectrum || []), ...last.spectrum];
  const yLo = Math.min(0, Math.floor(Math.min(...all))), yHi = Math.max(3, Math.ceil(Math.max(...all)));
  const x = scale(SPEC_GRID.from, SPEC_GRID.to, PAD.l, W - PAD.r);
  const y = scale(yLo, yHi, h - PAD.b, PAD.t);
  const line = (s) => path(s.map((v, i) => [x(fx(i)), y(v)]));
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto block" role="img" aria-label={t('report.alpha.spectrumAria')}>
      <rect x={x(Math.max(SPEC_GRID.from, last.paf - 2))} width={x(last.paf + 2) - x(last.paf - 2)} y={PAD.t} height={h - PAD.t - PAD.b} fill="rgba(255,107,157,0.08)" />
      {[0, yHi].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="15" fill={GREY}>{v} dB</text>
        </g>
      ))}
      {[4, 8, 12, 16, 20].map((f) => <text key={f} x={x(f)} y={h - 6} fontSize="15" fill={GREY} textAnchor="middle">{f} Hz</text>)}
      {first && <path d={line(first.spectrum)} fill="none" stroke={GREY} strokeWidth="1.5" strokeDasharray="4 3" />}
      <path d={line(last.spectrum)} fill="none" stroke={PINK} strokeWidth="2" />
      <line x1={x(last.paf)} x2={x(last.paf)} y1={PAD.t} y2={h - PAD.b} stroke={PINK} strokeDasharray="2 3" />
    </svg>
  );
}

function ReactivityChart({ list }) {
  const t = useT();
  const h = 110;
  const pts = list.filter((e) => fin(e.alphaReactivity));
  const max = Math.max(2, ...pts.map((e) => e.alphaReactivity));
  const x = scale(0, pts.length - 1, PAD.l + 8, W - PAD.r - 8);
  const y = scale(0, max, h - PAD.b, PAD.t);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto block" role="img" aria-label={t('report.alpha.reactAria')}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(REACTIVITY_MIN)} y2={y(REACTIVITY_MIN)} stroke="#ffd84a" strokeDasharray="4 3" opacity="0.6" />
      <text x={PAD.l - 6} y={y(REACTIVITY_MIN) + 3} textAnchor="end" fontSize="15" fill={GREY}>{REACTIVITY_MIN}x</text>
      <text x={PAD.l - 6} y={y(max) + 3} textAnchor="end" fontSize="15" fill={GREY}>{max.toFixed(1)}x</text>
      <path d={path(pts.map((e, i) => [x(i), y(e.alphaReactivity)]))} fill="none" stroke={CYAN} strokeWidth="2" />
      {pts.map((e, i) => <circle key={i} cx={x(i)} cy={y(e.alphaReactivity)} r="3" fill={CYAN} />)}
    </svg>
  );
}

function summaryLines(trend, last, t) {
  const out = [];
  const range = fin(last.pafLo) && fin(last.pafHi) && last.pafHi - last.pafLo >= 0.1 ? t('report.alpha.range', { lo: f1(last.pafLo), hi: f1(last.pafHi) }) : '';
  out.push(t('report.alpha.latest', { hz: f1(last.paf), range }));
  if (trend.n < 2) {
    out.push(t('report.alpha.needMore'));
    return out;
  }
  const sign = trend.change >= 0 ? '+' : '';
  out.push(trend.stable
    ? t('report.alpha.stable', { change: `${sign}${trend.change.toFixed(1)}`, count: trend.n, hz: PAF_STABLE_HZ })
    : t('report.alpha.changed', { change: `${sign}${trend.change.toFixed(1)}`, count: trend.n, n: Math.round(trend.days) }));
  if (fin(trend.slopePerMonth)) out.push(t('report.alpha.slow', { v: `${trend.slopePerMonth >= 0 ? '+' : ''}${trend.slopePerMonth.toFixed(2)}` }));
  if (fin(trend.jitter) && trend.jitter > 0.8) out.push(t('report.alpha.jitter'));
  return out;
}

function exportCsv(list) {
  const cols = ['date', 'paf', 'pafLo', 'pafHi', 'cog', 'confidence', 'prominenceDb', 'alphaReactivity', 'source', 'nWindows'];
  const csv = [cols.join(','), ...list.map((e) => cols.map((c) => (e[c] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `alpha-peak-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// panelClass: outer panel styling of the host page. childKey: re-read history when the child changes.
export function AlphaPeakReport({ panelClass = '', childKey }) {
  const t = useT();
  const list = useMemo(() => loadPafHistory(), [childKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const trend = useMemo(() => pafTrend(list), [list]);
  if (!trend) return null;
  const withSpec = list.filter((e) => Array.isArray(e.spectrum) && e.spectrum.length);
  const lastSpec = withSpec[withSpec.length - 1];
  const firstSpec = withSpec.length > 1 ? withSpec[0] : null;
  const hasReact = list.filter((e) => fin(e.alphaReactivity)).length > 1;
  return (
    <div className={panelClass}>
      <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.alpha.title')}</h3>
      <ul className="list-disc pl-5 space-y-1 text-[10px] leading-relaxed mb-3">
        {summaryLines(trend, trend.last, t).map((line) => <li key={line}>{line}</li>)}
      </ul>
      <TrendByDate list={list.filter((e) => fin(e.paf))} trend={trend} />
      <p className="text-[8px] text-gray-400 mt-1 mb-3">
        <span style={{ color: PINK }}>●</span> {t('report.alpha.legendPeak')} &nbsp; <span style={{ color: CYAN }}>○</span> {t('report.alpha.legendCog')} &nbsp; {t('report.alpha.legendGreen', { hz: PAF_STABLE_HZ })}
      </p>
      {lastSpec && (
        <>
          <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.alpha.spectrumTitle')}</h3>
          <SpectrumCompare first={firstSpec} last={lastSpec} />
          <p className="text-[8px] text-gray-400 mt-1 mb-3">
            {t('report.alpha.specBg')} <span style={{ color: PINK }}>━</span> {t('report.alpha.specLatest', { date: dShort(lastSpec.date) })}{firstSpec && <> &nbsp; <span style={{ color: GREY }}>┅</span> {t('report.alpha.specFirst', { date: dShort(firstSpec.date) })}</>}. {t('report.alpha.specHump')}
          </p>
        </>
      )}
      {hasReact && (
        <>
          <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.alpha.reactTitle')}</h3>
          <ReactivityChart list={list} />
          <p className="text-[8px] text-gray-400 mt-1 mb-3">{t('report.alpha.reactNote')}</p>
        </>
      )}
      <details className="text-[9px]">
        <summary className="cursor-pointer text-gray-300">{t('report.alpha.all', { n: list.length })}</summary>
        <table className="w-full mt-2 text-[8px]">
          <thead><tr className="text-gray-400 text-left"><th>{t('report.alpha.colDate')}</th><th>{t('report.alpha.colPeak')}</th><th>{t('report.alpha.colSpread')}</th><th>{t('report.alpha.colCog')}</th><th>{t('report.alpha.colAgree')}</th><th>{t('report.alpha.colReact')}</th></tr></thead>
          <tbody>
            {list.slice().reverse().map((e) => (
              <tr key={e.date}>
                <td>{dShort(e.date)}</td><td>{f1(e.paf)}</td>
                <td>{fin(e.pafLo) ? `${f1(e.pafLo)}-${f1(e.pafHi)}` : '-'}</td><td>{f1(e.cog)}</td>
                <td>{fin(e.confidence) ? `${Math.round(e.confidence * 100)}%` : '-'}</td><td>{fin(e.alphaReactivity) ? `${f1(e.alphaReactivity)}x` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => exportCsv(list)} className="border-4 border-white/40 px-3 py-2 mt-2 text-[9px]">{t('report.alpha.export')}</button>
      </details>
    </div>
  );
}
