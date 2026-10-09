/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Muse S Athena (Gen 3) adapter.
// Wraps muse-jsx MuseAthenaClient so it looks like a web-muse device to MuseContext:
//   - state: 0 disconnected, 1 connecting, 2 connected
//   - eeg: array of circular buffers [TP9, AF7, AF8, TP10, AUX] in microvolts @ 256 Hz
//   - disconnect()
//   - fnirs: FnirsProcessor fed by the optics stream (presets with optics, e.g. p1034)
import { MuseAthenaClient, MUSE_SERVICE } from 'muse-jsx';
import { MuseCircularBuffer } from 'web-muse/src/lib/CircularBuffer.js';
import { RelaySender } from './phoneRelay.js';
import { FnirsProcessor } from './fnirs.js';
import { diag, initDiag } from './diagLog.js';

const MAX_GATT_ATTEMPTS = 3;
const GATT_SETTLE_MS = 500;
const GATT_RETRY_MS = 1000;
const RECONNECT_ATTEMPTS = 20; // after an unexpected drop; back-off 1..5 s → ~1.5 min total
const GAP_LOG_MS = 500; // EEG notification gap worth logging
const STALL_RESUME_MS = 3000; // no EEG this long (link still up) → resend the stream command
const STALL_RECONNECT_MS = 12000; // still nothing → drop the link and reconnect
const HEARTBEAT_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BUFFER_SIZE = 256;
const CHANNELS = 5;
const FS = 256;
const HIGHPASS_HZ = 1; // removes DC offset + slow electrode drift
const NOTCH_HZ = 50; // EU mains hum
const NOTCH_Q = 10;
const STATS_WINDOW = FS * 2; // samples kept for window.__athena.stats()

