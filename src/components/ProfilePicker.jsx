// Child profile picker (nickname only): switch / create / rename / delete (with confirm).
import React, { useState } from 'react';
import { loadProfiles, createProfile, switchProfile, renameProfile, deleteProfile } from '../lib/profiles.js';
import { removeChildData } from '../lib/sessionStore.js';

const btn = 'border-4 px-2 py-1 text-[9px]';

export function ProfilePicker({ onChange }) {
  const [state, setState] = useState(loadProfiles);
  const [mode, setMode] = useState(null); // null | 'new' | 'rename' | 'delete'
  const [text, setText] = useState('');
  const [alsoSessions, setAlsoSessions] = useState(true);
  const active = state.list.find((c) => c.id === state.activeId) || state.list[0];

  const apply = (next) => {
    setState(next);
    setMode(null);
    setText('');
    onChange?.(next);
  };

  return (
    <div className="border-4 border-white/40 bg-black/60 px-3 py-3">
      <p className="text-[8px] text-gray-300 mb-2">PLAYER</p>
      <div className="flex flex-wrap gap-2 items-center">
        {state.list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => apply(switchProfile(c.id))}
            aria-pressed={c.id === state.activeId}
            className={`${btn} ${c.id === state.activeId ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-white/50 text-white hover:border-[var(--nes-yellow)]'}`}
          >
            {c.name}
          </button>
        ))}
        {!mode && (
          <>
            <button type="button" onClick={() => { setMode('new'); setText(''); }} className={`${btn} border-[var(--nes-green)] text-[var(--nes-green)]`}>+ New</button>
            <button type="button" onClick={() => { setMode('rename'); setText(active.name); }} className={`${btn} border-white/50 text-white`}>Rename</button>
            {state.list.length > 1 && (
              <button type="button" onClick={() => { setMode('delete'); setAlsoSessions(true); }} className={`${btn} border-red-400 text-red-400`}>Delete</button>
            )}
          </>
        )}
      </div>
      {(mode === 'new' || mode === 'rename') && (
        <form
          className="flex flex-wrap gap-2 items-center mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply(mode === 'new' ? createProfile(text) : renameProfile(active.id, text));
          }}
        >
          <input
            autoFocus
            value={text}
            maxLength={24}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nickname"
            aria-label="Nickname"
            className="bg-black border-4 border-white/50 px-2 py-1 text-[10px] text-white w-40"
          />
          <button type="submit" className={`${btn} border-[var(--nes-green)] text-[var(--nes-green)]`}>{mode === 'new' ? 'Create' : 'Save'}</button>
          <button type="button" onClick={() => setMode(null)} className={`${btn} border-white/50 text-white`}>Cancel</button>
        </form>
      )}
      {mode === 'delete' && (
        <div className="flex flex-wrap gap-2 items-center mt-3 text-[9px]">
          <span className="text-gray-300">Delete {active.name}?</span>
          <label className="flex items-center gap-1 text-gray-300">
            <input type="checkbox" checked={alsoSessions} onChange={(e) => setAlsoSessions(e.target.checked)} />
            also delete their sessions
          </label>
          <button
            type="button"
            onClick={() => {
              if (alsoSessions) removeChildData(active.id);
              apply(deleteProfile(active.id));
            }}
            className={`${btn} border-red-400 text-red-400`}
          >
            Yes, delete
          </button>
          <button type="button" onClick={() => setMode(null)} className={`${btn} border-white/50 text-white`}>Cancel</button>
        </div>
      )}
    </div>
  );
}
