/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Phone → PC EEG relay + diagnostics log sink, on WebSocket path /relay.
// Used by tools/arcade-server.mjs and by the Vite dev server (vite.config.js).
// Client side: src/lib/relaySocket.js
//
// Messages (JSON):
//   {t:'hello', role, page}          page says who it is (role: 'phone' | 'pc' | 'page')
//   {t:'eeg', from, ch, opt, seq}    EEG batch from the phone → sent to every other page
//   {t:'log', events:[{ts, ev, d}]}  diagnostics events → written to the log file
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PING_MS = 5000; // server → client ws ping
const DEAD_MS = 15000; // no pong for this long → drop the socket
const STATS_MS = 10000; // relay throughput summary interval

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
const day = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function createLogger(logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  let file = null;
  let stream = null;
  const write = (source, event, data) => {
    const now = new Date();
    const want = path.join(logDir, `arcade-${day(now)}.log`);
    if (want !== file) {
      stream?.end();
      file = want;
      stream = fs.createWriteStream(file, { flags: 'a' });
    }
    const tail = data === undefined ? '' : ' ' + (typeof data === 'string' ? data : JSON.stringify(data));
    const line = `${stamp(now)} [${source}] ${event}${tail}`;
    stream.write(line + '\n');
    if (process.env.ARCADE_LOG_QUIET !== '1' && source !== 'logcat') console.log(line);
  };
  write.file = () => file;
  return write;
}

export function attachRelay(httpServer, log) {
  const wss = new WebSocketServer({ noServer: true });
  let nextId = 1;

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/relay')) return; // leave other upgrades (e.g. Vite HMR) alone
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    ws.id = nextId++;
    ws.role = 'page';
    ws.label = `#${ws.id}`;
    ws.alive = Date.now();
    ws.stats = { eegMsgs: 0, samples: 0, bytes: 0, seqGaps: 0, lastSeq: null };
    log('server', 'ws-open', { id: ws.id, ua: req.headers['user-agent']?.slice(0, 80) });

    ws.on('pong', () => (ws.alive = Date.now()));
    ws.on('message', (buf) => {
      ws.alive = Date.now();
      let msg;
      try {
        msg = JSON.parse(buf);
      } catch {
        return;
      }
      if (msg.t === 'eeg') {
        const s = ws.stats;
        s.eegMsgs++;
        s.bytes += buf.length;
        s.samples += msg.ch?.[0]?.length || 0;
        if (s.lastSeq !== null && msg.seq !== s.lastSeq + 1) s.seqGaps++;
        s.lastSeq = msg.seq;
        const out = buf.toString();
        for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(out);
      } else if (msg.t === 'hello') {
        ws.role = msg.role || 'page';
        ws.label = `${ws.role}#${ws.id}`;
        log('server', 'hello', { id: ws.id, role: ws.role, page: msg.page, reloaded: msg.nav });
      } else if (msg.t === 'log' && Array.isArray(msg.events)) {
        for (const e of msg.events) {
          const lag = e.ts ? Date.now() - e.ts : undefined; // > 1000 → event was queued while offline
          log(ws.label, e.ev, lag > 1000 ? { ...e.d, queuedMs: lag } : e.d);
        }
      }
    });
    ws.on('close', (code, reason) =>
      log('server', 'ws-close', { who: ws.label, code, reason: reason?.toString() || undefined })
    );
    ws.on('error', (err) => log('server', 'ws-error', { who: ws.label, err: err.message }));
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (now - ws.alive > DEAD_MS) {
        log('server', 'ws-dead', { who: ws.label, silentMs: now - ws.alive });
        ws.terminate();
        continue;
      }
      try {
        ws.ping();
      } catch {
        // socket already closing
      }
    }
  }, PING_MS);

  let statsAt = Date.now();
  const statsTimer = setInterval(() => {
    const secs = (Date.now() - statsAt) / 1000;
    statsAt = Date.now();
    for (const ws of wss.clients) {
      const s = ws.stats;
      if (!s.eegMsgs) continue;
      log('server', 'relay-rate', {
        from: ws.label,
        msgsPerS: +(s.eegMsgs / secs).toFixed(1),
        samplesPerS: Math.round(s.samples / secs),
        kBps: +(s.bytes / secs / 1024).toFixed(1),
        seqGaps: s.seqGaps,
        listeners: wss.clients.size - 1,
      });
      Object.assign(s, { eegMsgs: 0, samples: 0, bytes: 0, seqGaps: 0 });
    }
  }, STATS_MS);

  httpServer.on('close', () => {
    clearInterval(timer);
    clearInterval(statsTimer);
  });
  return wss;
}
