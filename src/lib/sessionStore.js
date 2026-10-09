// Training session history in localStorage (shared by Focus Ball and the Training Journal).
export const SESSIONS_KEY = 'brainarcade.sessions';
export const MAX_SESSIONS = 200;
export const CHECK_IN_EVERY = 8;

export function loadSessions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s === 'object') : [];
  } catch {
    return [];
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Appends a record (with a fresh id) and returns the id.
export function appendSession(record) {
  const id = newId();
  const list = loadSessions();
  list.push({ ...record, id });
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
  } catch {
    // ignore (private mode / quota)
  }
  return id;
}

// Merge extra fields (e.g. {feeling}) into the session record with this id.
export function updateSession(id, patch) {
  if (!id) return false;
  const list = loadSessions();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
    return true;
  } catch {
    return false;
  }
}

export function clearSessions() {
  try {
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    // ignore
  }
}

const dayKey = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

// Consecutive local calendar days with >=1 session, ending today or yesterday.
export function dayStreak(sessions, now = new Date()) {
  const days = new Set();
  for (const s of sessions || []) {
    const d = new Date(s.date);
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d));
  }
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(cur))) {
    n += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return n;
}

// Normal (non-check-in) sessions since the last check-in (all of them if none yet).
export function sessionsSinceCheckIn(sessions) {
  const list = sessions || [];
  let n = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].checkIn) break;
    n += 1;
  }
  return n;
}

export function isCheckInDue(sessions) {
  return !(sessions || []).some((s) => s.checkIn) || sessionsSinceCheckIn(sessions) >= CHECK_IN_EVERY;
}
