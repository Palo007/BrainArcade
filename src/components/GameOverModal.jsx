import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RetroModal } from './RetroModal';

/**
 * Game Over modal component with retry and menu options
 *
 * @param {Object} props
 * @param {number} props.finalScore - The final score achieved
 * @param {Function} props.onRetry - Custom retry handler (default: reload window)
 * @param {boolean} props.showScore - Whether to display the score (default: true)
 */
export function GameOverModal({ finalScore = 0, onRetry, showScore = true }) {
  const navigate = useNavigate();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default behavior: reload the page to restart the game
      window.location.reload();
    }
  };

  const handleMenu = () => {
    navigate('/games');
  };

  return (
    <RetroModal
      title="GAME OVER"
      confirmLabel="CHOOSE GAME"
      cancelLabel="RETRY"
      onConfirm={handleMenu}
      onCancel={handleRetry}
      confirmVisible={true}
    >
      <div className="text-center">
        {showScore && (
          <>
            <div className="text-[var(--nes-gray)] mb-2">FINAL SCORE</div>
            <div
              className="text-4xl text-[var(--nes-yellow)] mb-4"
              style={{ fontFamily: "'Press Start 2P', cursive" }}
            >
              {finalScore.toLocaleString()}
            </div>
          </>
        )}
        <p className="text-xs text-gray-300 leading-relaxed">
          Keep practicing to improve your focus and achieve higher scores!
        </p>
      </div>
    </RetroModal>
  );
}
