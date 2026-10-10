// Single source of truth for child profiles. Every consumer re-renders on switch / create / edit / delete,
// including changes made in another tab (storage event) or by code that calls lib/profiles directly.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  loadProfiles, switchProfile, createProfile, updateProfile, deleteProfile,
  PROFILE_CHANGED_EVENT, PROFILES_KEY,
} from '../lib/profiles.js';
import { removeChildData } from '../lib/sessionStore.js';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [state, setState] = useState(loadProfiles);
  const refresh = useCallback(() => {
    const next = loadProfiles();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    const onStorage = (e) => { if (!e.key || e.key === PROFILES_KEY) refresh(); };
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const value = useMemo(() => {
    const active = state.list.find((c) => c.id === state.activeId) || state.list[0];
    return {
      list: state.list,
      active,
      activeId: state.activeId,
      switchTo: (id) => { switchProfile(id); return refresh(); },
      create: (name, look) => { createProfile(name, look); return refresh(); },
      update: (id, patch) => { updateProfile(id, patch); return refresh(); },
      remove: (id, { alsoSessions = false } = {}) => {
        if (state.list.length <= 1) return state;
        if (alsoSessions) removeChildData(id);
        deleteProfile(id);
        return refresh();
      },
      refresh,
    };
  }, [state, refresh]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfiles() {
  const v = useContext(ProfileContext);
  if (!v) throw new Error('useProfiles must be used inside <ProfileProvider>');
  return v;
}
