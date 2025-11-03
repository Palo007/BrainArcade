import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal.jsx';
import '../styles/retro.css';

export function GameLaunchModal({ game, onClose }) {
  const navigate = useNavigate();

  if (!game) return null;

  const handlePlayNow = () => {
    navigate(`/game/${game.id}`);
    if (onClose) onClose();
  };

  return (
    <RetroModal title={game.name} onCancel={onClose} showFooter={false}>
      <div style={{ fontFamily: "'Press Start 2P', cursive" }}>
        <p className="text-[10px] mb-4 text-gray-300">{game.description}</p>

        <div className="mt-4 flex gap-3 justify-end flex-wrap">
          <button
            onClick={onClose}
            className="retro-button border-[var(--nes-gray)] text-white bg-transparent px-4 py-2"
          >
            BACK
          </button>
          <button
            onClick={handlePlayNow}
            className="retro-button border-[var(--nes-blue)] text-[var(--nes-blue)] bg-transparent px-4 py-2 hover:bg-[var(--nes-blue)] hover:text-black"
          >
            PLAY NOW
          </button>
        </div>
      </div>
    </RetroModal>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
