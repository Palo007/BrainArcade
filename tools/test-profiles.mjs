// Run: node tools/test-profiles.mjs
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const p = await import('../src/lib/profiles.js');
let fails = 0;
const t = (name, fn) => {
  try { fn(); console.log('PASS', name); } catch (e) { fails += 1; console.log('FAIL', name, '-', e.message); }
};

t('profileLook is stable and valid for profiles without avatar/color', () => {
  const c = { id: 'cabc123', name: 'Old' };
  const a = p.profileLook(c);
  assert.deepEqual(a, p.profileLook({ ...c }));
  assert.ok(p.AVATARS.includes(a.avatar));
  assert.ok(p.COLORS.includes(a.color));
});

t('profileLook keeps valid values, ignores invalid ones', () => {
  const l = p.profileLook({ id: 'x', avatar: '🦄', color: 'var(--nes-red)' });
  assert.equal(l.avatar, '🦄');
  assert.equal(l.color, 'var(--nes-red)');
  const bad = p.profileLook({ id: 'x', avatar: 'zzz', color: 'red' });
  assert.ok(p.AVATARS.includes(bad.avatar) && p.COLORS.includes(bad.color));
});

t('createProfile accepts a look and validates it', () => {
  const s = p.createProfile('Mia', { avatar: '🐼', color: 'var(--nes-green)' });
  const c = s.list.find((x) => x.name === 'Mia');
  assert.equal(c.avatar, '🐼');
  assert.equal(c.color, 'var(--nes-green)');
  assert.equal(s.activeId, c.id);
  const s2 = p.createProfile('Bob', { avatar: 'nope', color: 'pink' });
  const b = s2.list.find((x) => x.name === 'Bob');
  assert.equal(b.avatar, undefined);
  assert.equal(b.color, undefined);
});

t('updateProfile changes only valid fields; renameProfile still works', () => {
  const id = p.loadProfiles().list.find((x) => x.name === 'Mia').id;
  p.updateProfile(id, { avatar: '🐸' });
  let c = p.loadProfiles().list.find((x) => x.id === id);
  assert.equal(c.name, 'Mia');
  assert.equal(c.avatar, '🐸');
  p.updateProfile(id, { name: '   ', avatar: 'bad', color: 'var(--nes-blue)' });
  c = p.loadProfiles().list.find((x) => x.id === id);
  assert.equal(c.name, 'Mia');
  assert.equal(c.avatar, '🐸');
  assert.equal(c.color, 'var(--nes-blue)');
  p.renameProfile(id, 'Mia2');
  assert.equal(p.loadProfiles().list.find((x) => x.id === id).name, 'Mia2');
});

t('mergeProfiles keeps valid avatar/color, drops invalid, existing wins', () => {
  const have = p.loadProfiles().list[0];
  const s = p.mergeProfiles([
    { id: 'imp1', name: 'Imp', avatar: '🐧', color: 'var(--nes-yellow)' },
    { id: 'imp2', name: 'Bad', avatar: 'x', color: 'y' },
    { id: have.id, name: 'Override', avatar: '🐰' },
  ]);
  const i1 = s.list.find((x) => x.id === 'imp1');
  assert.equal(i1.avatar, '🐧');
  assert.equal(i1.color, 'var(--nes-yellow)');
  const i2 = s.list.find((x) => x.id === 'imp2');
  assert.equal(i2.avatar, undefined);
  assert.equal(s.list.find((x) => x.id === have.id).name, have.name);
});

t('last profile cannot be deleted', () => {
  let s = p.loadProfiles();
  for (const c of s.list.slice(1)) s = p.deleteProfile(c.id);
  assert.equal(s.list.length, 1);
  assert.equal(p.deleteProfile(s.list[0].id).list.length, 1);
});

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
