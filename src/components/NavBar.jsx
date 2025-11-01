import { Link, useLocation } from 'react-router-dom';
import { games } from '../games/games.config';
import '../styles/retro.css';

/**
 * NavBar - Navigation menu for all registered games
 * Automatically displays games from games.config.js
 */
export function NavBar({ onActiveGameClick } = {}) {
  const location = useLocation();

  return (
    <nav className="mb-8 pb-4 border-b-4 border-[var(--nes-gray)]">
      <div className="flex items-center mb-4">
        <Link to="/" className="text-xl text-[var(--nes-blue)] hover:text-[var(--nes-yellow)] transition-colors">
          ← HOME
        </Link>
        <h2 className="text-lg text-[var(--nes-green)] ml-6">| SELECT GAME</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {games.map((game) => {
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
          href="#"
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
