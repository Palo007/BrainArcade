import React from 'react';

// GameHint - reusable hint/instruction HUD for games
// Props:
// - primary: main message (string or node)
// - secondary: optional subtext (string or node)
// - position: 'bottom-left' | 'bottom-right' | 'bottom-center' (default: 'bottom-center')
// - offset: tailwind spacing unit number (e.g., 4 -> bottom-4). Default 4
// - scheme: 'light' | 'dark' (default: 'light')
// - align: 'left' | 'center' | 'right' (default inferred from position)
// - className: extra class names
export function GameHint({
  primary,
  secondary,
  position = 'bottom-center',
  offset = 4,
  scheme = 'light',
  align,
  className = '',
}) {
  const posClass = (() => {
    if (position === 'bottom-center') return 'absolute left-1/2 transform -translate-x-1/2';
    return 'absolute';
  })();

  const posStyle = (() => {
    const space = offset * 4; // tailwind spacing unit -> px (approx)
    if (position === 'bottom-left') return { bottom: space, left: space };
    if (position === 'bottom-right') return { bottom: space, right: space };
    // bottom-center
    return { bottom: space };
  })();

  const textAlign = align || (position === 'bottom-left' ? 'left' : position === 'bottom-right' ? 'right' : 'center');

  const schemeClasses = scheme === 'dark'
    ? 'bg-[var(--nes-dark)] border-2 border-[var(--nes-yellow)] text-white'
    : 'bg-black/70 border-2 border-white text-white';

  return (
    <div
      className={`${posClass} ${schemeClasses} px-4 py-2 text-[10px]`}
      style={{ fontFamily: "'Press Start 2P', cursive", ...posStyle }}
    >
      {primary && (
        <div className={textAlign === 'left' ? 'text-left' : textAlign === 'right' ? 'text-right' : 'text-center'}>
          {primary}
        </div>
      )}
      {secondary && (
        <div className={`${textAlign === 'left' ? 'text-left' : textAlign === 'right' ? 'text-right' : 'text-center'} text-[8px] opacity-70 mt-1`}>
          {secondary}
        </div>
      )}
    </div>
  );
}
