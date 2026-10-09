/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Opt-in recording of the session as a Mind Monitor compatible CSV (see lib/mmRecorder.js).
// OFF by default. Data stays on this device (OPFS / Blob), the user saves or shares it at the end.
// Taps: subscribeEEG (every mode incl. mock), fnirs.push (optics), Athena recTap (battery, acc/gyro),
// QualityContext (HSI), BlinkContext (blink events).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useEEG } from './MuseContext.jsx';
import { useQuality } from './QualityContext.jsx';
import { useBlink } from './BlinkContext.jsx';
import { MMRecorder, recordingFileName } from '../lib/mmRecorder.js';
import { createSink, findLeftover } from '../lib/recSink.js';

const RecordingContext = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useRecording = () => useContext(RecordingContext);

export function RecordingProvider({ children }) {
  const { muse, isConnected, isMock, subscribeEEG } = useEEG();
  const { perChannelBad } = useQuality();
  const { onBlink } = useBlink();
  const [armed, setArmed] = useState(false); // user wants a recording (starts once a headband is connected)
  const [status, setStatus] = useState('idle'); // idle | recording | done
  const [stats, setStats] = useState({ seconds: 0, bytes: 0 });
  const [result, setResult] = useState(null); // { file, name, size }
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null); // live warning while recording (storage limits)
  const [recovery, setRecovery] = useState(null); // unfinished/unsaved file from an earlier session
  const sessionRef = useRef(null);
  const badRef = useRef(perChannelBad);
  badRef.current = perChannelBad;
  const startingRef = useRef(false);

  // reason: 'full' | 'limit' | 'failed' (storage problem; the partial file is still kept) or undefined
  const stopSession = useCallback(async (why) => {
    const s = sessionRef.current;
    if (!s) return;
    const reason = typeof why === 'string' ? why : null;
    sessionRef.current = null;
    s.teardown();
    s.rec.stop();
    try {
      const { file, size, partial } = await s.sink.finish();
      const warn = reason === 'limit' ? 'Recording stopped at the 30 minute limit (no disk storage available).'
        : reason === 'full' ? 'Recording stopped: device storage is almost full.'
        : reason === 'failed' || partial ? 'Recording was cut short by a storage error. The file is saved up to that point.'
        : null;
      setResult({ file, name: s.name, size, sink: s.sink, warning: warn });
      setWarning(null);
      setStatus('done');
    } catch (e) {
      setError(String(e?.message || e));
      setStatus('idle');
    }
    setArmed(false);
  }, []);

  const begin = useCallback(async () => {
    if (startingRef.current || sessionRef.current || !muse) return;
    startingRef.current = true;
    setError(null);
    setWarning(null);
    try {
      const now = Date.now();
      const name = recordingFileName(now);
      const sink = await createSink(name);
      const rec = new MMRecorder({ onChunk: (t) => sink.write(t) });
      rec.start(now);
      rec.event(`/muse/event/connected ${isMock ? 'Mock' : muse._device?.name || 'Muse'}`, now);
      if (Number.isFinite(muse._battery?.values?.[0])) rec.setBattery(muse._battery.values[0]);

      const unsubs = [];
      let lastBad = -1; // bitmask of bad channels; HSI/headband state only rebuilt when it changes
      unsubs.push(subscribeEEG((s) => {
        const bad = badRef.current;
        let k = 0;
        for (let c = 0; c < 4; c++) if (bad[c]) k |= 1 << c;
        if (k !== lastBad) {
          lastBad = k;
          rec.setQuality(bad.map((b) => (b ? 4 : 1)), k !== 15);
        }
        rec.pushEeg(s);
      }));
      unsubs.push(onBlink(() => rec.event('/muse/elements/blink')));
      if (muse.fnirs) {
        const f = muse.fnirs;
        const orig = f.push;
        f.push = function (x) {
          rec.setOptics(x);
          return orig.call(this, x);
        };
        unsubs.push(() => { f.push = orig; });
      }
      muse.recTap = {
        battery: (pct) => rec.setBattery(pct),
        accGyro: (r) => rec.setAccGyro(r),
      };
      unsubs.push(() => { if (muse) muse.recTap = null; });
      if (sink.kind === 'blob') setWarning('No disk storage here: recording is limited to 30 minutes.');
      let warned = sink.kind === 'blob';
      const timer = setInterval(() => {
        const secs = rec.seconds;
        setStats({ seconds: secs, bytes: sink.size });
        if (sink.failure) stopSession('failed');
        else if (secs >= sink.maxSeconds) stopSession('limit');
        else if (sink.size >= sink.maxBytes) stopSession('full');
        else if (!warned && sink.size >= sink.warnBytes) { warned = true; setWarning('Device storage is nearly full: recording will stop soon.'); }
      }, 500);
      unsubs.push(() => clearInterval(timer));

      sessionRef.current = { rec, sink, name, teardown: () => unsubs.forEach((u) => u()) };
      setStats({ seconds: 0, bytes: sink.size });
      setStatus('recording');
    } catch (e) {
      setError(String(e?.message || e));
      setArmed(false);
    } finally {
      startingRef.current = false;
    }
  }, [muse, isMock, subscribeEEG, onBlink, stopSession]);

  // Armed + connected -> start
  useEffect(() => {
    if (armed && isConnected && status === 'idle') begin();
  }, [armed, isConnected, status, begin]);

  // Headband gone -> close the file so nothing is lost
  useEffect(() => {
    if (!isConnected && status === 'recording') stopSession();
  }, [isConnected, status, stopSession]);

  useEffect(() => () => {
    const s = sessionRef.current;
    if (s) { s.teardown(); s.sink.discard(); sessionRef.current = null; }
  }, []);

  const marker = useCallback((text) => sessionRef.current?.rec.event(text), []);

  const dismiss = useCallback(async () => {
    try { await result?.sink?.cleanup(); } catch { /* ignore */ }
    setResult(null);
    setStatus('idle');
  }, [result]);

  // Unfinished file from an earlier session (crash / closed tab): offered before anything is deleted
  useEffect(() => {
    let alive = true;
    findLeftover().then((r) => { if (alive && r) setRecovery(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [recoveryHidden, setRecoveryHidden] = useState(false);
  const recoveryDiscard = useCallback(async () => {
    try { await recovery?.remove(); } catch { /* ignore */ }
    setRecovery(null);
  }, [recovery]);

  const saveFile = useCallback((r) => {
    if (!r) return;
    const url = URL.createObjectURL(r.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, []);
  const shareFile = useCallback(async (r) => {
    if (!r) return;
    try {
      await navigator.share({ files: [r.file], title: r.name });
    } catch (e) {
      if (e?.name !== 'AbortError') setError(String(e?.message || e));
    }
  }, []);
  const canShareFile = (r) => !!(r && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [r.file] }));

  const download = useCallback(() => saveFile(result), [saveFile, result]);
  const share = useCallback(() => shareFile(result), [shareFile, result]);
  const recoverySave = useCallback(() => saveFile(recovery), [saveFile, recovery]);
  const recoveryShare = useCallback(() => shareFile(recovery), [shareFile, recovery]);
  const canShare = canShareFile(result);
  const canShareRecovery = canShareFile(recovery);

  const value = useMemo(() => ({
    armed, setArmed, status, stats, result, error, warning, canShare,
    stop: stopSession, marker, dismiss, download, share,
    recovery: recoveryHidden ? null : recovery, canShareRecovery, recoverySave, recoveryShare, recoveryDiscard,
    recoveryLater: () => setRecoveryHidden(true),
  }), [armed, status, stats, result, error, warning, canShare, stopSession, marker, dismiss, download, share,
    recovery, recoveryHidden, canShareRecovery, recoverySave, recoveryShare, recoveryDiscard]);

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}
