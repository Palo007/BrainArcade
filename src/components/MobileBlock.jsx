import { useEffect, useRef } from 'react';
import '../styles/retro.css';

export function MobileBlock() {
  const titleRef = useRef(null);

  useEffect(() => {
    if (titleRef.current) {
      const text = titleRef.current.textContent;
      titleRef.current.innerHTML = text
        .split('')
        .map(
          (char, i) =>
            `<span class="char" style="--char-index: ${i}">${char === ' ' ? '&nbsp;' : char}</span>`
        )
        .join('');
    }
  }, []);

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: '#2b52ff',
      }}
    >
      {/* VHS Effects */}
      <div className="scanlines-vhs"></div>
      <div className="noise"></div>
      <div className="noise noise-moving"></div>
      <div className="vhs-vignette"></div>

      <div className="relative z-10 w-full h-full flex flex-col">
        {/* Top Left - Title */}
        <div className="absolute left-10 top-20">
          <h1
            ref={titleRef}
            className="text-2xl sm:text-3xl font-bold rgb-text type-effect text-white"
            style={{ fontFamily: "'Press Start 2P', cursive" }}
          >
            BRAIN ARCADE
          </h1>
        </div>

        {/* Center message */}
        <div className="absolute left-10 top-50">
          <p
            className="text-md sm:text-lg text-white opacity-90"
            style={{ fontFamily: "'Press Start 2P', cursive", lineHeight: '1.8' }}
          >
            The arcade is only available from desktop for now.
          </p>
        </div>
      </div>
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
