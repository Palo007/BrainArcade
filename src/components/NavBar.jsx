import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { games } from '../games/games.config';
import '../styles/retro.css';

/**
 * NavBar - Navigation menu for all registered games
 * Automatically displays games from games.config.js
 */
export function NavBar({ onActiveGameClick } = {}) {
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const gamesPerPage = 8;

  // Calculate pagination
  const totalPages = Math.ceil(games.length / gamesPerPage);
  const startIndex = (currentPage - 1) * gamesPerPage;
  const endIndex = startIndex + gamesPerPage;
  const currentGames = games.slice(startIndex, endIndex);

  const goToPage = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="mb-8 pb-4">
      <div className="flex items-center mb-4 sticky top-0 pt-8 z-20 bg-[var(--nes-dark)] border-b-4 border-[var(--nes-gray)] py-3">
        <Link to="/" className="ml-3 text-xl text-[var(--nes-blue)] hover:text-[var(--nes-yellow)] transition-colors">
          ← HOME
        </Link>
        <h2 className="text-lg text-[var(--nes-green)] ml-6">| SELECT GAME</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {currentGames.map((game) => {
          const isActive = location.pathname === `/game/${game.id}`;

          return (
            <Link
              key={game.id}
              to={`/game/${game.id}`}
              className={`
                block p-4 border-4 transition-all
                ${isActive
                  ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] bg-opacity-20'
                  : 'border-[var(--nes-gray)] hover:border-[var(--nes-blue)] hover:bg-[var(--nes-blue)] hover:bg-opacity-10'
                }
              `}
              onClick={(e) => {
                // If a handler is provided, use modal flow instead of direct nav
                if (onActiveGameClick) {
                  e.preventDefault();
                  onActiveGameClick(game);
                  return;
                }
                // If already on this game, prevent redundant navigation
                if (isActive) {
                  e.preventDefault();
                }
              }}
            >
              <div className="flex items-center gap-4">
                {/* Game Info */}
                <div className="flex-1 text-left">
                  <h3 className="text-sm mb-1 text-white">{game.name}</h3>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    {game.description}
                  </p>
                </div>

                {/* Play Arrow */}
                <div className="text-[var(--nes-yellow)] text-xl">
                  {isActive ? '◆' : '▶'}
                </div>
              </div>
            </Link>
          );
        })}

        {/* Coming Soon Block */}
        <div className="block p-4 border-4 border-[var(--nes-gray)] bg-gray-800 bg-opacity-40">
          <div className="flex items-center gap-4">
            <div className="flex-1 text-left">
              <h3 className="text-sm mb-1 text-gray-300">MORE GAMES COMING SOON</h3>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Stay tuned for more brain-controlled minigames
              </p>
            </div>
            <div className="text-gray-600 text-xl">
              ⋯
            </div>
          </div>
        </div>

        {/* Contribute Block */}
        <a
          href="https://github.com/itayinbarr/brain-arcade"
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 border-4 border-[var(--nes-gray)] bg-gray-800 bg-opacity-40 hover:border-[var(--nes-green)] hover:bg-opacity-60 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1 text-left">
              <h3 className="text-sm mb-1 text-[var(--nes-green)]">CONTRIBUTE YOUR GAME</h3>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Build your own minigame and submit to GitHub
              </p>
            </div>
            <div className="text-[var(--nes-green)] text-xl">
              +
            </div>
          </div>
        </a>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          {/* Previous Button */}
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className={`
              px-4 py-2 border-4 font-bold transition-all
              ${currentPage === 1
                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                : 'border-[var(--nes-blue)] text-[var(--nes-blue)] hover:bg-[var(--nes-blue)] hover:text-white'
              }
            `}
          >
            ◀ PREV
          </button>

          {/* Page Numbers */}
          <div className="flex gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`
                  w-10 h-10 border-4 font-bold transition-all
                  ${page === currentPage
                    ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black'
                    : 'border-[var(--nes-gray)] text-white hover:border-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:bg-opacity-20'
                  }
                `}
              >
                {page}
              </button>
            ))}
          </div>

          {/* Next Button */}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`
              px-4 py-2 border-4 font-bold transition-all
              ${currentPage === totalPages
                ? 'border-gray-600 text-gray-600 cursor-not-allowed'
                : 'border-[var(--nes-blue)] text-[var(--nes-blue)] hover:bg-[var(--nes-blue)] hover:text-white'
              }
            `}
          >
            NEXT ▶
          </button>
        </div>
      )}

      {games.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm">No games available yet.</p>
          <p className="text-[10px] text-gray-500 mt-2">
            Add games to src/games/games.config.js
          </p>
        </div>
      )}
    </nav>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
