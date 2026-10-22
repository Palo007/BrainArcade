// How much do blinks raise forehead (AF7/AF8) delta and theta power? Replays a recording.
// Usage: node tools/measure-blink-leak.mjs <recording.csv> [classic|athena]
// Splits RAW_* into 2 s segments, finds blinks with the app's own BlinkDetector, and compares the
// median frontal power of segments with a blink against segments without one.
import fs from 'node:fs';
import { parseCsvText } from '../src/viewer/lib/csvParse.js';
import { computeWelchPSD, bandPowersFromPSD, SAMPLE_RATE as FS } from '../src/lib/signal.js';
import { BlinkDetector } from '../src/lib/blinkDetector.js';
import { getDeviceProfile } from '../src/lib/deviceProfile.js';

const [csvPath, device = 'athena'] = process.argv.slice(2);
if (!csvPath) { console.log('Usage: node tools/measure-blink-leak.mjs <recording.csv> [classic|athena]'); process.exit(2); }
const raw = parseCsvText(fs.readFileSync(csvPath, 'utf8')).groups.raw;
if (!raw) { console.log('No RAW_* columns in this file'); process.exit(2); }
const chans = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10'].map((c) => raw.cols[c]);

const det = new BlinkDetector(getDeviceProfile(device).blink);
const blinkAt = new Uint8Array(raw.n);
for (let i = 0; i < raw.n; i++) {
  const s = chans.map((c) => (Number.isFinite(c[i]) ? c[i] : 0));
  if (det.push(s)) blinkAt[i] = 1;
}

const SEG = FS * 2;
const withBlink = { delta: [], theta: [], alpha: [] };
const without = { delta: [], theta: [], alpha: [] };
for (let s = 0; s + SEG <= raw.n; s += SEG) {
  let ok = true, blink = false;
  for (let i = s; i < s + SEG; i++) {
    if (!chans.every((c) => Number.isFinite(c[i]))) { ok = false; break; }
    if (blinkAt[i]) blink = true;
  }
  if (!ok) continue;
  const p = [1, 2].map((ch) => {
    const { psd, freqRes } = computeWelchPSD(Array.from(chans[ch].subarray(s, s + SEG)), FS, 2, 1);
    return bandPowersFromPSD(psd, freqRes);
  });
  const into = blink ? withBlink : without;
  for (const b of ['delta', 'theta', 'alpha']) into[b].push((p[0][b] + p[1][b]) / 2);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`segments: ${without.delta.length} without blink, ${withBlink.delta.length} with blink`);
for (const b of ['delta', 'theta', 'alpha']) {
  const r = median(withBlink[b]) / median(without[b]);
  console.log(`${b.padEnd(6)} blink/no-blink median power = ${r.toFixed(2)}`);
}
