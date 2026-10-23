/* SPDX-License-Identifier: AGPL-3.0-or-later */
import React from 'react';
import { useFnirs } from '../hooks/useFnirs.js';
import { useT } from '../lib/i18n.js';

const FONT = { fontFamily: 'var(--font-retro)' };
const HBO = 'var(--nes-red)';
const HBR = 'var(--nes-blue)';

const QUALITY = {
  good: { key: 'core.q.good', color: 'var(--nes-green)' },
  calibrating: { key: 'core.q.calibrating', color: 'var(--nes-yellow)' },
  waiting: { key: 'core.q.waiting', color: 'gray' },
  motion: { key: 'core.q.motion', color: 'var(--nes-yellow)' },
  'no-light': { key: 'core.q.noLight', color: 'var(--nes-red)' },
  saturated: { key: 'core.q.saturated', color: 'var(--nes-red)' },
};

const fmt = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

function SideCard({ name, side }) {
  const t = useT();
  const q = QUALITY[side.quality] || QUALITY.waiting;
  return (
    <div className="flex-1 border-2 border-[var(--nes-blue)]/70 bg-black p-3 text-[10px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[var(--nes-blue)]">{name}</span>
        <span style={{ color: q.color }}>{t(q.key)}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span style={{ color: HBO }}>HbO</span>
        <span>{fmt(side.hbo)}</span>
      </div>
      <div className="flex justify-between">
        <span style={{ color: HBR }}>HbR</span>
        <span>{fmt(side.hbr)}</span>
      </div>
    </div>
  );
}

function Chart({ history }) {
  const W = 400, H = 90, MID = H / 2;
  const peak = Math.max(0.2, ...history.flatMap((p) => [p.l.hbo, p.l.hbr, p.r.hbo, p.r.hbr].map(Math.abs)));
  const line = (get) =>
    history
      .map((p, i) => `${(i / Math.max(1, history.length - 1)) * W},${MID - (get(p) / peak) * (MID - 4)}`)
      .join(' ');
  return (
    <svg className="w-full h-24" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1="0" y1={MID} x2={W} y2={MID} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      {history.length > 1 && (
        <>
          <polyline fill="none" stroke={HBO} strokeWidth="2" points={line((p) => p.l.hbo)} />
          <polyline fill="none" stroke={HBO} strokeWidth="2" strokeDasharray="4 3" points={line((p) => p.r.hbo)} />
          <polyline fill="none" stroke={HBR} strokeWidth="2" points={line((p) => p.l.hbr)} />
          <polyline fill="none" stroke={HBR} strokeWidth="2" strokeDasharray="4 3" points={line((p) => p.r.hbr)} />
        </>
      )}
      <text x="4" y="10" fill="gray" fontSize="8">+{peak.toFixed(2)} µM</text>
      <text x="4" y={H - 3} fill="gray" fontSize="8">−{peak.toFixed(2)} µM</text>
    </svg>
  );
}

/**
 * fNIRS dashboard panel: forehead blood-oxygen change (Muse S Athena optics).
 * Values are changes from a 30 s baseline, in approximate µM.
 */
export function FnirsPanel({ className = '' }) {
  const { supported, data, resetBaseline } = useFnirs();
  const t = useT();

  return (
    <div className={`border-4 border-[var(--nes-blue)] bg-[var(--nes-dark)] p-4 text-white ${className}`} style={FONT}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-[var(--nes-yellow)]">{t('core.fnirs.title')}</div>
          <div className="text-[8px] text-gray-400 mt-1">{t('core.fnirs.change')}</div>
        </div>
        {supported && (
          <button
            type="button"
            onClick={resetBaseline}
            className="border-2 border-[var(--nes-yellow)] px-2 py-1 text-[8px] text-[var(--nes-yellow)] hover:bg-[var(--nes-yellow)] hover:text-black"
          >
            {t('core.fnirs.reset')}
          </button>
        )}
      </div>

      {!supported && <div className="text-[10px] text-gray-400">{t('core.fnirs.na')}</div>}

      {supported && !data?.available && <div className="text-[10px] text-gray-400">{t('core.fnirs.waiting')}</div>}

      {data?.available && (
        <>
          {!data.baselineReady && (
            <div className="mb-3">
              <div className="text-[8px] text-[var(--nes-yellow)] mb-1">{t('core.fnirs.calibrating')}</div>
              <div className="h-2 w-full border border-[var(--nes-yellow)]/60">
                <div className="h-full bg-[var(--nes-yellow)]" style={{ width: `${Math.round(data.baselineProgress * 100)}%` }} />
              </div>
            </div>
          )}

          <div className="flex gap-3 mb-3">
            <SideCard name={t('core.fnirs.left')} side={data.left} />
            <SideCard name={t('core.fnirs.right')} side={data.right} />
          </div>

          <div className="border-2 border-[var(--nes-blue)]/40 bg-black p-2">
            <Chart history={data.history} />
            <div className="flex gap-4 text-[8px] text-gray-400 mt-1">
              <span><span style={{ color: HBO }}>■</span> HbO</span>
              <span><span style={{ color: HBR }}>■</span> HbR</span>
              <span>{t('core.fnirs.legend')}</span>
            </div>
          </div>

          <div className="border-2 border-[var(--nes-yellow)]/50 bg-black p-2 mt-3 text-[8px] leading-relaxed">
            <div><span style={{ color: HBO }}>■ HbO</span>{t('core.fnirs.hboText')}</div>
            <div><span style={{ color: HBR }}>■ HbR</span>{t('core.fnirs.hbrText')}</div>
            <div className="text-[var(--nes-green)] mt-1">{t('core.fnirs.hint')}</div>
          </div>

          <div className="flex justify-between text-[10px] mt-3">
            <span className="text-[var(--nes-blue)]">{t('core.fnirs.index')}</span>
            <span>{fmt(data.oxy)}</span>
          </div>
        </>
      )}
    </div>
  );
}
