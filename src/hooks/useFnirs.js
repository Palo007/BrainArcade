/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { useEffect, useState, useCallback } from 'react';
import { useEEG } from '../contexts/MuseContext.jsx';

const POLL_MS = 250;

/**
 * Live fNIRS snapshot from the connected device (Muse S Athena, phone relay, or mock).
 * Returns null when the device has no optics (classic Muse).
 */
export function useFnirs() {
  const { muse } = useEEG();
  const fnirs = muse?.fnirs || null;
  const [snap, setSnap] = useState(null);

  useEffect(() => {
    if (!fnirs) {
      setSnap(null);
      return undefined;
    }
    const id = setInterval(() => setSnap(fnirs.snapshot()), POLL_MS);
    return () => clearInterval(id);
  }, [fnirs]);

  const resetBaseline = useCallback(() => fnirs?.resetBaseline(), [fnirs]);

  return { supported: !!fnirs, data: snap, resetBaseline };
}
