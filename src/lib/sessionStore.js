// Training session history in localStorage (shared by all games and the Training Journal).
import { loadProfiles, mergeProfiles, switchProfile } from './profiles.js';
import { getStoredSetup, removeChildSetup } from './playSetup.js';
import { sessionTimeline } from './sessionTimeline.js';

export const SESSIONS_KEY = 'brainarcade.sessions';
export const MAX_SESSIONS = 500;
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

// Appends a record (with a fresh id) and returns the id, or null when it could not be saved (quota / private mode).
export function appendSession(record) {
  const id = newId();
  const list = loadSessions();
  list.push({ ...record, id });
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
  } catch {
    return null;
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

// Owner of a session row: old rows without childId belong to the fixed legacy owner (first profile at first load).
const ownerOf = (s, state) => s.childId || state.legacyOwnerId || state.list[0]?.id;

// Clears one child's sessions (childId given) or everything (no argument).
export function clearSessions(childId) {
  try {
    if (!childId) {
      localStorage.removeItem(SESSIONS_KEY);
      return;
    }
    const state = loadProfiles();
    const keep = loadSessions().filter((s) => ownerOf(s, state) !== childId);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(keep));
  } catch {
    // ignore
  }
}

// Deletes a child's sessions, stored calibration and play setup (used when a profile is deleted with its data).
export function removeChildData(childId) {
  clearSessions(childId);
  removeChildSetup(childId);
  try {
    const o = JSON.parse(localStorage.getItem(PAF_KEY) || 'null');
    if (o && o.byChild && o.byChild[childId]) {
      delete o.byChild[childId];
      localStorage.setItem(PAF_KEY, JSON.stringify(o));
    }
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

// Check-ins are a Focus Ball test: only Focus Ball rows count (old rows without a game are Focus Ball).
const focusBallOnly = (sessions) => (sessions || []).filter((s) => (s.game || 'focus-ball') === 'focus-ball');

// Normal (non-check-in) Focus Ball sessions since the last check-in (all of them if none yet).
// Pass one child's sessions (sessionsForChild) so other players do not count.
export function sessionsSinceCheckIn(sessions) {
  const list = focusBallOnly(sessions);
  let n = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].checkIn) break;
    n += 1;
  }
  return n;
}

export function isCheckInDue(sessions) {
  return !focusBallOnly(sessions).some((s) => s.checkIn) || sessionsSinceCheckIn(sessions) >= CHECK_IN_EVERY;
}

// ---- Calibration (PAF) -------------------------------------------------------
export const PAF_KEY = 'brainarcade.paf';

const finite = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

// One-line recorder for any game: stamps date, child and the active child's calibration. Returns the record id (null if not saved).
// fields: {durationSec, playedSec, score, points, meanFocus, timeAbovePct, qualityPct, fnirsUsed, ...}
// setup: how the child played ('hands' | 'stand' | 'pc', lib/playSetup.js), as chosen when the session is saved (game over).
// Not stamped while the child was never asked on this device (a guess is not a fact); such records read as 'unknown' (sessionSetup).
// BaselineContext publishes the calibration the game actually uses ({paf|null, alphaReactivity, bandsSource, date}) and the demo flag.
let activeCal = null;
let demoMode = false;
export function setActiveCalibration(cal) { activeCal = cal || null; }
export function setDemoMode(on) { demoMode = !!on; }
export function isDemoMode() { return demoMode; }

export function recordSession(game, fields = {}) {
  if (demoMode) return null; // mock/demo data is never written to the history
  const childId = loadProfiles().activeId;
  // Head motion of this session (motionSec, movingPct, bigMovePct, tiltedPct), when the headband has a motion sensor
  const record = { date: new Date().toISOString(), game, childId, setup: getStoredSetup(childId) || undefined, ...sessionTimeline.motionSummary(), ...fields };
  // Stamp what the game really used: the active calibration if personal bands were in effect, otherwise nothing (standard bands).
  const used = activeCal && activeCal.bandsSource === 'personal' ? activeCal : null;
  if (record.paf === undefined) record.paf = finite(used?.paf);
  if (record.alphaReactivity === undefined) record.alphaReactivity = finite(used?.alphaReactivity);
  if (record.calibDate === undefined && used?.date) record.calibDate = String(used.date);
  for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
  return appendSession(record);
}

// Sessions that belong to a child. Old records without childId belong to the fixed legacy owner.
export function sessionsForChild(sessions, childId) {
  const state = loadProfiles();
  return (sessions || []).filter((s) => ownerOf(s, state) === childId);
}

