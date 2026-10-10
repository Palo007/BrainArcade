// SPDX-License-Identifier: AGPL-3.0-or-later
// Fetch + decode sprite variants up front, so a src swap (happy -> worried) never shows a blank frame on a slow phone.
// The Image objects are kept alive here so the browser does not drop them from its memory cache.
const keep = [];

export function preloadImages(...srcs) {
  for (const src of srcs) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    img.decode?.().catch(() => {});
    keep.push(img);
  }
}
