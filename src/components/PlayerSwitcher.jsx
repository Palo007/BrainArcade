// Player switching parts: PlayerChip (compact, opens the modal) and WhoIsPlayingModal (pick / create / manage children).
import React, { useMemo, useState } from 'react';
import { RetroModal } from './RetroModal.jsx';
import { useProfiles } from '../contexts/ProfileContext.jsx';
import { AVATARS, COLORS, profileLook } from '../lib/profiles.js';
import { loadSessions, sessionsForChild } from '../lib/sessionStore.js';
import { hasCalibration } from '../lib/paf.js';
import { useT, t as tr, locale, useLang } from '../lib/i18n.js';

const FONT = { fontFamily: 'var(--font-retro)' };
const btn = 'border-4 px-3 py-2 min-h-[44px] text-[10px] bg-transparent';

export function PlayerChip({ onClick, className = '' }) {
  const { active } = useProfiles();
  const t = useT();
  const look = profileLook(active);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('core.player.chipAria', { name: active.name })}
      style={{ ...FONT, borderColor: look.color }}
      className={`inline-flex items-center gap-1.5 border-2 px-2 min-h-[40px] max-w-[9.5rem] sm:max-w-[14rem] text-[10px] text-white bg-black/40 hover:bg-white/10 ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none shrink-0">{look.avatar}</span>
      <span className="truncate">{active.name}</span>
      <span aria-hidden="true" className="text-[8px] text-gray-400 shrink-0">▼</span>
    </button>
  );
}

function lastPlayedLabel(sessions) {
  let best = 0;
  for (const s of sessions) {
    const ms = Date.parse(s.date);
    if (Number.isFinite(ms) && ms > best) best = ms;
  }
  return best ? new Date(best).toLocaleDateString(locale()) : tr('core.player.never');
}

// Nickname + avatar row + colour row.
function LookForm({ initial, submitLabel, onSubmit, onCancel }) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [color, setColor] = useState(initial.color);
  return (
    <form
      className="space-y-3"
      style={FONT}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, avatar, color });
      }}
    >
      <label className="block text-[9px] text-gray-300">
        {t('core.player.nickname')}
        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('core.player.nicknamePh')}
          className="mt-1 block w-full bg-black border-4 border-white/50 px-2 py-2 min-h-[44px] text-[12px] text-white"
        />
      </label>
      <div role="group" aria-label={t('core.player.avatar')}>
        <p className="text-[9px] text-gray-300 mb-1">{t('core.player.avatarCaps')}</p>
        <div className="grid grid-cols-6 gap-1">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={t('core.player.avatarN', { a })}
              className={`min-h-[44px] text-xl border-2 ${avatar === a ? 'border-[var(--nes-yellow)] bg-white/15' : 'border-white/20'}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div role="group" aria-label={t('core.player.color')}>
        <p className="text-[9px] text-gray-300 mb-1">{t('core.player.colorCaps')}</p>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={t('core.player.colorN', { c: t(`core.player.c.${c.replace('var(--nes-', '').replace(')', '')}`) })}
              style={{ background: c, borderColor: color === c ? '#fff' : 'transparent' }}
              className="w-11 h-11 border-4"
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="submit" className={`${btn} border-[var(--nes-green)] text-[var(--nes-green)]`}>{submitLabel}</button>
        <button type="button" onClick={onCancel} className={`${btn} border-white/50 text-white`}>{t('core.player.cancel')}</button>
      </div>
    </form>
  );
}

