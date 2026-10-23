/* SPDX-License-Identifier: AGPL-3.0-or-later */
// How the child plays today (lib/playSetup.js), for any component: usePlaySetup().
// Follows the active child and changes from other tabs or from code that calls lib/playSetup directly.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useProfiles } from './ProfileContext.jsx';
import {
  getStoredSetup, defaultSetup, setPlaySetup, SETUP_INFO, PLAY_SETUP_CHANGED_EVENT, PLAY_SETUP_KEY,
} from '../lib/playSetup.js';

const PlaySetupContext = createContext(null);

export function PlaySetupProvider({ children }) {
  const { activeId } = useProfiles();
  const [stored, setStored] = useState(() => getStoredSetup(activeId));
  const refresh = useCallback(() => setStored(getStoredSetup(activeId)), [activeId]);

  useEffect(() => {
    refresh();
    const onStorage = (e) => { if (!e.key || e.key === PLAY_SETUP_KEY) refresh(); };
    window.addEventListener(PLAY_SETUP_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PLAY_SETUP_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const value = useMemo(() => {
    const setup = stored || defaultSetup();
    return {
      setup, // 'hands' | 'stand' | 'pc'
      asked: !!stored, // false: never chosen for this child on this device (setup is the default guess)
      info: SETUP_INFO[setup],
      setSetup: (v) => setPlaySetup(v, activeId), // fires PLAY_SETUP_CHANGED_EVENT -> refresh
    };
  }, [stored, activeId]);

  return <PlaySetupContext.Provider value={value}>{children}</PlaySetupContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlaySetup() {
  const v = useContext(PlaySetupContext);
  if (!v) throw new Error('usePlaySetup must be used inside <PlaySetupProvider>');
  return v;
}
