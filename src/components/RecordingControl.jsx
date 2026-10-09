/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecording } from '../contexts/RecordingContext.jsx';
import '../styles/retro.css';

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/**
 * RecordingControl - opt-in "Record this session" (off by default), recording indicator, save/share.
 * Fixed bottom-left so it is reachable on the phone from the start screen and the game list.
 * Also writes game start/end marker rows into the CSV when the route changes. Mind Monitor shows
 * /Marker/1 and /Marker/2 as M1 / M2 in its viewer, so those exact strings are used (game id omitted).
 */
export function RecordingControl() {
  const {
    armed, setArmed, status, stats, result, error, warning, canShare, stop, marker, dismiss, download, share,
    recovery, canShareRecovery, recoverySave, recoveryShare, recoveryDiscard, recoveryLater,
  } = useRecording();
  const { pathname } = useLocation();
  const prevGame = useRef(null);

  useEffect(() => {
    const m = pathname.match(/^\/game\/([^/]+)/);
    const game = m ? m[1] : null;
    if (prevGame.current && prevGame.current !== game) marker('/Marker/2');
    if (game && game !== prevGame.current) marker('/Marker/1');
    prevGame.current = game;
  }, [pathname, marker]);

  const isGame = pathname.startsWith('/game/');
  const box = 'fixed left-2 bottom-2 z-[60] border-2 border-white bg-black/80 text-white p-2 text-[8px] leading-relaxed max-w-[240px]';
  const font = { fontFamily: "'Press Start 2P', cursive" };
  const btn = 'border-2 px-2 py-1.5 mr-1 mt-1 text-[8px] border-white hover:bg-white hover:text-black';

  if (status === 'done' && result) {
    return (
      <div className={box} style={font} role="dialog" aria-label="Recording finished">
        <div className="text-[var(--nes-green)]">RECORDING SAVED ON THIS DEVICE</div>
        <div className="opacity-70 mt-1 break-all">{result.name} ({fmtSize(result.size)})</div>
        {result.warning && <div className="mt-1 text-yellow-300">WARNING: {result.warning}</div>}
        <button type="button" className={btn} onClick={download}>SAVE FILE</button>
        {canShare && <button type="button" className={btn} onClick={share}>SHARE</button>}
        <button type="button" className={btn} onClick={dismiss}>DELETE</button>
        {error && <div className="mt-1 text-red-400">{error}</div>}
      </div>
    );
  }

  if (status === 'recording') {
    return (
      <div className={box} style={font} role="status">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" aria-hidden="true" />
        REC {fmtTime(stats.seconds)} · {fmtSize(stats.bytes)}
        <button type="button" className={btn} onClick={() => stop()}>STOP</button>
        {warning && <div className="mt-1 text-yellow-300">{warning}</div>}
      </div>
    );
  }

  if (isGame) return null; // keep games clean; the toggle lives on the start screen and the game list

  if (recovery) {
    return (
      <div className={box} style={font} role="dialog" aria-label="Recover last recording">
        <div className="text-yellow-300">RECOVER LAST RECORDING?</div>
        <div className="opacity-70 mt-1 break-all">An earlier recording was not saved: {recovery.name} ({fmtSize(recovery.size)})</div>
        <button type="button" className={btn} onClick={recoverySave}>SAVE FILE</button>
        {canShareRecovery && <button type="button" className={btn} onClick={recoveryShare}>SHARE</button>}
        <button type="button" className={btn} onClick={recoveryDiscard}>DELETE</button>
        <button type="button" className={btn} onClick={recoveryLater}>LATER</button>
        {error && <div className="mt-1 text-red-400">{error}</div>}
      </div>
    );
  }
  return (
    <div className={box} style={font}>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} />
        <span>RECORD THIS SESSION</span>
      </label>
      <div className="opacity-60 mt-1">
        {armed ? 'Starts when the headband is connected. Saved only on this device.' : 'Off. Saves a CSV on this device only.'}
      </div>
      {error && <div className="mt-1 text-red-400">{error}</div>}
    </div>
  );
}
