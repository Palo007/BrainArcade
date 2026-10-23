/* SPDX-License-Identifier: AGPL-3.0-or-later */
// How the child plays today, per child in localStorage: { byChild: { [childId]: 'hands' | 'stand' | 'pc' } }.
// localStorage belongs to one device, so the choice is per child and per device (not in the CSV export).
// Phase 1 of the Play Setup project: stored, shown and recorded only. Signal handling does not read it yet.
import { getActiveProfileId } from './profiles.js';

export const PLAY_SETUP_KEY = 'brainarcade.playSetup';
// Fired on window when the stored choice changes (detail: { setup, childId })
export const PLAY_SETUP_CHANGED_EVENT = 'brainarcade:play-setup-changed';
export const SETUPS = ['hands', 'stand', 'pc'];
export const UNKNOWN_SETUP = 'unknown'; // session records from before the setting existed

export const SETUP_INFO = {
  hands: { label: 'PHONE IN HANDS', short: 'HANDS', hint: 'sofa, pillow', icon: '🤲', report: 'phone in hands' },
  stand: { label: 'PHONE ON STAND', short: 'STAND', hint: 'table, eye level', icon: '📱', report: 'phone on a stand' },
  pc: { label: 'COMPUTER', short: 'PC', hint: 'desk, keyboard', icon: '💻', report: 'computer' },
};

export const isSetup = (v) => SETUPS.includes(v);

// First guess before the child picks: phone in hands when the main pointer is a finger, else a computer.
// (pointer: coarse) looks at the primary pointer only, so touch-screen laptops still guess 'pc'.
export function defaultSetup() {
  try {
    const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
    return touch ? 'hands' : 'pc';
  } catch {
    return 'pc';
  }
}

function read() {
  try {
    const o = JSON.parse(localStorage.getItem(PLAY_SETUP_KEY) || 'null');
    return o && typeof o.byChild === 'object' && o.byChild ? o : { byChild: {} };
  } catch {
    return { byChild: {} };
  }
}

// The child's saved choice on this device, or null (never asked here yet).
export function getStoredSetup(childId = getActiveProfileId()) {
  const v = read().byChild[childId];
  return isSetup(v) ? v : null;
}

// The setup in effect: the saved choice, else the default guess.
export function getPlaySetup(childId = getActiveProfileId()) {
  return getStoredSetup(childId) || defaultSetup();
}

export function setPlaySetup(setup, childId = getActiveProfileId()) {
  if (!isSetup(setup)) return;
  const o = read();
  const changed = o.byChild[childId] !== setup;
  o.byChild[childId] = setup;
  try { localStorage.setItem(PLAY_SETUP_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ }
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLAY_SETUP_CHANGED_EVENT, { detail: { setup, childId } }));
  }
}

export function removeChildSetup(childId) {
  const o = read();
  if (!(childId in o.byChild)) return;
  delete o.byChild[childId];
  try { localStorage.setItem(PLAY_SETUP_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ }
}

// Next setup for the one-tap top-bar chip
export const nextSetup = (v) => SETUPS[(SETUPS.indexOf(v) + 1) % SETUPS.length];

// Setup of a session record: old records (and bad imported values) read as 'unknown'.
export const sessionSetup = (s) => (isSetup(s?.setup) ? s.setup : UNKNOWN_SETUP);
