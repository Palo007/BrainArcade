/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Head motion from the headband accelerometer + gyro (Athena: ~52 readings/s; PC relay: max 20/s).
// MotionTracker turns readings { timestamp, acc: {x,y,z} (g), gyro: {x,y,z} (°/s) } into one
// snapshot, read 4 times per second by MotionContext:
//   state     'still' | 'moving' | 'bigMove' | 'missing'
//   gyroDps   fastest head turn since the last snapshot, °/s
//   tiltDeg   angle between gravity now and gravity in the reference pose (null without one)
//   pitch/roll in degrees. The axis names are not checked on a head: use them relative only.
// The state limits are labels, not game limits: games and reports set their own limits
// (MOTION-SENSOR-USES.html; real limits come from the child test day).

export const IMU_HZ = 52; // Athena acc/gyro rate (diag imuPerS ≈ 51)
export const MOVING_DPS = 20; // first guess: EEG noise rose above ~15 °/s in the 10 Oct files
export const BIG_MOVE_DPS = 60;
export const HANG_MS = 500; // a state stays this long after the last fast reading, so it does not flicker
export const STALE_MS = 1000; // no reading (or only missing gyro) for this long = 'missing'
export const REF_STILL_MS = 2000; // automatic reference pose after this long still
const GRAVITY_TAU_S = 0.5; // low-pass for the gravity direction (tilt)
const MAX_DT_S = 0.25; // a gap longer than this restarts the low-pass

const DEG = 180 / Math.PI;

// The muse-jsx parser writes 0 for a missing gyro entry: exact 0,0,0 is "missing", not "perfectly still"
export const gyroMissing = (g) => !g || (g.x === 0 && g.y === 0 && g.z === 0);

function angleBetween(a, b) {
  const na = Math.hypot(a.x, a.y, a.z);
  const nb = Math.hypot(b.x, b.y, b.z);
  if (!na || !nb) return null;
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb);
  return Math.acos(Math.min(1, Math.max(-1, c))) * DEG;
}

export class MotionTracker {
  constructor() {
    this._g = null; // low-passed gravity {x,y,z}
    this._t = null; // time of the last reading (ms), spread inside a packet
    this._lastAt = null; // last reading with a gyro value
    this._lastAnyAt = null; // last reading of any kind
    this._lastMoveAt = -Infinity;
    this._lastBigAt = -Infinity;
    this._peak = 0;
    this._ref = null; // reference gravity {x,y,z}
    this._autoRef = true;
    this._count = 0; // readings since the last snapshot
    this._missing = 0; // of them without a gyro value
    this._snapAt = null;
    this._stillSince = null;
  }

  push(r) {
    if (!r?.acc) return;
    // Readings of one BLE packet share one timestamp: spread them at the nominal rate
    let t = Number.isFinite(r.timestamp) ? r.timestamp : Date.now();
    if (this._t !== null && t <= this._t) t = this._t + 1000 / IMU_HZ;
    const dt = this._t === null ? null : (t - this._t) / 1000;
    this._t = t;
    this._lastAnyAt = t;
    this._count++;

    const a = r.acc;
    if (![a.x, a.y, a.z].every(Number.isFinite)) return;
    if (!this._g || dt === null || dt > MAX_DT_S) {
      this._g = { x: a.x, y: a.y, z: a.z };
    } else {
      const k = 1 - Math.exp(-dt / GRAVITY_TAU_S);
      this._g.x += (a.x - this._g.x) * k;
      this._g.y += (a.y - this._g.y) * k;
      this._g.z += (a.z - this._g.z) * k;
    }

    if (gyroMissing(r.gyro)) {
      this._missing++;
      return;
    }
    this._lastAt = t;
    const dps = Math.hypot(r.gyro.x, r.gyro.y, r.gyro.z);
    if (dps > this._peak) this._peak = dps;
    if (dps > MOVING_DPS) {
      this._lastMoveAt = t;
      this._stillSince = null;
    } else if (this._stillSince === null) {
      this._stillSince = t;
    }
    if (dps > BIG_MOVE_DPS) this._lastBigAt = t;
  }

  // Save the current head pose as the reference (for example at calibration). Stops the automatic one.
  setReference() {
    if (!this._g) return false;
    this._ref = { ...this._g };
    this._autoRef = false;
    return true;
  }

  // Back to the automatic reference: a new one after the next 2 s of stillness
  clearReference() {
    this._ref = null;
    this._autoRef = true;
    this._stillSince = null;
  }

  stateAt(now) {
    if (this._lastAt === null || now - this._lastAt > STALE_MS) return 'missing';
    if (now - this._lastBigAt < HANG_MS) return 'bigMove';
    if (now - this._lastMoveAt < HANG_MS) return 'moving';
    return 'still';
  }

  snapshot(now = Date.now()) {
    const state = this.stateAt(now);
    // Automatic reference: the first 2 s of stillness after the start
    if (this._autoRef && !this._ref && state === 'still' && this._stillSince !== null && now - this._stillSince >= REF_STILL_MS) {
      this._ref = { ...this._g };
    }
    const g = this._g;
    const span = this._snapAt === null ? null : (now - this._snapAt) / 1000;
    const snap = {
      available: this._lastAnyAt !== null && now - this._lastAnyAt <= STALE_MS,
      state,
      gyroDps: Math.round(this._peak * 10) / 10,
      pitch: g ? Math.round(Math.atan2(g.x, Math.hypot(g.y, g.z)) * DEG) : null,
      roll: g ? Math.round(Math.atan2(g.y, g.z) * DEG) : null,
      tiltDeg: g && this._ref ? Math.round(angleBetween(g, this._ref)) : null,
      hasRef: !!this._ref,
      ratePerS: span ? Math.round(this._count / span) : null,
      gyroMissingShare: this._count ? Math.round((this._missing / this._count) * 100) / 100 : 0,
    };
    this._peak = 0;
    this._count = this._missing = 0;
    this._snapAt = now;
    return snap;
  }
}

export const NO_MOTION = Object.freeze({
  available: false,
  state: 'missing',
  gyroDps: 0,
  pitch: null,
  roll: null,
  tiltDeg: null,
  hasRef: false,
  ratePerS: null,
  gyroMissingShare: 0,
});