export function WhoIsPlayingModal({ onClose }) {
  const t = useT();
  const lang = useLang();
  const { list, activeId, switchTo, create, update, remove } = useProfiles();
  const [manage, setManage] = useState(false);
  const [view, setView] = useState(null); // null | {type:'new'} | {type:'edit', id} | {type:'delete', id}
  const [alsoSessions, setAlsoSessions] = useState(true);

  const info = useMemo(() => {
    const all = loadSessions();
    const m = {};
    for (const c of list) m[c.id] = { last: lastPlayedLabel(sessionsForChild(all, c.id)), calibrated: hasCalibration(c.id) };
    return m;
  }, [list, lang]);

  const target = view && view.id ? list.find((c) => c.id === view.id) : null;
  const canDelete = list.length > 1;
  const closeView = () => setView(null);

  let body;
  if (view?.type === 'new') {
    body = (
      <LookForm
        initial={{ name: '', avatar: AVATARS[list.length % AVATARS.length], color: COLORS[list.length % COLORS.length] }}
        submitLabel={t('core.player.create')}
        onCancel={closeView}
        onSubmit={({ name, avatar, color }) => { create(name, { avatar, color }); onClose(); }}
      />
    );
  } else if (view?.type === 'edit' && target) {
    body = (
      <LookForm
        initial={{ name: target.name, ...profileLook(target) }}
        submitLabel={t('core.player.save')}
        onCancel={closeView}
        onSubmit={(patch) => { update(target.id, patch); closeView(); }}
      />
    );
  } else if (view?.type === 'delete' && target && canDelete) {
    body = (
      <div className="space-y-3 text-[11px]" style={FONT}>
        <p>{t('core.player.deleteQ').split('{who}')[0]}<span className="text-[var(--nes-yellow)]">{profileLook(target).avatar} {target.name}</span>{t('core.player.deleteQ').split('{who}')[1]}</p>
        <label className="flex items-center gap-2 text-gray-300 min-h-[44px]">
          <input type="checkbox" className="w-5 h-5" checked={alsoSessions} onChange={(e) => setAlsoSessions(e.target.checked)} />
          {t('core.player.alsoSessions')}
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { remove(target.id, { alsoSessions }); closeView(); }}
            className={`${btn} border-red-400 text-red-400`}
          >
            {t('core.player.yesDelete')}
          </button>
          <button type="button" onClick={closeView} className={`${btn} border-white/50 text-white`}>{t('core.player.cancel')}</button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={FONT}>
          {list.map((c) => {
            const look = profileLook(c);
            const active = c.id === activeId;
            const meta = info[c.id] || {};
            const content = (
              <>
                <span aria-hidden="true" className="text-5xl leading-none">{look.avatar}</span>
                <span className="mt-2 w-full truncate text-[12px] text-white">{c.name}</span>
                <span className="mt-1 text-[8px] text-gray-300">{t('core.player.lastPlayed', { last: meta.last })}</span>
                <span className={`mt-1 text-[8px] ${meta.calibrated ? 'text-[var(--nes-green)]' : 'text-[var(--nes-yellow)]'}`}>
                  {meta.calibrated ? t('core.player.calibrated') : t('core.player.needsCal')}
                </span>
                {active && <span className="mt-1 text-[8px] text-[var(--nes-yellow)]">{t('core.player.playing')}</span>}
              </>
            );
            const cls = `w-full h-full min-h-[132px] flex flex-col items-center justify-center text-center p-2 border-4 ${active ? 'bg-white/15' : 'bg-black/40'}`;
            return (
              <li key={c.id}>
                {manage ? (
                  <div className={cls} style={{ borderColor: look.color }}>
                    {content}
                    <div className="mt-2 flex gap-1 w-full">
                      <button type="button" onClick={() => setView({ type: 'edit', id: c.id })} aria-label={t('core.player.editAria', { name: c.name })} className="flex-1 min-h-[44px] border-2 border-white/50 text-[9px] text-white">{t('core.player.edit')}</button>
                      {canDelete && (
                        <button type="button" onClick={() => { setAlsoSessions(true); setView({ type: 'delete', id: c.id }); }} aria-label={t('core.player.deleteAria', { name: c.name })} className="flex-1 min-h-[44px] border-2 border-red-400 text-[9px] text-red-400">{t('core.player.delete')}</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { switchTo(c.id); onClose(); }}
                    aria-pressed={active}
                    aria-label={active ? t('core.player.nowAria', { name: c.name }) : c.name}
                    className={`${cls} hover:bg-white/10`}
                    style={{ borderColor: look.color }}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
          {!manage && (
            <li>
              <button
                type="button"
                onClick={() => setView({ type: 'new' })}
                className="w-full h-full min-h-[132px] flex flex-col items-center justify-center border-4 border-dashed border-[var(--nes-green)] text-[var(--nes-green)] text-[11px]"
              >
                <span aria-hidden="true" className="text-4xl leading-none">+</span>
                <span className="mt-2">{t('core.player.new')}</span>
              </button>
            </li>
          )}
        </ul>
        <div className="mt-4 flex gap-3 justify-between flex-wrap" style={FONT}>
          <button type="button" onClick={() => setManage((m) => !m)} aria-pressed={manage} className={`${btn} ${manage ? 'border-[var(--nes-yellow)] text-[var(--nes-yellow)]' : 'border-white/50 text-white'}`}>
            {manage ? t('core.player.done') : t('core.player.manage')}
          </button>
          <button type="button" onClick={onClose} className={`${btn} border-[var(--nes-gray)] text-white`}>{t('common.close')}</button>
        </div>
      </>
    );
  }

  return (
    <RetroModal title={t('core.player.who')} onCancel={onClose} showFooter={false} wide>
      {body}
    </RetroModal>
  );
}

// Chip + modal in one: the chip opens the modal, switching stays on the current page.
export function PlayerSwitcher({ className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PlayerChip onClick={() => setOpen(true)} className={className} />
      {open && <WhoIsPlayingModal onClose={() => setOpen(false)} />}
    </>
  );
}
