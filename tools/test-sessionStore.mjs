// Run: node tools/test-sessionStore.mjs
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const store = await import('../src/lib/sessionStore.js');
const prof = await import('../src/lib/profiles.js');
let fails = 0;
const t = (name, fn) => {
  try { fn(); console.log('PASS', name); } catch (e) { fails += 1; console.log('FAIL', name, '-', e.message); }
};

// Old-format records (no childId) already in storage.
mem.set(store.SESSIONS_KEY, JSON.stringify([
  { id: 'old1', date: '2026-09-01T10:00:00.000Z', game: 'focus-ball', durationSec: 180, score: 55, stars: 2 },
  { id: 'old2', date: '2026-09-02T10:00:00.000Z', game: 'focus-ball', durationSec: 180, score: 60, insight: 'Good, "steady" focus' },
]));

t('old records without childId still load', () => {
  const l = store.loadSessions();
  assert.equal(l.length, 2);
  const kid = prof.loadProfiles().activeId;
  assert.equal(store.sessionsForChild(l, kid).length, 2);
});

t('default profile created silently', () => {
  const p = prof.loadProfiles();
  assert.equal(p.list.length, 1);
  assert.equal(p.activeId, p.list[0].id);
});

t('recordSession stamps childId, date and calibration', () => {
  store.setActiveCalibration({ paf: 10.2, alphaReactivity: 0.4, bandsSource: 'personal' });
  const id = store.recordSession('glow-orb', { score: 70, fnirsUsed: true, qualityPct: 91, bogus: undefined });
  const r = store.loadSessions().find((s) => s.id === id);
  assert.equal(r.childId, prof.loadProfiles().activeId);
  assert.equal(r.paf, 10.2);
  assert.equal(r.alphaReactivity, 0.4);
  assert.equal(r.game, 'glow-orb');
  assert.ok(r.date && r.fnirsUsed === true && r.qualityPct === 91);
  assert.ok(!('bogus' in r));
});

t('recordSession works without calibration', () => {
  mem.delete(store.PAF_KEY);
  store.setActiveCalibration({ paf: null, alphaReactivity: null, bandsSource: 'standard' });
  const id = store.recordSession('sailor', { score: 5 });
  const r = store.loadSessions().find((s) => s.id === id);
  assert.ok(!('paf' in r));
});

t('demo mode writes nothing', () => {
  store.setDemoMode(true);
  assert.equal(store.recordSession('sailor', { score: 5 }), null);
  store.setDemoMode(false);
});

t('profiles: create, switch, rename, delete', () => {
  const first = prof.loadProfiles().activeId;
  let s = prof.createProfile('Mia');
  assert.equal(s.list.length, 2);
  assert.equal(s.activeId, s.list[1].id);
  s = prof.renameProfile(s.activeId, 'Mimi');
  assert.equal(s.list[1].name, 'Mimi');
  s = prof.switchProfile(first);
  assert.equal(s.activeId, first);
  s = prof.deleteProfile(s.list[1].id);
  assert.equal(s.list.length, 1);
  s = prof.deleteProfile(first);
  assert.equal(s.list.length, 1, 'last profile is kept');
});

t('CSV export -> clear -> import round-trip keeps records', () => {
  const kid2 = prof.createProfile('Zoe, "Z"').activeId;
  store.recordSession('focus-ball', { score: 80, insight: 'Line1, with "quotes"', checkIn: true });
  const before = store.loadSessions();
  const profilesBefore = prof.loadProfiles().list;
  const csv = store.exportCsv();
  mem.clear();
  const res = store.importCsv(csv);
  assert.equal(res.sessions, before.length);
  const after = store.loadSessions();
  assert.equal(after.length, before.length);
  for (const b of before) {
    const a = after.find((s) => s.id === b.id);
    assert.ok(a, 'missing ' + b.id);
    for (const [k, v] of Object.entries(b)) assert.deepEqual(a[k], v, `${b.id}.${k}`);
  }
  const p = prof.loadProfiles().list;
  assert.ok(p.some((c) => c.id === kid2 && c.name === 'Zoe  "Z"'));
  assert.ok(profilesBefore.every((c) => p.some((x) => x.id === c.id)));
});

t('import merges by id (no duplicates)', () => {
  const n = store.loadSessions().length;
  const res = store.importCsv(store.exportCsv());
  assert.equal(res.sessions, 0);
  assert.equal(store.loadSessions().length, n);
});

