/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Phone → PC EEG relay over our own WebSocket (src/lib/relaySocket.js ↔ tools/relay-hub.mjs).
// Phone: the Athena adapter feeds filtered samples into a RelaySender.
// PC: connectMusePhoneRelay() returns a web-muse-style device fed by those samples.
// Short gaps (Wi-Fi adb hiccup, Bluetooth reconnect on the phone) do NOT drop the PC
// connection; only a long silence (GIVE_UP_MS) does.
import { MuseCircularBuffer } from 'web-muse/src/lib/CircularBuffer.js';
import { FnirsProcessor } from './fnirs.js';
import { startRelay, relaySend, onRelay } from './relaySocket.js';
import { diag, initDiag } from './diagLog.js';

export { relayAvailable } from './relaySocket.js';

const CHANNELS = 4;
const FLUSH_MS = 50;
const BUFFER_SIZE = 256;
const FIRST_DATA_TIMEOUT_MS = 15000;
const STALL_MS = 1000; // no packets for this long → log a stall (connection kept)
const GIVE_UP_MS = 60000; // no packets for this long → disconnected
const MAX_BACKLOG = 256 * 2; // samples kept per channel while the socket is down (2 s)

// Unique per page, so a page never consumes its own packets
const PAGE_ID = Math.random().toString(36).slice(2);

export class RelaySender {
  constructor() {
    startRelay();
    this._pending = Array.from({ length: CHANNELS }, () => []);
    this._optics = [];
    this._imu = null; // latest acc/gyro reading, sent with the next packet
    this._bat = null; // latest headband battery %, sent with the next packet
    this._name = null; // headband name (e.g. MuseS-0923), sent with every packet
    this._seq = 0;
    this._dropped = 0;
    this._timer = setInterval(() => this._flush(), FLUSH_MS);
  }

  push(ch, v) {
    if (this._timer && ch < CHANNELS) this._pending[ch].push(Math.round(v * 100) / 100);
  }

  // Raw optics sample (fNIRS); the PC page runs its own FnirsProcessor
  pushOptics(sample) {
    if (this._timer) this._optics.push(Array.from(sample, (v) => Math.round(v * 1e5) / 1e5));
  }

  // Latest motion reading {acc, gyro}; the PC recorder only needs the newest one
  pushAccGyro(r) {
    if (this._timer && r) this._imu = { acc: r.acc, gyro: r.gyro };
  }

  pushBattery(pct) {
    if (this._timer && Number.isFinite(pct)) this._bat = Math.round(pct * 100) / 100;
  }

  setName(name) {
    this._name = name || null;
  }

  _flush() {
    if (this._pending.every((p) => p.length === 0) && !this._optics.length) return;
    const msg = { t: 'eeg', from: PAGE_ID, seq: this._seq, ch: this._pending, opt: this._optics };
    if (this._imu) msg.imu = this._imu;
    if (this._bat !== null) msg.bat = this._bat;
    if (this._name) msg.name = this._name;
    const sent = relaySend(msg);
    if (!sent) {
      // Socket down: keep the newest 2 s, so the PC gets a short catch-up after reconnect
      for (const p of this._pending) if (p.length > MAX_BACKLOG) this._dropped += p.splice(0, p.length - MAX_BACKLOG).length;
      if (this._optics.length > 64) this._optics.splice(0, this._optics.length - 64);
      return;
    }
    this._seq++;
    if (this._dropped) {
      diag('relay-backlog-dropped', { samples: this._dropped });
      this._dropped = 0;
    }
    this._pending = Array.from({ length: CHANNELS }, () => []);
    this._optics = [];
    this._imu = null;
    this._bat = null;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

class PhoneRelayDevice {
  constructor() {
    this.eeg = Array.from({ length: CHANNELS + 1 }, () => new MuseCircularBuffer(BUFFER_SIZE));
    this.state = 0;
    this.mock = false;
    this.profile = 'athena'; // phone sends already-filtered Athena samples
    this.fnirs = new FnirsProcessor();
    this.stalled = false;
    this.recTap = null; // optional recorder hooks { battery(pct), accGyro({acc, gyro}) }, see RecordingContext
    this._battery = null; // same shape as the Athena adapter: { values: [pct] }
    this._device = null; // { name } of the headband on the phone, for the recording header
    this._lastPacket = 0;
    this._lastSeq = null;
    this._stallStart = 0;
    this._samples = 0;
    this._onData = (data) => {
      if (!data || data.from === PAGE_ID || !Array.isArray(data.ch)) return;
      const now = Date.now();
      if (this.stalled) {
        this.stalled = false;
        diag('pc-stall-end', { ms: now - this._stallStart });
      }
      if (this._lastSeq !== null && data.seq !== this._lastSeq + 1) {
        diag('pc-seq-gap', { expected: this._lastSeq + 1, got: data.seq });
      }
      this._lastSeq = data.seq;
      this._lastPacket = now;
      this._samples += data.ch[0]?.length || 0;
      data.ch.forEach((samples, ch) => samples.forEach((v) => this.eeg[ch].write(v)));
      if (Array.isArray(data.opt)) data.opt.forEach((sample) => this.fnirs.push(sample));
      if (data.imu) this.recTap?.accGyro?.(data.imu);
      if (Number.isFinite(data.bat)) {
        this._battery = { values: [data.bat] };
        this.recTap?.battery?.(data.bat);
      }
      if (data.name && this._device?.name !== data.name) this._device = { name: data.name };
    };
    this._off = null;
    this._watchdog = null;
    this._rateTimer = null;
  }

  async connect() {
    initDiag('pc');
    this.state = 1;
    this._off = onRelay('eeg', this._onData);
    diag('pc-relay-connect');
    const start = Date.now();
    while (!this._lastPacket) {
      if (Date.now() - start > FIRST_DATA_TIMEOUT_MS) {
        diag('pc-relay-no-data');
        this.disconnect();
        throw new Error('No data from phone. Connect the Muse on the phone first and keep that page open.');
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    this.state = 2;
    diag('pc-relay-connected');
    this._watchdog = setInterval(() => {
      const silent = Date.now() - this._lastPacket;
      if (silent > STALL_MS && !this.stalled) {
        this.stalled = true;
        this._stallStart = this._lastPacket;
        diag('pc-stall-start');
      }
      if (silent > GIVE_UP_MS) {
        diag('pc-give-up', { silentMs: silent });
        this.disconnect();
      }
    }, 250);
    this._rateTimer = setInterval(() => {
      diag('pc-heartbeat', { samplesPerS: Math.round(this._samples / 10), stalled: this.stalled });
      this._samples = 0;
    }, 10000);
    return this;
  }

  disconnect() {
    this._off?.();
    this._off = null;
    clearInterval(this._watchdog);
    clearInterval(this._rateTimer);
    this._watchdog = this._rateTimer = null;
    if (this.state !== 0) diag('pc-relay-disconnect');
    this.state = 0;
  }
}

export const connectMusePhoneRelay = async () => new PhoneRelayDevice().connect();
