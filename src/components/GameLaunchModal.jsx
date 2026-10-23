import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import { PlayerChip, WhoIsPlayingModal } from './PlayerSwitcher.jsx';
import { useT } from '../lib/i18n.js';
import '../styles/retro.css';

export function GameLaunchModal({ game, onClose }) {
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(false);
  const t = useT();

  if (!game) return null;

  const handlePlayNow = () => {
    navigate(`/game/${game.id}`);
    if (onClose) onClose();
  };

  return (
    <RetroModal title={game.nameKey ? t(game.nameKey) : game.name} onCancel={onClose} showFooter={false}>
      <div style={{ fontFamily: 'var(--font-retro)' }}>
        <p className="text-[10px] mb-4 text-gray-300">{game.descKey ? t(game.descKey) : game.description}</p>

        <div className="flex items-center gap-2 text-[10px] text-gray-300">
          <span>{t('core.launch.playingAs')}</span>
          <PlayerChip onClick={() => setChoosing(true)} />
        </div>

        <div className="mt-4 flex gap-3 justify-end flex-wrap">
          <button
            onClick={onClose}
            className="retro-button border-[var(--nes-gray)] text-white bg-transparent px-4 py-2"
          >
            {t('core.launch.back')}
          </button>
          <button
            onClick={handlePlayNow}
            className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 hover:bg-[var(--nes-blue)] hover:text-black"
          >
            {t('core.launch.playNow')}
          </button>
        </div>
      </div>
      {choosing && <WhoIsPlayingModal onClose={() => setChoosing(false)} />}
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
