// Per-child calibration preferences in localStorage: { byChild: { [childId]: { autoSkip: boolean } } }.
// autoSkip: games start after a ~2 s skip instead of the eyes-closed / eyes-open calibration
// (RECALIBRATE buttons still run the full calibration).
import { getActiveProfileId } from './profiles.js';

// SKIP: no eyes-closed / eyes-open tasks. Bands from the saved alpha peak (if any), baseline from the
// live band powers, which already average the last ~8 s of EEG. 2 s = a few snapshots of that average.
export const SKIP_SECONDS = 2;

export const CAL_PREFS_KEY = 'brainarcade.calPrefs';

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(CAL_PREFS_KEY) || 'null');
    return o && typeof o.byChild === 'object' && o.byChild ? o : { byChild: {} };
  } catch {
    return { byChild: {} };
  }
}

export function getAutoSkip(childId = getActiveProfileId()) {
  return read().byChild[childId]?.autoSkip === true;
}

export function setAutoSkip(on, childId = getActiveProfileId()) {
  const o = read();
  o.byChild[childId] = { ...o.byChild[childId], autoSkip: !!on };
  try { localStorage.setItem(CAL_PREFS_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ }
}
