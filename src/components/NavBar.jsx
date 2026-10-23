import { useContext, useState } from 'react';
import { PlayerSwitcher } from './PlayerSwitcher.jsx';
import { HeadbandBattery } from './HeadbandBattery.jsx';
import { SettingsButton } from './SettingsButton.jsx';
import { TopBarSlotContext } from './topBarSlot.js';
import { Link, useLocation } from 'react-router-dom';
import { games, categories } from '../games/games.config';
import '../styles/retro.css';

const ALL = 'all';

/**
 * GameCard - Picture card for one game (art on top, name + description below)
 */
function GameCard({ game, isActive, onClick }) {
  return (
    <Link
      to={`/game/${game.id}`}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`
        group flex flex-col border-4 bg-black/30 transition-all
        hover:-translate-y-1 focus-visible:-translate-y-1 outline-none
        ${isActive
          ? 'border-[var(--nes-yellow)]'
          : 'border-[var(--nes-gray)] hover:border-[var(--nes-blue)] focus-visible:border-[var(--nes-blue)]'
        }
      `}
    >
      {/* Art */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[#10102a]">
        {game.thumb && (
          <img
            src={game.thumb}
            alt=""
            loading="lazy"
            draggable="false"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ imageRendering: 'pixelated' }}
          />
        )}
        {!game.thumb && (
          <div className="absolute inset-0 bg-gradient-to-b from-[#40C0FF] to-[#2b52ff]" />
        )}
        {game.sprite && (
          <img
            src={game.sprite}
            alt=""
            loading="lazy"
            draggable="false"
            className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[80%] w-auto object-contain drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]"
          />
        )}

        {/* Badge (e.g. required hardware) */}
        {game.badge && (
          <span className="absolute top-1.5 right-1.5 text-[7px] phone-port:text-[9px] sm:text-[8px] px-1.5 py-1 bg-black/80 text-[var(--nes-yellow)] border border-[var(--nes-yellow)] leading-none">
            {game.badge}
          </span>
        )}

        {/* Play overlay */}
        <div
          className={`
            absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity
            ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}
          `}
        >
          <span className="text-[10px] sm:text-xs px-3 py-2 bg-[var(--nes-yellow)] text-black">
            {isActive ? '◆ PLAYING' : '▶ PLAY'}
          </span>
        </div>
      </div>

      {/* Text */}
      <div className="p-2 sm:p-3 text-left flex-1">
        <h3 className="text-[9px] sm:text-xs leading-snug text-white mb-1 break-words">{game.name}</h3>
        <p className="hidden sm:block text-[9px] text-gray-400 leading-relaxed group-hover:text-gray-200 line-clamp-3">
          {game.description}
        </p>
      </div>
    </Link>
  );
}

/**
 * NavBar - Game selection menu
 * Automatically displays games from games.config.js, grouped by category
 */
export function NavBar({ onActiveGameClick, noTopBar = false } = {}) {
  const setTopBarSlot = useContext(TopBarSlotContext);
  const location = useLocation();
  const [filter, setFilter] = useState(ALL);

  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const usedCategories = categories.filter((c) => games.some((g) => g.category === c.id));
  const visible = filter === ALL ? games : games.filter((g) => g.category === filter);

  const handleClick = (game, isActive) => (e) => {
    // Pages (kind: "page") open in one click: let the Link navigate directly
    if (game.kind === 'page') {
      if (isActive) e.preventDefault();
      return;
    }
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
  };

  const chips = [{ id: ALL, name: 'ALL', color: 'var(--nes-yellow)' }, ...usedCategories];

  return (
    <nav className="mb-8 pb-4">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[var(--nes-dark)] border-b-4 border-[var(--nes-gray)] pt-4 sm:pt-6 short-land:pt-1 pb-3 short-land:pb-1 -mx-1 px-1">
        <div className={`flex items-center gap-3 sm:gap-6 mb-3 short-land:mb-1 ${noTopBar ? 'short-land:pr-44' : ''}`}>
          <Link
            to="/"
            className="text-sm sm:text-xl short-land:text-xs text-[var(--nes-blue)] hover:text-[var(--nes-yellow)] transition-colors whitespace-nowrap py-2 short-land:py-0 phone-port:min-h-[40px] phone-port:inline-flex phone-port:items-center"
          >
            ← HOME
          </Link>
          <h2 className="text-xs sm:text-lg short-land:text-xs text-[var(--nes-green)]">SELECT GAME</h2>
          <Link
            to="/viewer"
            className="text-[9px] sm:text-[10px] border-2 border-[var(--nes-gray)] px-2 py-1 text-gray-300 hover:border-[var(--nes-yellow)] hover:text-[var(--nes-yellow)] whitespace-nowrap phone-port:min-h-[36px] phone-port:inline-flex phone-port:items-center"
            title="Open a recorded session (Mind Monitor CSV)"
          >
            VIEWER
          </Link>
          <span className="ml-auto hidden sm:inline short-land:hidden text-[10px] text-gray-500">{visible.length} GAMES</span>
          <HeadbandBattery className="ml-auto sm:ml-0 short-land:ml-auto" />
          <SettingsButton />
          <PlayerSwitcher className="min-w-0" />
          {/* Layout puts Electrodes + Muse status here (see topBarSlot.js) */}
          {!noTopBar && setTopBarSlot && <div ref={setTopBarSlot} className="contents" />}
        </div>

        {/* Category filter (scrolls sideways on phones) */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Game categories">
          {chips.map((c) => {
            const selected = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(c.id)}
                className="shrink-0 border-2 px-3 py-2 short-land:py-1 phone-port:py-3 text-[8px] phone-port:text-[9px] sm:text-[10px] whitespace-nowrap transition-colors"
                style={{
                  borderColor: c.color,
                  backgroundColor: selected ? c.color : 'transparent',
                  color: selected ? '#000' : c.color,
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections */}
      {(filter === ALL ? usedCategories : usedCategories.filter((c) => c.id === filter)).map((cat) => {
        const list = visible.filter((g) => g.category === cat.id);
        if (list.length === 0) return null;
        return (
          <section key={cat.id} className="mt-5 short-land:mt-2">
            {filter === ALL && (
              <h3 className="text-[10px] sm:text-xs mb-3 flex items-center gap-2" style={{ color: cat.color }}>
                <span className="inline-block w-2 h-2" style={{ backgroundColor: cat.color }} />
                {cat.name}
              </h3>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {list.map((game) => {
                const isActive = location.pathname === `/game/${game.id}`;
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    isActive={isActive}
                    onClick={handleClick(game, isActive)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Games with no (or unknown) category */}
      {filter === ALL && games.some((g) => !categoryById[g.category]) && (
        <section className="mt-5">
          <h3 className="text-[10px] sm:text-xs mb-3 text-gray-300">OTHER</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {games.filter((g) => !categoryById[g.category]).map((game) => {
              const isActive = location.pathname === `/game/${game.id}`;
              return (
                <GameCard
                  key={game.id}
                  game={game}
                  isActive={isActive}
                  onClick={handleClick(game, isActive)}
                />
              );
            })}
          </div>
        </section>
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
