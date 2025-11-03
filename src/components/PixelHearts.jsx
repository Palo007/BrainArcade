import React from 'react';

/**
 * Pixelated hearts display component for health visualization
 *
 * @param {Object} props
 * @param {number} props.health - Current health value (0-100)
 * @param {number} props.maxHearts - Maximum number of hearts to display (default: 3)
 * @param {number} props.size - Size of each heart in pixels (default: 24)
 * @param {string} props.className - Additional CSS classes
 */
export function PixelHearts({ health = 100, maxHearts = 3, size = 24, className = '' }) {
  // Calculate filled hearts based on health percentage
  const healthPercentage = Math.max(0, Math.min(100, health)) / 100;
  const filledHearts = Math.round(healthPercentage * maxHearts);

  // Pixel heart SVG (8x8 grid style)
  const PixelHeart = ({ filled }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 8 8"
      style={{
        imageRendering: 'pixelated',
      }}
    >
      {/* Pixel heart pattern */}
      <rect x="1" y="1" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="2" y="1" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="5" y="1" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="6" y="1" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="0" y="2" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="1" y="2" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="2" y="2" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="3" y="2" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="4" y="2" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="5" y="2" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="6" y="2" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="7" y="2" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="0" y="3" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="1" y="3" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="2" y="3" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="3" y="3" width="1" height="1" fill={filled ? '#ff6699' : '#770044'} />
      <rect x="4" y="3" width="1" height="1" fill={filled ? '#ff6699' : '#770044'} />
      <rect x="5" y="3" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="6" y="3" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="7" y="3" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="1" y="4" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="2" y="4" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="3" y="4" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="4" y="4" width="1" height="1" fill={filled ? '#ff4488' : '#660033'} />
      <rect x="5" y="4" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="6" y="4" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="2" y="5" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="3" y="5" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="4" y="5" width="1" height="1" fill={filled ? '#ff2266' : '#550022'} />
      <rect x="5" y="5" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="3" y="6" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />
      <rect x="4" y="6" width="1" height="1" fill={filled ? '#ff0044' : '#440011'} />

      <rect x="3" y="7" width="1" height="1" fill={filled ? '#cc0033' : '#330008'} />
      <rect x="4" y="7" width="1" height="1" fill={filled ? '#cc0033' : '#330008'} />
    </svg>
  );

  return (
    <div className={`flex gap-1 items-center ${className}`}>
      {Array.from({ length: maxHearts }).map((_, index) => (
        <PixelHeart key={index} filled={index < filledHearts} />
      ))}
    </div>
  );
}
/* SPDX-License-Identifier: AGPL-3.0-or-later
   Copyright (c) 2025 Itay Inbar
*/
