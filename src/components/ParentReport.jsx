/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Parent report block: summary text, brain-wave timeline, head map, Print / Save PDF.
// Reads the 1 Hz timeline collected while the game page was open (src/lib/sessionTimeline.js).
import React, { useEffect, useMemo, useState } from 'react';
import { sessionTimeline, meanAlphaByChannel } from '../lib/sessionTimeline.js';
import { BandTimelineChart } from './BandTimelineChart.jsx';
import { Topomap } from './Topomap.jsx';
import { loadProfiles } from '../lib/profiles.js';
import { loadSessions } from '../lib/sessionStore.js';
import { ParentSummary } from './ParentSummary.jsx';
import '../styles/print.css';

// sessionId: history record id (null = unknown); game: optional game id for the comparison.
// `seconds` is accepted for compatibility but ignored: the timeline freezes itself (sessionTimeline.end()).
// eslint-disable-next-line no-unused-vars
export function ParentReport({ sessionId = null, seconds = 0, game = null, childName = '' }) {
  const [open, setOpen] = useState(false);
  // The game is over once the report is shown: stop collecting, keep the points of this session.
  useEffect(() => {
    sessionTimeline.end();
    return () => sessionTimeline.reopen();
  }, []);
  // Print only the report: the hide rules in print.css apply while body has .printing-report.
  useEffect(() => {
    const off = () => document.body.classList.remove('printing-report');
    window.addEventListener('afterprint', off);
    return () => { window.removeEventListener('afterprint', off); off(); };
  }, []);
  const points = useMemo(() => (open ? sessionTimeline.all() : []), [open]);
  const alpha = useMemo(() => meanAlphaByChannel(points), [points]);
  const { date, name } = useMemo(() => {
    if (!open) return { date: '', name: childName };
    const rec = sessionId ? loadSessions().find((s) => s.id === sessionId) : null;
    const d = rec?.date ? new Date(rec.date) : new Date();
    const pr = loadProfiles();
    const cid = rec?.childId || pr.activeId;
    return {
      date: Number.isNaN(d.getTime()) ? new Date().toLocaleDateString() : d.toLocaleDateString(),
      name: childName || pr.list.find((c) => c.id === cid)?.name || '',
    };
  }, [open, sessionId, childName]);
  if (!open) {
    return (
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-4 border-[var(--nes-blue)] px-4 py-3 text-xs text-[var(--nes-blue)] hover:bg-[var(--nes-blue)] hover:text-black"
        >
          PARENT REPORT
        </button>
      </div>
    );
  }
  return (
    <section className="parent-report mb-5" aria-label="Parent report">
      <h3 style={{ fontSize: 16 }}>Brain Arcade - session report{name ? ` for ${name}` : ''}</h3>
      <p className="text-[10px] mb-2">{date}</p>
      <h3>Summary</h3>
      <ParentSummary sessionId={sessionId} points={points} game={game} />
      <h3>Brain waves over time</h3>
      <BandTimelineChart points={points} />
      <h3>Where the alpha waves were strongest</h3>
      <Topomap values={alpha} />
      <div className="no-print flex gap-3 mt-4">
        <button
          type="button"
          onClick={() => { document.body.classList.add('printing-report'); window.print(); }}
          className="border-2 border-black bg-white px-3 py-2 text-xs text-black hover:bg-black hover:text-white"
        >
          Print / Save PDF
        </button>
        <button type="button" onClick={() => setOpen(false)} className="border-2 border-black bg-white px-3 py-2 text-xs text-black">
          Close
        </button>
      </div>
    </section>
  );
}
