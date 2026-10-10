/* SPDX-License-Identifier: AGPL-3.0-or-later */
// HR-FALLBACK-HOOK
// Heart rate estimated from the optics (PPG) when the recording has no Heart_Rate values
// (older BrainArcade recordings, Mind Monitor files without HR).
//
// Called by viewer/csvWorker.js (inside the worker) only when Heart_Rate is empty and Optics exist.
// Contract:
//   input  optics = { t: Float64Array (s), n, cols: { Optics1: Float32Array, ... } }   (~64 Hz, held rows deduplicated)
//          fs     = nominal optics rate (OPTICS_FS = 64)
//   output { t: Float64Array, v: Float32Array } in BPM (NaN = no reliable pulse), or null = not available.
// The viewer labels the result "HR (estimated from optics)".
//
// Same estimator as the live recorder (src/lib/heartRate.js), replayed over the file; one value per second.
import { HeartRateEstimator } from '../../lib/heartRate.js';

const hasData = (a) => {
  if (!a) return false;
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && a[i] !== 0) return true;
  return false;
};

export function estimateHeartRateFromOptics(optics, fs = 64) {
  if (!optics || !optics.n || !optics.t) return null;
  const nCh = hasData(optics.cols.Optics5) ? 8 : 4; // p1034 = 8 channels, p1035 = 4
  const cols = [];
  for (let k = 1; k <= nCh; k++) {
    const c = optics.cols[`Optics${k}`];
    if (!c) return null;
    cols.push(c);
  }
  const est = new HeartRateEstimator({ fs });
  const v = new Array(nCh);
  const outT = [];
  const outV = [];
  let nextT = -Infinity;
  for (let i = 0; i < optics.n; i++) {
    for (let k = 0; k < nCh; k++) v[k] = cols[k][i];
    const bpm = est.push(v, optics.t[i] * 1000);
    if (optics.t[i] >= nextT) {
      nextT = optics.t[i] + 1;
      outT.push(optics.t[i]);
      outV.push(bpm === null ? NaN : bpm);
    }
  }
  if (!outV.some(Number.isFinite)) return null;
  return { t: Float64Array.from(outT), v: Float32Array.from(outV) };
}
