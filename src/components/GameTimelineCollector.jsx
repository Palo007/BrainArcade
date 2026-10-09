/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { useSessionTimelineCollector } from '../hooks/useSessionTimeline.js';

// Render once inside a game page: records the 1 Hz timeline for the parent report. Renders nothing.
export function GameTimelineCollector() {
  useSessionTimelineCollector();
  return null;
}
