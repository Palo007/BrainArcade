// Node check for src/lib/phoneRelay.js: battery, acc/gyro and headband name reach the PC recorder.
// Run: node tools/test-phoneRelay.mjs
// A fake WebSocket "hub" delivers every sent message to every open socket (like tools/relay-hub.mjs).
const sockets = new Set();
class FakeWebSocket {
  constructor() {
    this.readyState = 0;
    this.bufferedAmount = 0;
    sockets.add(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data) {
    // Phone and PC run in this one process (same PAGE_ID): mark packets as coming from another page
    const m = JSON.parse(data);
    if (m.from) m.from = 'phone-page';
    data = JSON.stringify(m);
    for (const s of sockets) setTimeout(() => s.onmessage?.({ data }), 0);
  }
  close() {}
}
globalThis.WebSocket = FakeWebSocket;
globalThis.location = { hostname: 'localhost', protocol: 'http:', host: 'localhost:5180', pathname: '/' };
globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.document ??= { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };

const { RelaySender, connectMusePhoneRelay } = await import('../src/lib/phoneRelay.js');

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Phone side
const sender = new RelaySender();
sender.setName('MuseS-0923');
const feed = setInterval(() => {
  for (let ch = 0; ch < 4; ch++) sender.push(ch, 1);
}, 10);
await sleep(100);

// PC side
const pc = await connectMusePhoneRelay();
const got = { bat: [], imu: [] };
pc.recTap = { battery: (p) => got.bat.push(p), accGyro: (r) => got.imu.push(r) };

sender.pushAccGyro({ acc: { x: 0.1, y: 0.2, z: 0.97 }, gyro: { x: 1, y: -2, z: 3 } });
sender.pushBattery(30.69921875);
await sleep(200);

check('battery reaches PC recTap', got.bat.length === 1 && got.bat[0] === 30.7, JSON.stringify(got.bat));
check('PC device keeps _battery like the Athena adapter', pc._battery?.values?.[0] === 30.7);
check('acc/gyro reaches PC recTap', got.imu.length === 1 && got.imu[0].acc.z === 0.97 && got.imu[0].gyro.y === -2);
check('headband name reaches PC device', pc._device?.name === 'MuseS-0923');

// Latest values are sent once, not repeated in every packet
await sleep(200);
check('battery not repeated', got.bat.length === 1, `n=${got.bat.length}`);
check('acc/gyro not repeated', got.imu.length === 1, `n=${got.imu.length}`);

clearInterval(feed);
sender.stop();
pc.disconnect();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
