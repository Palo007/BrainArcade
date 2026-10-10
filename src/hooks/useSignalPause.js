import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuality } from '../contexts/QualityContext.jsx';
import { useBaseline } from '../contexts/BaselineContext.jsx';
import { isPageRoute, isFnirsRoute } from '../games/games.config';

// Paused time since the last take (game-over screen reads and clears it)
let pausedMs = 0;
let pausedAt = null;
export function takePausedSec() {
  const now = Date.now();
  const total = pausedMs + (pausedAt ? now - pausedAt : 0);
  pausedMs = 0;
  if (pausedAt) pausedAt = now;
  return total / 1000;
}

/**
 * True exactly when FrontalPauseOverlay is visible: same 1.5 s debounce, same
 * route rules (game page, not fNIRS) and suppressed during the baseline modal.
 */
export function useSignalPause(started = true) {
  // Count only from START on: pauses while fitting the headband do not count against the round
  useEffect(() => { if (started) takePausedSec(); }, [started]);
  const { frontalBad } = useQuality();
  const { pathname } = useLocation();
  const { visible: baselineVisible } = useBaseline();
  const active = pathname.startsWith('/game/') && !isPageRoute(pathname) && !isFnirsRoute(pathname);
  const bad = active && !!frontalBad;

  const [visible, setVisible] = useState(false);
  const [since, setSince] = useState(Date.now());

  // Restart the debounce clock whenever the bad/good state flips
  useEffect(() => { setSince(Date.now()); }, [bad]);

  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - since > 1500) setVisible(bad);
    }, 200);
    return () => clearInterval(id);
  }, [bad, since]);

  // Track how long the overlay was up, for the round's validity check
  const isPaused = active && visible && !baselineVisible;
  useEffect(() => {
    if (!isPaused) return;
    pausedAt = Date.now();
    return () => {
      if (pausedAt) pausedMs += Date.now() - pausedAt;
      pausedAt = null;
    };
  }, [isPaused]);

  return isPaused;
}
