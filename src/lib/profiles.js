// Child profiles (nickname only) in localStorage: { list: [{id, name, createdAt}], activeId }.
// A default profile is created silently so nothing depends on the user setting one up.
export const PROFILES_KEY = 'brainarcade.profiles';
export const DEFAULT_NAME = 'Player 1';
// Fired on window when the active child changes (calibration and baseline are per child)
export const PROFILE_CHANGED_EVENT = 'brainarcade:profile-changed';
const MAX_NAME = 24;

export const AVATARS = ["🦊", "🐼", "🐸", "🦁", "🐯", "🐨", "🐵", "🐙", "🦄", "🐢", "🐧", "🐰"];
export const COLORS = ["var(--nes-yellow)", "var(--nes-green)", "var(--nes-blue)", "var(--nes-red)", "var(--nes-purple)"];
const validAvatar = (a) => (AVATARS.includes(a) ? a : null);
const validColor = (c) => (COLORS.includes(c) ? c : null);
const hash = (s) => {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};
// Avatar and colour of a profile; older profiles without them get a stable default from the id.
export function profileLook(c) {
  const h = hash(c?.id ?? "");
  return {
    avatar: validAvatar(c?.avatar) || AVATARS[h % AVATARS.length],
    color: validColor(c?.color) || COLORS[Math.floor(h / AVATARS.length) % COLORS.length],
  };
}
const applyLook = (c, look) => {
  const a = validAvatar(look?.avatar);
  const col = validColor(look?.color);
  if (a) c.avatar = a;
  if (col) c.color = col;
};

const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cleanName = (n) => String(n ?? '').replace(/[\r\n,]/g, ' ').trim().slice(0, MAX_NAME);

function save(state) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(state));
  } catch {
    // ignore (private mode / quota)
  }
}

export function loadProfiles() {
  let state = null;
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY) || 'null');
    if (p && Array.isArray(p.list)) {
      const list = p.list.filter((c) => c && typeof c.id === 'string' && c.id);
      if (list.length) {
        state = { list, activeId: list.some((c) => c.id === p.activeId) ? p.activeId : list[0].id };
        // Owner of old session rows that have no childId: fixed once, so deleting the first profile never moves them.
        if (typeof p.legacyOwnerId === 'string' && p.legacyOwnerId) state.legacyOwnerId = p.legacyOwnerId;
        else {
          state.legacyOwnerId = list[0].id;
          save(state);
        }
      }
    }
  } catch {
    // fall through to default
  }
  if (!state) {
    const c = { id: newId(), name: DEFAULT_NAME, createdAt: new Date().toISOString() };
    state = { list: [c], activeId: c.id, legacyOwnerId: c.id };
    save(state);
  }
  return state;
}

export function getLegacyOwnerId() {
  return loadProfiles().legacyOwnerId;
}

export function getActiveProfileId() {
  return loadProfiles().activeId;
}

export function createProfile(name, look) {
  const state = loadProfiles();
  const c = { id: newId(), name: cleanName(name) || `Player ${state.list.length + 1}`, createdAt: new Date().toISOString() };
  applyLook(c, look);
  const changed = state.activeId !== c.id;
  state.list.push(c);
  state.activeId = c.id;
  save(state);
  if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  return state;
}

export function switchProfile(id) {
  const state = loadProfiles();
  if (state.list.some((c) => c.id === id)) {
    const changed = state.activeId !== id;
    state.activeId = id;
    save(state);
    if (changed && typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
  return state;
}

export function renameProfile(id, name) {
  return updateProfile(id, { name });
}

// Update name / avatar / colour (each optional, invalid values ignored).
export function updateProfile(id, patch = {}) {
  const state = loadProfiles();
  const c = state.list.find((x) => x.id === id);
  if (c) {
    const n = patch.name === undefined ? '' : cleanName(patch.name);
    if (n) c.name = n;
    applyLook(c, patch);
    save(state);
  }
  return state;
}

// Removes the profile only (session rows are removed separately, see sessionStore.removeChildData). Last profile cannot be deleted.
export function deleteProfile(id) {
  const state = loadProfiles();
  if (state.list.length <= 1) return state;
  state.list = state.list.filter((c) => c.id !== id);
  const wasActive = state.activeId === id;
  if (wasActive) state.activeId = state.list[0].id;
  save(state);
  if (wasActive && typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  return state;
}

// Merge imported profiles by id (existing ones win); returns the new state.
export function mergeProfiles(incoming) {
  const state = loadProfiles();
  const have = new Set(state.list.map((c) => c.id));
  for (const c of incoming || []) {
    if (c && c.id && !have.has(c.id)) {
      const n = { id: String(c.id), name: cleanName(c.name) || 'Player', createdAt: c.createdAt || new Date().toISOString() };
      applyLook(n, c);
      state.list.push(n);
      have.add(c.id);
    }
  }
  save(state);
  return state;
}
