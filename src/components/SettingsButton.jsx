/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Settings button for the game menu and its modal. Settings are per device (lib/settings.js).
import React, { useEffect, useState } from 'react';
import { RetroModal } from './RetroModal.jsx';
import { LANGUAGES, useSetting } from '../lib/settings.js';
import { findVoice, phrase, speak } from '../lib/phrases.js';

const FONT = { fontFamily: 'var(--font-retro)' };

function SettingsModal({ onClose }) {
  const [language, setLanguage] = useSetting('language');
  // Voices load late on some phones: look again when the list changes
  const [voiceOk, setVoiceOk] = useState(() => !!findVoice());
  useEffect(() => {
    const check = () => setVoiceOk(!!findVoice());
    check();
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
    ss?.addEventListener?.('voiceschanged', check);
    return () => ss?.removeEventListener?.('voiceschanged', check);
  }, [language]);

  return (
    <RetroModal title="SETTINGS" onCancel={onClose} cancelLabel="CLOSE" showFooter>
      <div className="text-left space-y-3" style={FONT}>
        <p className="text-[10px] text-[var(--nes-yellow)]">LANGUAGE / JAZYK</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Language">
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
          ▶ TEST VOICE
        </button>
        <p className="text-[9px] leading-relaxed text-gray-300">
          Changes what Bubble Hippo and Turbo Rex say and show as hints. Menus stay in English for now.
        </p>
        {!voiceOk && (
          <p className="text-[9px] leading-relaxed text-[var(--nes-red)]">
            This device has no {LANGUAGES.find((l) => l.id === language)?.label} voice. Android: Settings → Text-to-speech → Google → Install voice data.
          </p>
        )}
        <p className="text-[8px] text-gray-500">Saved on this device for all players.</p>
      </div>
    </RetroModal>
  );
}

export function SettingsButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        title="Settings"
        style={FONT}
        className={`inline-flex items-center justify-center border-2 border-[var(--nes-gray)] px-2 min-h-[36px] min-w-[36px] text-sm text-gray-300 hover:border-[var(--nes-yellow)] hover:text-[var(--nes-yellow)] ${className}`}
      >
        ⚙
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}