// ---- CSV export / import ------------------------------------------------------
export const CSV_COLUMNS = [
  'id', 'date', 'childId', 'game', 'durationSec', 'playedSec', 'okSec', 'outcome', 'cue', 'points', 'score', 'stars',
  'energy', 'flow', 'flowSec', 'increase', 'avgRecoverySec', 'timeAbovePct', 'meanFocus', 'paf',
  'alphaReactivity', 'calibDate', 'qualityPct', 'fnirsUsed', 'checkIn', 'feeling', 'insight', 'setup',
  // shared round record (lib/roundRecord.js)
  'level', 'goal', 'successPct', 'longestStreakS', 'heldPct', 'frozenPct', 'rawByMin', 'zByMin',
  // head motion (lib/sessionTimeline.js motionSummary)
  'motionSec', 'movingPct', 'bigMovePct', 'tiltedPct',
];

const esc = (v) => {
  if (v === undefined || v === null) return '';
  const t = String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// One CSV file: a "#profiles" section followed by a "#sessions" section.
export function exportCsv(sessions = loadSessions(), profiles = loadProfiles().list) {
  const out = ['#profiles', 'id,name,createdAt'];
  for (const c of profiles) out.push([c.id, c.name, c.createdAt].map(esc).join(','));
  out.push('', '#sessions', CSV_COLUMNS.join(','));
  for (const s of sessions) out.push(CSV_COLUMNS.map((k) => esc(s[k])).join(','));
  return '\uFEFF' + out.join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
}

// RFC 4180-style parser -> array of rows (arrays of strings).
function parseRows(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

const NUMERIC = new Set(['durationSec', 'playedSec', 'okSec', 'points', 'score', 'stars', 'energy', 'flow', 'flowSec', 'increase', 'avgRecoverySec', 'timeAbovePct', 'meanFocus', 'paf', 'alphaReactivity', 'qualityPct', 'feeling', 'level', 'goal', 'successPct', 'longestStreakS', 'heldPct', 'frozenPct', 'motionSec', 'movingPct', 'bigMovePct', 'tiltedPct']);
const BOOL = new Set(['fnirsUsed', 'checkIn']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Excel / locale tools rewrite dates; accept anything Date.parse understands and return ISO, else null.
function fixDate(v) {
  if (ISO_DATE.test(v)) return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Merges a CSV made by exportCsv into storage (sessions and profiles by id; existing ones win).
export function importCsv(text) {
  const rows = parseRows(text);
  const profiles = [];
  const incoming = [];
  let skipped = 0;
  let section = '';
  let header = null;
  for (const r of rows) {
    if (r[0].startsWith('#') && r.slice(1).every((x) => x.trim() === '')) {
      section = r[0].slice(1).trim();
      header = null;
      continue;
    }
    if (r.every((x) => x === '')) continue;
    if (!header) {
      header = r;
      continue;
    }
    const o = {};
    header.forEach((k, i) => {
      if (r[i] !== undefined && r[i] !== '') o[k] = r[i];
    });
    if (section === 'profiles') profiles.push(o);
    else if (section === 'sessions') {
      for (const k of Object.keys(o)) {
        if (NUMERIC.has(k)) {
          const n = Number(o[k]);
          if (Number.isFinite(n)) o[k] = n;
          else delete o[k];
        } else if (BOOL.has(k)) o[k] = /^(true|1)$/i.test(String(o[k]).trim());
      }
      const d = o.date ? fixDate(String(o.date).trim()) : null;
      if (d) {
        o.date = d;
        incoming.push(o);
      } else skipped += 1;
    }
  }
  const before = loadProfiles().list.length;
  const after = mergeProfiles(profiles).list.length;
  const list = loadSessions();
  const have = new Set(list.map((s) => s.id));
  let added = 0;
  for (const o of incoming) {
    if (!o.id) o.id = newId();
    if (have.has(o.id)) continue;
    have.add(o.id);
    list.push(o);
    added += 1;
  }
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(-MAX_SESSIONS)));
  } catch {
    // ignore
  }
  // Fresh device: if the active child has nothing but an imported child does, switch to that child.
  let state = loadProfiles();
  if (added && !sessionsForChild(list, state.activeId).length) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const owner = ownerOf(list[i], state);
      if (owner !== state.activeId && state.list.some((c) => c.id === owner)) {
        state = switchProfile(owner);
        break;
      }
    }
  }
  return { sessions: added, profiles: after - before, skipped, activeId: state.activeId };
}