const paf = await import('../src/lib/paf.js');
const hdr = store.CSV_COLUMNS.join(',');
const pad = (n) => ','.repeat(n);

t('CSV import: Excel-padded markers, TRUE/FALSE, locale dates, skipped count', () => {
  mem.clear();
  const csv = [
    '#profiles' + pad(4), 'id,name,createdAt' + pad(0), 'cx1,Ann,2026-01-01T00:00:00.000Z', '',
    '#sessions' + pad(4), hdr,
    store.CSV_COLUMNS.map((k) => ({ id: 'x1', date: '2026-09-01T10:00:00.000Z', childId: 'cx1', game: 'focus-ball', fnirsUsed: 'TRUE', checkIn: 'FALSE' }[k] ?? '')).join(','),
    'x2,2026-09-02 10:00,cx1,sailor,,,,,,5',
    'x3,9/3/2026 10:00,cx1,sailor',
    'x4,not a date,cx1,sailor',
  ].join('\r\n');
  const r = store.importCsv('﻿' + csv);
  assert.equal(r.sessions, 3);
  assert.equal(r.skipped, 1);
  const l = store.loadSessions();
  const x1 = l.find((s) => s.id === 'x1');
  assert.equal(x1.fnirsUsed, true);
  assert.equal(x1.checkIn, false);
  for (const s of l) assert.ok(/^\d{4}-\d{2}-\d{2}T.*Z$/.test(s.date), s.date);
  assert.ok(prof.loadProfiles().list.some((c) => c.id === 'cx1'));
});

t('import on a fresh device switches to the imported child who has sessions', () => {
  assert.equal(prof.loadProfiles().activeId, 'cx1');
});

t('okSec exported and BOM present', () => {
  assert.ok(store.CSV_COLUMNS.includes('okSec'));
  assert.ok(store.exportCsv().startsWith('﻿'));
});

t('calibration is per child and stamped only for the same child', () => {
  mem.clear();
  const a = prof.loadProfiles().activeId;
  paf.saveCalibration({ paf: 10.1, alphaReactivity: 0.3 });
  const b = prof.createProfile('Bo').activeId;
  assert.equal(paf.loadCalibration(), null, 'child B has no calibration');
  store.setActiveCalibration({ paf: null, alphaReactivity: null, bandsSource: 'standard' });
  const idB = store.recordSession('glow-orb', { score: 1 });
  const rB = store.loadSessions().find((s) => s.id === idB);
  assert.equal(rB.childId, b);
  assert.ok(!('paf' in rB), 'A calibration not stamped on B');
  paf.saveCalibration({ paf: 9.2 });
  prof.switchProfile(a);
  store.setActiveCalibration({ paf: 10.1, alphaReactivity: 0.3, bandsSource: 'personal', date: new Date().toISOString() });
  assert.equal(paf.loadCalibration().paf, 10.1);
  const idA = store.recordSession('glow-orb', { score: 2 });
  const rA = store.loadSessions().find((s) => s.id === idA);
  assert.equal(rA.paf, 10.1);
  assert.ok(rA.calibDate);
});

t('old flat calibration migrates to the active child', () => {
  mem.clear();
  mem.set(store.PAF_KEY, JSON.stringify({ paf: 9.9, date: '2026-01-01T00:00:00.000Z' }));
  const c = paf.loadCalibration();
  assert.equal(c.paf, 9.9);
  assert.equal(c.childId, prof.loadProfiles().activeId);
});

t('legacy owner stays fixed after deleting the first profile; clear is per child', () => {
  mem.clear();
  mem.set(store.SESSIONS_KEY, JSON.stringify([{ id: 'l1', date: '2026-09-01T10:00:00.000Z', game: 'focus-ball' }]));
  const first = prof.loadProfiles().activeId;
  const second = prof.createProfile('Cy').activeId;
  store.recordSession('sailor', { score: 3 });
  prof.deleteProfile(first);
  const all = store.loadSessions();
  assert.equal(store.sessionsForChild(all, second).length, 1, 'legacy row not moved to second child');
  assert.equal(store.sessionsForChild(all, first).length, 1);
  store.clearSessions(second);
  assert.equal(store.loadSessions().length, 1, 'only the active child cleared');
  assert.equal(store.appendSession({ date: 'x' }) !== null, true);
});

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
