import React from 'react';
import { useQuality, CHANNEL_INFO } from '../contexts/QualityContext.jsx';
import { useFnirs } from '../hooks/useFnirs.js';
import { RetroModal } from './RetroModal.jsx';
import { useT } from '../lib/i18n.js';
import '../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };

// Level -> text + color + symbol (never color-only)
const LEVELS = {
  good: { key: 'core.q.good', color: 'var(--nes-green)', mark: '✓' },
  weak: { key: 'core.q.weak', color: 'var(--nes-yellow)', mark: '!' },
  bad: { key: 'core.q.bad', color: 'var(--nes-red)', mark: '✗' },
  none: { key: 'core.q.waiting', color: 'var(--nes-gray)', mark: '…' },
};

// fNIRS side quality (see lib/fnirs.js) -> level + wording
const FNIRS_LEVEL = {
  good: ['good', 'core.q.good'],
  calibrating: ['weak', 'core.q.calibrating'],
  waiting: ['weak', 'core.q.waiting'],
  motion: ['weak', 'core.q.motion'],
  'no-light': ['bad', 'core.q.noLight'],
  saturated: ['bad', 'core.q.saturated'],
};

function Row({ name, level, detail }) {
  const t = useT();
  const l = LEVELS[level];
  return (
    <div className="flex items-center justify-between gap-2 border-2 px-2 py-2 text-xs min-h-[44px]" style={{ borderColor: l.color }}>
      <span className="text-white">{name}</span>
      <span className="flex items-center gap-2" style={{ color: l.color }}>
        <span aria-hidden="true">{l.mark}</span>
        <span>{detail || t(l.key)}</span>
      </span>
    </div>
  );
}

/**
 * Live contact quality: per EEG electrode (same data source as ElectrodeSetupCheck, i.e. QualityContext)
 * plus the fNIRS signal when the device has optics. `eegHint` adds a note for fNIRS games.
 */
function Chip({ label, level, detail }) {
  const t = useT();
  const l = LEVELS[level];
  return (
    <span
      className="inline-flex items-center gap-1 border-2 px-2 py-1 text-xs"
      style={{ borderColor: l.color, color: l.color }}
      title={`${label}: ${detail || t(l.key)}`}
      aria-label={`${label}: ${detail || t(l.key)}`}
    >
      <span aria-hidden="true">{l.mark}</span>
      <span className="text-white">{label}</span>
    </span>
  );
}

function CompactSignalCheck({ note }) {
  const t = useT();
  const { perChannelLevel, channelRms } = useQuality();
  const { supported, data } = useFnirs();
  const order = [1, 2, 0, 3];
  return (
    <div style={FONT} className="text-white text-xs">
      {supported && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[var(--nes-yellow)]">fNIRS</span>
          {!data?.available ? (
            <Chip label="L / R" level="none" detail={t('core.q.waiting')} />
          ) : (
            [['L', data.left], ['R', data.right]].map(([name, side]) => {
              const [level, textKey] = FNIRS_LEVEL[side?.quality] || FNIRS_LEVEL.waiting;
              return <Chip key={name} label={name} level={level} detail={t(textKey)} />;
            })
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--nes-yellow)]">EEG</span>
        {order.map((idx) => {
          const info = CHANNEL_INFO[idx];
          const rmsRaw = channelRms?.[idx] || 0; // unrounded: a flat Athena channel (rms < 0.5) is BAD, not waiting
          const rms = Math.round(rmsRaw);
          const lvl = rmsRaw > 0 ? (perChannelLevel?.[idx] || 'good') : 'none';
          return <Chip key={info.id} label={info.id} level={lvl} detail={lvl !== 'none' ? `${t(LEVELS[lvl].key)} ${rms}µV` : t('core.q.waiting')} />;
        })}
      </div>
      {note && <p className="text-xs text-gray-300 leading-relaxed mt-2">{note}</p>}
    </div>
  );
}

export function SignalCheck({ eegNote = null, compact = false }) {
  if (compact) return <CompactSignalCheck note={eegNote} />;
  return <FullSignalCheck eegNote={eegNote} />;
}

function FullSignalCheck({ eegNote = null }) {
  const t = useT();
  const { perChannelLevel, channelRms } = useQuality();
  const { supported, data } = useFnirs();
  // Same visual order as ElectrodeSetupCheck: forehead row, then ears
  const order = [1, 2, 0, 3];

  return (
    <div style={FONT} className="text-white">
      <h4 className="text-[var(--nes-yellow)] text-xs mb-2">{t('core.sig.eegTitle')}</h4>
      <div className="grid grid-cols-2 phone-port:grid-cols-1 gap-2">
        {order.map((idx) => {
          const info = CHANNEL_INFO[idx];
          const rmsRaw = channelRms?.[idx] || 0; // unrounded: a flat Athena channel (rms < 0.5) is BAD, not waiting
          const rms = Math.round(rmsRaw);
          const lvl = rmsRaw > 0 ? (perChannelLevel?.[idx] || 'good') : 'none';
          return (
            <Row
              key={info.id}
              name={`${info.id} ${t(`core.ch.${info.id}`)}`}
              level={lvl}
              detail={lvl !== 'none' ? `${t(LEVELS[lvl].key)} ${rms}µV` : t('core.q.waiting')}
            />
          );
        })}
      </div>
      {eegNote && <p className="text-xs text-gray-300 leading-relaxed mt-2">{eegNote}</p>}

      {supported && (
        <>
          <h4 className="text-[var(--nes-yellow)] text-xs mt-4 mb-2">{t('core.sig.fnirsTitle')}</h4>
          {!data?.available ? (
            <Row name={t('core.sig.optics')} level="weak" detail={t('core.q.waiting')} />
          ) : (
            <div className="grid grid-cols-2 phone-port:grid-cols-1 gap-2">
              {[['core.ch.AF7', data.left], ['core.ch.AF8', data.right]].map(([nameKey, side]) => {
                const [level, textKey] = FNIRS_LEVEL[side?.quality] || FNIRS_LEVEL.waiting;
                return <Row key={nameKey} name={t(nameKey)} level={level} detail={t(textKey)} />;
              })}
            </div>
          )}
        </>
      )}
      <p className="text-xs text-gray-400 leading-relaxed mt-3">{t('core.sig.tip')}</p>
    </div>
  );
}

/** Small always-reachable button + modal. Opening it never touches the game. */
export function ElectrodesButton({ onClick }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('core.sig.checkAria')}
      className="bg-[var(--nes-dark)] border-4 short-land:border-2 border-[var(--nes-blue)] text-[var(--nes-blue)] px-3 short-land:px-2 py-2 short-land:py-0 min-h-[44px] min-w-[44px] short-land:min-h-[36px] short-land:min-w-[36px] text-[13px] short-land:text-[11px] hover:bg-[var(--nes-blue)] hover:text-black transition-colors cursor-pointer"
      style={FONT}
    >
      {/* Landscape phones: short label so the controls do not cover the game HUD */}
      <span className="short-land:hidden">{t('core.sig.button')}</span>
      <span className="hidden short-land:inline">EEG</span>
    </button>
  );
}

export function ElectrodesModal({ onClose, eegNote }) {
  const t = useT();
  return (
    <RetroModal title={t('core.elec.title')} onCancel={onClose} cancelLabel={t('common.close')} showFooter>
      <SignalCheck eegNote={eegNote} />
    </RetroModal>
  );
}