// RBJ audio-EQ-cookbook biquad, direct form I
function biquad(type, f0, q) {
  const w0 = (2 * Math.PI * f0) / FS;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  let b;
  if (type === 'highpass') b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else b = [1, -2 * cos, 1]; // notch
  const c = { b0: b[0] / a0, b1: b[1] / a0, b2: b[2] / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const step = (x) => {
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
  // Start in steady state for a constant input (avoids a huge step on the first sample)
  step.prime = (x) => {
    x1 = x2 = x;
    y1 = y2 = type === 'highpass' ? 0 : x;
  };
  return step;
}

export class MuseAthenaDevice {
  constructor() {
    this.client = new MuseAthenaClient();
    this.eeg = Array.from({ length: CHANNELS }, () => new MuseCircularBuffer(BUFFER_SIZE));
    this.state = 0;
    this.mock = false;
    this.profile = 'athena'; // see deviceProfile.js
    this._filters = Array.from({ length: CHANNELS }, () => ({
      primed: false,
      hp: biquad('highpass', HIGHPASS_HZ, Math.SQRT1_2),
      notch: biquad('notch', NOTCH_HZ, NOTCH_Q),
    }));
    this._raw = Array.from({ length: CHANNELS }, () => []);
    this._out = Array.from({ length: CHANNELS }, () => []);
    this._dropped = 0;
    this._subs = [];
    this.fnirs = new FnirsProcessor();
    this._relay = null; // created on connect: also streams to a PC page (see phoneRelay.js)
    this._device = null;
    this._preset = 'p1034';
    this._closing = false; // true when the user (not the link) ended the session
    this._reconnecting = false;
    this._lastEeg = 0;
    this._samples = 0;
    this._gaps = 0;
    this._maxGap = 0;
    this._battery = null;
    this._recTap = null; // optional recorder hooks { battery(pct), accGyro({acc, gyro}) }, see RecordingContext
    this._accSub = null; // accGyro subscription, only alive while recTap is set
    this._attached = null;
    this._lastGood = new Float64Array(CHANNELS);
    this._wakeLock = null;
    this._timers = [];
    if (typeof window !== 'undefined') window.__athena = this;
  }

  // Debug: per-channel numbers over the last 2 s (read via Chrome remote devtools)
  stats() {
    const sum = (arr) => {
      if (!arr.length) return null;
      const abs = arr.map(Math.abs).sort((a, b) => a - b);
      return {
        n: arr.length,
        min: Math.round(Math.min(...arr)),
        max: Math.round(Math.max(...arr)),
        p50abs: Math.round(abs[Math.floor(abs.length * 0.5)]),
        p99abs: Math.round(abs[Math.floor(abs.length * 0.99)]),
        over300: +(arr.filter((v) => Math.abs(v) > 300).length / arr.length).toFixed(3),
      };
    };
    return {
      dropped: this._dropped,
      channels: ['TP9', 'AF7', 'AF8', 'TP10'].map((name, ch) => ({
        name,
        raw: sum(this._raw[ch]),
        filtered: sum(this._out[ch]),
      })),
    };
  }

  get recTap() { return this._recTap; }
  set recTap(v) {
    this._recTap = v || null;
    this._syncAccSub();
  }

  // Acc/gyro are only parsed/forwarded while a recording needs them
  _syncAccSub() {
    if (!this._recTap) {
      this._accSub?.unsubscribe();
      this._accSub = null;
    } else if (!this._accSub && this._attached) {
      this._accSub = this._attached.accGyroReadings.subscribe((r) => this._recTap?.accGyro?.(r));
    }
  }

  _push(ch, rawV) {
    const f = this._filters[ch];
    if (!f.primed) {
      f.hp.prime(rawV);
      f.primed = true;
    }
    const v = f.notch(f.hp(rawV));
    const buf = this.eeg[ch];
    if (buf.isFull) this._dropped++;
    buf.write(v);
    const r = this._raw[ch], o = this._out[ch];
    r.push(rawV);
    o.push(v);
    if (r.length > STATS_WINDOW) { r.shift(); o.shift(); }
    return v;
  }

  // Windows Web Bluetooth often drops the GATT link right after connect().
  // Pick the device ourselves, then connect + fetch the service with retries.
  async _connectGatt() {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [MUSE_SERVICE], namePrefix: 'Muse' }],
      optionalServices: [MUSE_SERVICE],
    });
    this._device = device;
    diag('ble-device-picked', { name: device.name });
    return this._openGatt(MAX_GATT_ATTEMPTS);
  }

  async _openGatt(attempts) {
    const device = this._device;
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (this._closing) throw new Error('Cancelled');
      try {
        const gatt = device.gatt.connected ? device.gatt : await device.gatt.connect();
        await sleep(GATT_SETTLE_MS);
        if (!gatt.connected) throw new Error('GATT dropped after connect');
        await gatt.getPrimaryService(MUSE_SERVICE);
        diag('ble-gatt-ok', { attempt });
        return gatt;
      } catch (err) {
        lastErr = err;
        diag('ble-gatt-fail', { attempt, of: attempts, err: String(err?.message || err) });
        try {
          device.gatt.disconnect();
        } catch {
          // ignore
        }
        await sleep(Math.min(GATT_RETRY_MS * attempt, 5000));
      }
    }
    throw lastErr;
  }

  // Wire a (new) MuseAthenaClient to our buffers, relay and link-loss handler
  _attach(client) {
    this._subs.forEach((s) => s.unsubscribe());
    this._accSub?.unsubscribe();
    this._accSub = null;
    this._attached = client;
    this._subs = [
      client.eegReadings.subscribe((reading) => {
        const ch = reading.electrode;
        if (ch < 0 || ch >= CHANNELS) return;
        if (ch === 0) {
          const now = Date.now();
          const gap = this._lastEeg ? now - this._lastEeg : 0;
          if (gap > GAP_LOG_MS) {
            this._gaps++;
            diag('ble-gap', { ms: gap, visible: document.visibilityState });
          }
          if (gap > this._maxGap) this._maxGap = gap;
          this._lastEeg = now;
          this._samples += reading.samples.length;
        }
        // Non-finite sample: push the last good value (or 0) so every channel keeps the same sample count
        const lg = this._lastGood;
        for (const v of reading.samples) {
          if (Number.isFinite(v)) lg[ch] = v;
          this._relay.push(ch, this._push(ch, lg[ch]));
        }
      }),
      client.opticalReadings.subscribe((reading) => {
        this.fnirs.push(reading.samples);
        this._relay.pushOptics(reading.samples);
      }),
      client.batteryData.subscribe((b) => {
        this._battery = b;
        this.recTap?.battery?.(b?.values?.[0]);
      }),
      client.connectionStatus.subscribe((connected) => {
        if (connected || this._closing || this._reconnecting) return;
        if (this.state === 2) {
          diag('ble-link-lost', { visible: document.visibilityState, lastEegAgoMs: Date.now() - this._lastEeg });
          this._reconnect();
        }
      }),
    ];
    this._syncAccSub();
  }

  async _startStream(gatt) {
    this.client = new MuseAthenaClient();
    await this.client.connect(gatt);
    this._attach(this.client);
    await this.client.start(this._preset);
    this._filters.forEach((f) => (f.primed = false)); // the DC level may have moved while offline
    this._lastEeg = Date.now();
  }

  // Unexpected drop: reconnect to the same headband without asking the user again
  async _reconnect() {
    if (this._reconnecting || this._closing) return;
    this._reconnecting = true;
    this.state = 1; // MuseContext only leaves the game on state 0
    const t0 = Date.now();
    try {
      for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !this._closing; attempt++) {
        try {
          const gatt = await this._openGatt(1);
          await this._startStream(gatt);
          this.state = 2;
          diag('ble-reconnected', { attempt, afterMs: Date.now() - t0 });
          return;
        } catch (err) {
          diag('ble-reconnect-fail', { attempt, err: String(err?.message || err) });
          await sleep(Math.min(1000 * attempt, 5000));
        }
      }
      diag('ble-reconnect-gave-up', { afterMs: Date.now() - t0 });
      this.disconnect();
    } finally {
      this._reconnecting = false;
    }
  }

  // Keep the phone screen on: when it turns off, Android (HyperOS "Greeze") freezes
  // Chrome and the Bluetooth stream stops
  async _keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || this._wakeLock) return;
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      diag('wakelock-on');
      this._wakeLock.addEventListener('release', () => {
        this._wakeLock = null;
        diag('wakelock-released');
      });
    } catch (err) {
      diag('wakelock-fail', { err: String(err?.message || err) });
    }
  }

  _startMonitors() {
    this._onVisible = () => {
      if (document.visibilityState === 'visible' && this.state !== 0) this._keepAwake();
    };
    document.addEventListener('visibilitychange', this._onVisible);
    let lastResume = 0;
    this._timers.push(
      setInterval(() => {
        if (this.state !== 2 || this._reconnecting) return;
        const silent = Date.now() - this._lastEeg;
        if (silent > STALL_RECONNECT_MS) {
          diag('ble-stall-reconnect', { silentMs: silent });
          try {
            this._device?.gatt.disconnect(); // fresh link; _reconnect() ignores the drop event
          } catch {
            // ignore
          }
          this._reconnect();
        } else if (silent > STALL_RESUME_MS && Date.now() - lastResume > STALL_RESUME_MS) {
          lastResume = Date.now();
          diag('ble-stall-resume', { silentMs: silent, gatt: !!this.client.gatt?.connected });
          this.client.resume().catch((e) => diag('ble-resume-fail', { err: String(e?.message || e) }));
        }
      }, 1000),
      setInterval(() => {
        diag('phone-heartbeat', {
          state: this.state,
          samplesPerS: Math.round(this._samples / (HEARTBEAT_MS / 1000)),
          gaps: this._gaps,
          maxGapMs: this._maxGap,
          dropped: this._dropped,
          visible: document.visibilityState,
          wakeLock: !!this._wakeLock,
          battery: this._battery ? JSON.stringify(this._battery).slice(0, 80) : undefined,
        });
        this._samples = this._gaps = this._maxGap = 0;
      }, HEARTBEAT_MS)
    );
  }

  async connect(preset = 'p1034') {
    initDiag('phone');
    this._preset = preset;
    this._closing = false;
    this.state = 1;
    diag('ble-connect-start', { preset });
    try {
      const gatt = await this._connectGatt();
      this._relay = new RelaySender();
      await this._startStream(gatt);
      this.state = 2;
      diag('ble-streaming', { name: this._device?.name });
      this._startMonitors();
      this._keepAwake();
    } catch (err) {
      diag('ble-connect-fail', { err: String(err?.message || err) });
      this.disconnect();
      throw err;
    }
    return this;
  }

  _markDisconnected() {
    this._relay?.stop();
    this._subs.forEach((s) => s.unsubscribe());
    this._subs = [];
    this._accSub?.unsubscribe();
    this._accSub = null;
    this._attached = null;
    this._timers.forEach(clearInterval);
    this._timers = [];
    if (this._onVisible) document.removeEventListener('visibilitychange', this._onVisible);
    this._wakeLock?.release().catch(() => {});
    this._wakeLock = null;
    this.state = 0;
  }

  disconnect() {
    if (this.state !== 0) diag('ble-disconnect', { byUser: !this._reconnecting });
    this._closing = true;
    try {
      this.client.disconnect();
    } catch (e) {
      console.warn('Athena disconnect error:', e);
    }
    this._markDisconnected();
  }
}

export const connectMuseAthena = async (preset = 'p1034') => {
  const device = new MuseAthenaDevice();
  await device.connect(preset);
  return device;
};
