/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Brain Arcade "stable" server for phone + PC play.
//   - serves the production build (dist/) on http://localhost:5180
//     (no Vite HMR client → the page is never auto-reloaded, which killed the BLE link)
//   - EEG relay + diagnostics log on ws://localhost:5180/relay (tools/relay-hub.mjs)
//   - keeps adb alive: reconnects wireless adb, restores `adb reverse tcp:5180 tcp:5180`
//   - captures a filtered phone logcat (Bluetooth, Chrome, adb, app freezer) into the same log
// Log file: logs/arcade-YYYY-MM-DD.log
//
// Usage: npm run arcade            (build + serve)
//        node tools/arcade-server.mjs   (serve existing dist/)
// Env:   ARCADE_PORT (5180), ADB (adb), ADB_SERIAL (auto), ARCADE_NO_ADB=1
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { attachRelay, createLogger } from './relay-hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.env.ARCADE_DIST || path.join(ROOT, 'dist'));
const PORT = Number(process.env.ARCADE_PORT || 5180);
const ADB = process.env.ADB || 'adb';
const ADB_POLL_MS = 5000;

const log = createLogger(path.join(ROOT, 'logs'));

// ---------- static file server ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html'); // SPA fallback
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});

attachRelay(server, log);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run: npm run build');
  process.exit(1);
}
server.listen(PORT, '127.0.0.1', () => {
  log('server', 'start', { url: `http://localhost:${PORT}` });
  console.log(`  Log:   ${log.file()}`);
  console.log(`\n  PC:    http://localhost:${PORT}\n  Phone: http://localhost:${PORT}  (via adb reverse)\n`);
});

// ---------- adb supervisor ----------
const adb = (args, timeout = 8000) =>
  new Promise((resolve) => {
    execFile(ADB, args, { timeout, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || '').trim(), err: err ? String(stderr || err.message).trim() : '' })
    );
  });

let serial = process.env.ADB_SERIAL || null; // last device we used
let online = null; // last known online state (for change logging)
let logcat = null;
let chromeUid = null;
let bufferSet = new Set();

// Logcat filter: keep link-level events, drop the per-packet noise (hundreds of lines / s)
const KEEP =
  /BluetoothGatt|BtGatt|bt_btm|bt_acl|btm_|bt_l2c|l2c_|gatt_|GattService|cr_Bluetooth|adbd|screen_toggled|am_kill|am_proc_died|lowmemorykiller|DeviceIdle|chromium/i;
const DROP = /adbd service requested|Advertise|onNotify|CharacteristicChanged|ScanFilter|onScanResult|bt_shim_scanner|ScanController|onBatchScan|sandboxed_process.*isolated not needed/i;

function startLogcat() {
  if (logcat || !serial) return;
  logcat = spawn(ADB, ['-s', serial, 'logcat', '-v', 'threadtime', '-T', '1'], { windowsHide: true });
  log('adb', 'logcat-start', { serial });
  let rest = '';
  logcat.stdout.on('data', (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      const freezer = chromeUid && /GreezeManager|ActionExecute|PolicyMaker/.test(line) && line.includes(chromeUid);
      if (freezer || (KEEP.test(line) && !DROP.test(line))) log('logcat', line.slice(6, 400));
    }
  });
  logcat.on('exit', (code) => {
    log('adb', 'logcat-exit', { code });
    logcat = null;
  });
}

async function pollAdb() {
  const res = await adb(['devices']);
  const devices = res.out
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === 'device')
    .map((p) => p[0]);
  if (!serial || !devices.includes(serial)) serial = devices.find((d) => d === serial) || devices[0] || serial;
  const isOnline = !!serial && devices.includes(serial);

  if (isOnline !== online) {
    log('adb', isOnline ? 'device-online' : 'device-offline', { serial, devices });
    online = isOnline;
  }
  if (!isOnline) {
    // Wireless adb (ip:port) drops when Wi-Fi sleeps → try to reconnect
    if (serial && serial.includes(':')) {
      const r = await adb(['connect', serial]);
      log('adb', 'reconnect-try', { serial, result: r.out || r.err });
    }
    return;
  }

  if (!bufferSet.has(serial)) {
    await adb(['-s', serial, 'logcat', '-G', '16M']); // bigger ring buffer for later `adb logcat -d`
    const uid = await adb(['-s', serial, 'shell', 'pm', 'list', 'packages', '-U', 'com.android.chrome']);
    chromeUid = uid.out.match(/com\.android\.chrome uid:(\d+)/)?.[1] || null;
    log('adb', 'device-info', { serial, chromeUid });
    bufferSet.add(serial);
  }

  const list = await adb(['-s', serial, 'reverse', '--list']);
  if (!list.out.includes(`tcp:${PORT}`)) {
    const r = await adb(['-s', serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
    log('adb', r.ok ? 'reverse-restored' : 'reverse-failed', { serial, port: PORT, err: r.err || undefined });
  }
  startLogcat();
}

if (process.env.ARCADE_NO_ADB !== '1') {
  const loop = async () => {
    try {
      await pollAdb();
    } catch (e) {
      log('adb', 'poll-error', { err: e.message });
    }
    setTimeout(loop, ADB_POLL_MS);
  };
  loop();
}

const shutdown = () => {
  log('server', 'stop');
  logcat?.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
