import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { RetroModal } from './RetroModal.jsx';
import { isPageRoute } from '../games/games.config';
import { useT } from '../lib/i18n.js';

export function FrontalPauseOverlay() {
  const { frontalBad, adjusting } = useQuality();
  const t = useT();
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/') && !isPageRoute(location.pathname);
  const { visible: baselineVisible } = useBaseline();

  // Debounce to avoid flicker; require bad for >1.5s to show, and good for >1.5s to hide
  const [visible, setVisible] = useState(false);
  const [badSince, setBadSince] = useState(null);
  const [goodSince, setGoodSince] = useState(null);

  useEffect(() => {
    const now = Date.now();
    if (isGamePage && frontalBad) {
      setBadSince((t) => t || now);
      setGoodSince(null);
    } else {
      setGoodSince((t) => t || now);
      setBadSince(null);
    }
  }, [frontalBad, isGamePage]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (badSince && now - badSince > 1500) setVisible(true);
      if (goodSince && now - goodSince > 1500) setVisible(false);
    }, 200);
    return () => clearInterval(id);
  }, [badSince, goodSince]);

  // Suppress during baseline interaction (baseline modal handles quality guidance)
  if (!isGamePage || !visible || baselineVisible) return null;

  return (
    <RetroModal title={adjusting ? t('core.pause.evaluating') : t('core.pause.title')} showFooter={false}>
      <div style={{ fontFamily: 'var(--font-retro)' }}>
        {adjusting ? (
          <div className="text-[10px] flex items-center gap-2">
            <span className="animate-pulse">▮▯▮</span>
            <span>{t('core.elec.evaluating')}</span>
          </div>
        ) : (
          <>
            <p className="text-[10px] mb-2">{t('core.pause.unstable')}</p>
            <ul className="text-[10px] list-disc ml-4">
              <li>{t('core.pause.reseat')}</li>
              <li>{t('core.pause.contact')}</li>
            </ul>
            <p className="text-[9px] opacity-60 mt-2">{t('core.pause.resumes')}</p>
          </>
        )}
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
