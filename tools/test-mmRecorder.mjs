// Node check for src/lib/mmRecorder.js. Run: node tools/test-mmRecorder.mjs
import { MMRecorder, HEADER, COLUMNS, bandPowerBels } from '../src/lib/mmRecorder.js';

const EXPECTED_HEADER =
  'TimeStamp,Delta_TP9,Delta_AF7,Delta_AF8,Delta_TP10,Theta_TP9,Theta_AF7,Theta_AF8,Theta_TP10,Alpha_TP9,Alpha_AF7,Alpha_AF8,Alpha_TP10,Beta_TP9,Beta_AF7,Beta_AF8,Beta_TP10,Gamma_TP9,Gamma_AF7,Gamma_AF8,Gamma_TP10,RAW_TP9,RAW_AF7,RAW_AF8,RAW_TP10,AUX_1,AUX_2,AUX_3,AUX_4,Mellow,Concentration,Accelerometer_X,Accelerometer_Y,Accelerometer_Z,Gyro_X,Gyro_Y,Gyro_Z,Optics1,Optics2,Optics3,Optics4,Optics5,Optics6,Optics7,Optics8,Optics9,Optics10,Optics11,Optics12,Optics13,Optics14,Optics15,Optics16,Heart_Rate,HeadBandOn,HSI_TP9,HSI_AF7,HSI_AF8,HSI_TP10,Battery,Elements';

let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
  if (!ok) fails++;
};

let out = '';
const rec = new MMRecorder({ onChunk: (t) => (out += t) });
const t0 = new Date(2026, 9, 10, 12, 0, 0, 0).getTime();
rec.start(t0);
rec.event('/muse/event/connected MuseS-TEST', t0);
rec.event('/Setup hands', t0); // play setup marker at recording start (RecordingContext)
const SECONDS = 4;
const N = SECONDS * 256;
for (let i = 0; i < N; i++) {
  const t = t0 + (i * 1000) / 256;
  const x = [0, 1, 2, 3].map((c) => 800 + 50 * Math.sin((2 * Math.PI * 10 * i) / 256 + c));
  if (i === 100) rec.setOptics([1, 2, 3, 4, 5, 6, 7, 8]);
  if (i === 100) rec.setAccGyro({ acc: { x: 0.1, y: 0.2, z: 0.9 }, gyro: { x: 1, y: 2, z: 3 } });
  if (i === 100) rec.setBattery(91.5);
  if (i === 100) rec.event('/Marker/1', t); // inside the first second (rows held back)
  if (i === 300) rec.event('/muse/elements/blink', t);
  rec.pushEeg(x, t);
}
rec.stop();

