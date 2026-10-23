/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Settings button for the game menu and its modal. Settings are per device (lib/settings.js).
import React, { useEffect, useState } from 'react';
import { RetroModal } from './RetroModal.jsx';
import { LANGUAGES, useSetting } from '../lib/settings.js';
import { hasVoice, phrase, speak } from '../lib/phrases.js';
import { useT } from '../lib/i18n.js';

const FONT = { fontFamily: 'var(--font-retro)' };

function SettingsModal({ onClose }) {
  const [language, setLanguage] = useSetting('language');
  const t = useT();
  // Voices load late on some phones: null = still loading (no warning yet), look again when the list changes
  const [voiceOk, setVoiceOk] = useState(() => hasVoice(language));
  useEffect(() => {
    const check = () => setVoiceOk(hasVoice(language));
    check();
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
    ss?.addEventListener?.('voiceschanged', check);
    return () => ss?.removeEventListener?.('voiceschanged', check);
  }, [language]);

  return (
    <RetroModal title={t('settings.title')} onCancel={onClose} cancelLabel={t('common.close')} showFooter>
      <div className="text-left space-y-3" style={FONT}>
        <p className="text-[10px] text-[var(--nes-yellow)]">LANGUAGE / JAZYK</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('settings.language')}>
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={language === l.id}
              onClick={() => setLanguage(l.id)}
              className={`border-4 px-3 py-2 min-h-[44px] text-[10px] ${language === l.id ? 'border-[var(--nes-yellow)] text-[var(--nes-yellow)]' : 'border-[var(--nes-gray)] text-gray-300'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => speak(phrase('rex.great'), { pitch: 1.2 })}
          className="border-2 border-[var(--nes-blue)] text-[var(--nes-blue)] px-3 py-2 min-h-[40px] text-[9px]"
        >
          {t('settings.testVoice')}
        </button>
        <p className="text-[9px] leading-relaxed text-gray-300">
          {t('settings.languageNote')}
        </p>
        {voiceOk === false && (
          <p className="text-[9px] leading-relaxed text-[var(--nes-red)]">
            {t('settings.noVoice', { language: LANGUAGES.find((l) => l.id === language)?.label })}
          </p>
        )}
        <p className="text-[8px] text-gray-500">{t('settings.savedHere')}</p>
      </div>
    </RetroModal>
  );
}

export function SettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('settings.button')}
        title={t('settings.button')}
        style={FONT}
        className={`inline-flex items-center justify-center border-2 border-[var(--nes-gray)] px-2 min-h-[36px] min-w-[36px] text-sm text-gray-300 hover:border-[var(--nes-yellow)] hover:text-[var(--nes-yellow)] ${className}`}
      >
        ⚙
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
