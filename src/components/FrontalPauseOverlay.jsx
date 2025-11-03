import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { RetroModal } from './RetroModal.jsx';

export function FrontalPauseOverlay() {
  const { frontalBad, adjusting } = useQuality();
  const location = useLocation();
  const isGamePage = location.pathname.startsWith('/game/');
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
    <RetroModal title={adjusting ? 'EVALUATING SETUP…' : 'PAUSED: CHECK ELECTRODES'} showFooter={false}>
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        {adjusting ? (
          <div className="text-[10px] flex items-center gap-2">
            <span className="animate-pulse">▮▯▮</span>
            <span>evaluating setup...</span>
          </div>
        ) : (
          <>
            <p className="text-[10px] mb-2">Front electrodes show unstable contact.</p>
            <ul className="text-[10px] list-disc ml-4">
              <li>Re-seat left/right forehead pads</li>
              <li>Ensure skin contact and minimal movement</li>
            </ul>
            <p className="text-[9px] opacity-60 mt-2">Game resumes automatically when stable.</p>
          </>
        )}
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