const lines = out.split('\n');
check('trailing newline', lines.pop() === '');
check('header byte-identical', lines[0] === EXPECTED_HEADER && HEADER === EXPECTED_HEADER);
check('61 columns', COLUMNS.length === 61);
const rows = lines.slice(1);
const events = rows.filter((r) => r.split(',').length === 61 && r.split(',').slice(1, -1).every((c) => c === ''));
const data = rows.filter((r) => !events.includes(r));
check('data rows have 60 fields (no trailing comma, like Mind Monitor), event rows 61', data.every((r) => r.split(',').length === 60) && events.every((r) => r.split(',').length === 61));
check('event rows: 4 (connected, setup, marker, blink)', events.length === 4, `got ${events.length}`);
check('setup marker is the 2nd row, before any data', rows[1].endsWith(',/Setup hands') && events[1] === rows[1]);
// Chart.php: a row with empty Delta_TP9 is an event row and must have a non-empty Elements cell
check('Chart.php: every data row has Delta_TP9', data.every((r) => r.split(',')[1] !== ''));
const tsMs = rows.map((r) => new Date(r.slice(0, 23).replace(' ', 'T')).getTime());
check('timestamps never go back', tsMs.every((v, i) => i === 0 || v >= tsMs[i - 1]));
check('event row shape (ts + 59 empty + text)', events.every((r) => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3},{60}[^,]+$/.test(r) || /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}(,){60}\S.*$/.test(r)));
check('256 data rows per simulated second', data.length === N && data.length / SECONDS === 256, `${data.length} rows`);
check('timestamp format', /^2026-10-10 12:00:00\.000,/.test(data[0]) && /^2026-10-10 12:00:00\.0\d\d,/.test(data[1]));
check('timestamps span ~4 s', data[N - 1].startsWith('2026-10-10 12:00:03.99'), data[N - 1].slice(0, 23));
const cells = data[N - 1].split(',');
const ci = (n) => COLUMNS.indexOf(n);
check('first-second rows get the first band values', data[10].split(',')[ci('Alpha_TP9')] === data[0].split(',')[ci('Alpha_TP9')] && data[0].split(',')[ci('Alpha_TP9')] !== '');
check('alpha dominates for 10 Hz sine', +cells[ci('Alpha_TP9')] > +cells[ci('Beta_TP9')] + 1 && +cells[ci('Alpha_TP9')] > +cells[ci('Delta_TP9')] + 1);
check('RAW values', cells[ci('RAW_TP9')] !== '' && cells[ci('RAW_TP10')] !== '');
check('optics 1-8 held, 9-16 empty', cells[ci('Optics8')] === '8.0000' && cells[ci('Optics9')] === '' && cells[ci('Optics16')] === '');
check('acc/gyro/battery held', cells[ci('Accelerometer_Z')] === '0.900000' && cells[ci('Gyro_Y')] === '2.000000' && cells[ci('Battery')] === '91.50');
check('empty columns', ['AUX_1', 'AUX_4', 'Mellow', 'Concentration', 'Elements'].every((n) => (cells[ci(n)] ?? '') === ''));
check('Heart_Rate empty without a pulse signal (optics test values are not a heartbeat)', (cells[ci('Heart_Rate')] ?? '') === '');
check('HSI/HeadBandOn defaults', cells[ci('HeadBandOn')] === '1' && cells[ci('HSI_AF7')] === '1');
check('no exponent notation', !/\de[-+]?\d/i.test(data.join('\n')));
// Band-power scale: 50 µV amplitude sine ~ 1250 µV² power at 10 Hz -> ~3.1 Bels
const x = Float64Array.from({ length: 256 }, (_, i) => 50 * Math.sin((2 * Math.PI * 10 * i) / 256));
const bel = bandPowerBels(x)[2];
check('alpha band power of 50 µV sine ~ log10(1250)', Math.abs(bel - Math.log10(1250)) < 0.15, bel.toFixed(3));

// Clock: background burst (late samples delivered at once) must not jump; real loss must resync
{
  let o = '';
  const r2 = new MMRecorder({ onChunk: (t) => (o += t) });
  const b0 = new Date(2026, 9, 10, 13, 0, 0, 0).getTime();
  r2.start(b0);
  let now = b0;
  for (let i = 0; i < 256; i++) { now = b0 + (i * 1000) / 256; r2.pushEeg([1, 2, 3, 4], now); }
  now += 5000; // tab throttled 5 s, then 1280 samples arrive in one burst
  for (let i = 0; i < 1280; i++) r2.pushEeg([1, 2, 3, 4], now);
  r2.stop();
  const rr = (o + '').split(String.fromCharCode(10)).slice(1).filter(Boolean);
  const ts = rr.map((r) => r.slice(0, 23));
  check('burst keeps timestamps monotonic', ts.every((t, i) => i === 0 || t >= ts[i - 1]));
  const dt = (a, b) => new Date(a.replace(' ', 'T')) - new Date(b.replace(' ', 'T'));
  check('burst: no 5 s jump (<1.5 s drift)', Math.abs(dt(ts[ts.length - 1], ts[255]) - (1280 * 1000) / 256) < 1500, `${dt(ts[ts.length - 1], ts[255])} ms`);
  // real loss: 3 s gap, then samples keep arriving at real pace
  let o3 = '';
  const r3 = new MMRecorder({ onChunk: (t) => (o3 += t) });
  r3.start(b0);
  for (let i = 0; i < 256; i++) r3.pushEeg([1, 2, 3, 4], b0 + (i * 1000) / 256);
  for (let i = 0; i < 512; i++) r3.pushEeg([1, 2, 3, 4], b0 + 4000 + (i * 1000) / 256);
  r3.stop();
  const rows3 = o3.split(String.fromCharCode(10)).slice(1).filter(Boolean);
  const last = new Date(rows3[rows3.length - 1].slice(0, 23).replace(' ', 'T')).getTime();
  check('real loss resyncs to wall clock', Math.abs(last - (b0 + 4000 + (511 * 1000) / 256)) < 300, `${last - b0} ms`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
