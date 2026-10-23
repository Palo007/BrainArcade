// Training Journal: session history for all games, per child, with trends, streak, check-ins and CSV backup.
import React, { useMemo, useRef, useState } from 'react';
import { loadSessions, clearSessions, dayStreak, sessionsSinceCheckIn, sessionsForChild, exportCsv, importCsv, CHECK_IN_EVERY } from '../../lib/sessionStore.js';
import { PlayerSwitcher } from '../../components/PlayerSwitcher.jsx';
import { AlphaPeakReport } from '../../components/AlphaPeakReport.jsx';
import { loadPafHistory } from '../../lib/paf.js';
import { useProfiles } from '../../contexts/ProfileContext.jsx';
import { sessionSetup } from '../../lib/playSetup.js';
import { useT, locale } from '../../lib/i18n.js';
import '../../styles/retro.css';

const FONT = { fontFamily: 'var(--font-retro)' };
const YELLOW = '#ffd84a';
const CYAN = '#5ee0ff';
const GREEN = '#7dff7d';
const PINK = '#ff6b9d';
const panel = 'border-4 border-[var(--nes-yellow)] bg-black/80 px-4 py-4 text-white';
const smallBtn = 'border-4 px-3 py-2 phone-port:min-h-[40px] text-[10px]';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString(locale())} ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`;
};

function Tile({ label, value, color = 'var(--nes-yellow)' }) {
  return (
    <div className="border-4 border-white/40 bg-black/60 px-3 py-3 text-center">
      <p className="text-[8px] text-gray-300 mb-2">{label}</p>
      <p className="text-lg" style={{ color }}>{value}</p>
    </div>
  );
}

const W = 600;
const PAD = { l: 34, r: 12, t: 18, b: 22 };

function xAt(i, n) {
  return n <= 1 ? PAD.l + (W - PAD.l - PAD.r) / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1);
}

function Frame({ h, n, label, children }) {
  const t = useT();
  const y = (v) => PAD.t + (1 - v / 100) * (h - PAD.t - PAD.b);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto block" role="img" aria-label={label}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.15)" />
          <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{v}</text>
        </g>
      ))}
      <text x={PAD.l} y={h - 6} fontSize="9" fill="#9ca3af">{t('report.journal.oldest')}</text>
      <text x={W - PAD.r} y={h - 6} fontSize="9" fill="#9ca3af" textAnchor="end">{n > 1 ? t('report.journal.latest') : ''}</text>
      {children(y)}
    </svg>
  );
}

// Generic auto-scaled trend line (one or two series) for any numeric session field.
function TrendChart({ list, series, label }) {
  const t = useT();
  const n = list.length;
  const h = 160;
  const has = (s, k) => s[k] != null && s[k] !== '' && Number.isFinite(Number(s[k]));
  const max = Math.max(1, ...series.flatMap(([k]) => list.filter((s) => has(s, k)).map((s) => num(s[k]))));
  const y = (v) => PAD.t + (1 - v / max) * (h - PAD.t - PAD.b);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto block" role="img" aria-label={label}>
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.15)" />
      <line x1={PAD.l} x2={W - PAD.r} y1={y(max)} y2={y(max)} stroke="rgba(255,255,255,0.15)" />
      <text x={PAD.l - 6} y={y(max) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">{Math.round(max * 10) / 10}</text>
      <text x={PAD.l - 6} y={y(0) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">0</text>
      <text x={PAD.l} y={h - 6} fontSize="9" fill="#9ca3af">{t('report.journal.oldest')}</text>
      <text x={W - PAD.r} y={h - 6} fontSize="9" fill="#9ca3af" textAnchor="end">{n > 1 ? t('report.journal.latest') : ''}</text>
      {series.map(([k, c]) => (
        <g key={k}>
          <path d={path(list.flatMap((s, i) => (has(s, k) ? [[xAt(i, n), y(num(s[k]))]] : [])))} fill="none" stroke={c} strokeWidth="2" />
          {list.map((s, i) => (has(s, k) ? <circle key={i} cx={xAt(i, n)} cy={y(num(s[k]))} r="2.5" fill={c} /> : null))}
        </g>
      ))}
    </svg>
  );
}

const GAME_LABEL = { 'focus-ball': 'Focus Ball', 'glow-orb': 'Glow Orb', sailor: 'Sailor', 'sweet-spot': 'Sweet Spot', 'blinking-contest': 'Blinking', diver: 'Diver', 'train-of-thoughts': 'Train' };
const gameName = (g) => GAME_LABEL[g] || g || '?';
const FEELINGS = ['😣', '😕', '😐', '🙂', '😄'];
const SETUP_KEYS = ['hands', 'stand', 'pc'];
const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

function ScoreChart({ list, baseline }) {
  const t = useT();
  const n = list.length;
  return (
    <Frame h={220} n={n} label={t('report.journal.scoreAria')}>
      {(y) => (
        <>
          {baseline != null && (
            <g>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} stroke={PINK} strokeDasharray="5 4" />
              <text x={W - PAD.r} y={y(baseline) + 12} textAnchor="end" fontSize="9" fill={PINK}>{t('report.journal.baseline', { n: Math.round(baseline) })}</text>
            </g>
          )}
          <path d={path(list.map((s, i) => [xAt(i, n), y(num(s.score))]))} fill="none" stroke={YELLOW} strokeWidth="2.5" />
          {list.map((s, i) => {
            const cx = xAt(i, n);
            const cy = y(num(s.score));
            return s.checkIn ? (
              <g key={i}>
                <circle cx={cx} cy={cy} r="6" fill={PINK} stroke="#fff" strokeWidth="1.5" />
                <text x={cx} y={cy - 10} textAnchor="middle" fontSize="8" fill={PINK}>{t('report.journal.checkInTag')}</text>
              </g>
            ) : (
              <circle key={i} cx={cx} cy={cy} r="3" fill={YELLOW} />
            );
          })}
        </>
      )}
    </Frame>
  );
}

function MetricChart({ list }) {
  const t = useT();
  const n = list.length;
  const lines = [['energy', YELLOW], ['increase', CYAN], ['flow', GREEN]];
  return (
    <Frame h={160} n={n} label={t('report.journal.metricAria')}>
      {(y) =>
        lines.map(([k, c]) => (
          <path key={k} d={path(list.map((s, i) => [xAt(i, n), y(num(s[k]))]))} fill="none" stroke={c} strokeWidth="1.5" />
        ))
      }
    </Frame>
  );
}

function Diff({ a, b }) {
  const d = Math.round(num(b) - num(a));
  const color = d > 0 ? 'var(--nes-green)' : d < 0 ? '#ff6b6b' : '#9ca3af';
  return <span style={{ color }}>{d > 0 ? `+${d}` : d}</span>;
}

function CheckInCard({ sessions }) {
  const t = useT();
  const cis = sessions.filter((s) => s.checkIn);
  const first = cis[0];
  const last = cis[cis.length - 1];
  const left = Math.max(0, CHECK_IN_EVERY - sessionsSinceCheckIn(sessions));
  const rows = [[t('report.journal.rowScore'), 'score'], [t('report.journal.rowEnergy'), 'energy'], [t('report.journal.rowIncrease'), 'increase'], [t('report.journal.rowFlow'), 'flow']];
  let footer;
  if (!first) footer = t('report.journal.dueFirst');
  else if (left === 0) footer = t('report.journal.dueNow');
  else footer = t('report.journal.dueIn', { n: left });
  return (
    <div className={panel}>
      <h3 className="text-xs text-[var(--nes-yellow)] mb-3">{t('report.journal.checkIns')}</h3>
      {!first ? (
        <p className="text-[9px] text-gray-300 leading-relaxed mb-3">{t('report.journal.firstCheckIn')}</p>
      ) : (
        <table className="w-full text-[10px] mb-3">
          <thead>
            <tr className="text-gray-400 text-[8px]">
              <th className="text-left font-normal" />
              <th className="font-normal">{t('report.journal.colBaseline')}</th>
              <th className="font-normal">{t('report.journal.colLatest')}</th>
              <th className="font-normal">{t('report.journal.colChange')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, k]) => (
              <tr key={k} className="text-center">
                <td className="text-left py-1 text-gray-200">{label}</td>
                <td>{Math.round(num(first[k]))}</td>
                <td>{last === first ? '-' : Math.round(num(last[k]))}</td>
                <td>{last === first ? '-' : <Diff a={first[k]} b={last[k]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[9px] text-gray-300">{footer}</p>
    </div>
  );
}

export function TrainingJournal() {
  const t = useT();
  const [allSessions, setSessions] = useState(loadSessions);
  const profiles = useProfiles();
  // Player switched / created / deleted anywhere (chip, modal, other tab): re-read the data
  const profileKey = `${profiles.activeId}|${profiles.list.length}`;
  const [seenKey, setSeenKey] = useState(profileKey);
  if (seenKey !== profileKey) {
    setSeenKey(profileKey);
    setSessions(loadSessions());
    setGameFilter('all');
  }
  const [gameFilter, setGameFilter] = useState('all');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef(null);

  const childSessions = useMemo(() => sessionsForChild(allSessions, profiles.activeId), [allSessions, profiles.activeId]);
  const games = useMemo(() => [...new Set(childSessions.map((s) => s.game || 'focus-ball'))], [childSessions]);
  const filter = games.includes(gameFilter) ? gameFilter : 'all';
  const sessions = useMemo(() => (filter === 'all' ? childSessions : childSessions.filter((s) => (s.game || 'focus-ball') === filter)), [childSessions, filter]);
  const withPaf = useMemo(() => childSessions.filter((s) => s.paf != null && Number.isFinite(Number(s.paf))).slice(-30), [childSessions]);

  const stats = useMemo(() => {
    const minutes = Math.round(sessions.reduce((a, s) => a + num(s.playedSec ?? s.durationSec), 0) / 60);
    const best = sessions.reduce((a, s) => Math.max(a, num(s.score)), 0);
    const last7 = sessions.slice(-7);
    const avg7 = last7.length ? Math.round(last7.reduce((a, s) => a + num(s.score), 0) / last7.length) : 0;
    return { total: sessions.length, minutes, best: Math.round(best), avg7, streak: dayStreak(sessions) };
  }, [sessions]);

  const recent = sessions.slice(-30);
  const baseline = sessions.find((s) => s.checkIn);
  const newest = useMemo(() => sessions.slice().reverse(), [sessions]);
  // Score scales differ per game: ALL view shows only the normalised time-in-focus %; score needs a single game.
  const showScoreTrend = filter !== 'all' || games.length <= 1;
  const hasFocusPct = recent.some((s) => s.timeAbovePct != null && s.timeAbovePct !== '' && Number.isFinite(Number(s.timeAbovePct)));
  const trendSeries = [...(showScoreTrend ? [['score', YELLOW]] : []), ...(hasFocusPct ? [['timeAbovePct', CYAN]] : [])];
  const activeName = profiles.list.find((c) => c.id === profiles.activeId)?.name || t('report.journal.thisPlayer');

  const exportFile = () => {
    try {
      const blob = new Blob([exportCsv()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brain-arcade-history-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // ignore
    }
  };
  const onImport = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    f.text()
      .then((text) => {
        const r = importCsv(text);
        setSessions(loadSessions());
        profiles.refresh();
        setNote(t('report.journal.imported', { done: r.sessions, skipped: r.skipped }));
      })
      .catch(() => setNote(t('report.journal.readFail')));
  };
  const clear = () => {
    clearSessions(profiles.activeId);
    setSessions(loadSessions());
    setConfirming(false);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-black text-white" style={FONT}>
      <div className="max-w-3xl mx-auto px-4 pt-20 pb-10 space-y-4">
        <h2 className="text-xl text-[var(--nes-yellow)]">{t('report.journal.title')}</h2>

        <div className="border-4 border-white/40 bg-black/60 px-3 py-3 flex items-center gap-3 flex-wrap">
          <p className="text-[8px] text-gray-300">{t('report.journal.player')}</p>
          <PlayerSwitcher />
        </div>

        {games.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('report.journal.filterAria')}>
            {['all', ...games].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGameFilter(g)}
                aria-pressed={filter === g}
                className={`${smallBtn} ${filter === g ? 'border-[var(--nes-yellow)] bg-[var(--nes-yellow)] text-black' : 'border-white/50 text-white'}`}
              >
                {g === 'all' ? t('report.journal.all') : gameName(g)}
              </button>
            ))}
          </div>
        )}

        {sessions.length === 0 ? (
          <>
          <div className={`${panel} text-center text-xs leading-relaxed`}>{t('report.journal.empty')}
            <div className="mt-3">
              <button type="button" onClick={() => fileRef.current?.click()} className={`${smallBtn} border-[var(--nes-blue)] text-[var(--nes-blue)]`}>{t('report.journal.import')}</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
              {note && <p className="text-[9px] text-gray-300 mt-2">{note}</p>}
            </div>
          </div>
          <AlphaPeakReport panelClass={panel} childKey={profiles.activeId} />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Tile label={t('report.journal.tileSessions')} value={stats.total} />
              <Tile label={t('report.journal.tileMinutes')} value={stats.minutes} />
              <Tile label={t('report.journal.tileStreak')} value={`🔥 ${stats.streak}`} color="#ff9f43" />
              {showScoreTrend && <Tile label={t('report.journal.tileBest')} value={stats.best} color="var(--nes-green)" />}
              {showScoreTrend && <Tile label={t('report.journal.tileAvg')} value={stats.avg7} color={CYAN} />}
            </div>

            {filter !== 'focus-ball' && trendSeries.length > 0 && (
              <div className={panel}>
                <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t(filter === 'all' ? 'report.journal.trendAll' : 'report.journal.trend', { n: recent.length })}</h3>
                <TrendChart
                  list={recent}
                  label={showScoreTrend ? t('report.journal.trendAriaBoth') : t('report.journal.trendAriaFocus')}
                  series={trendSeries}
                />
                <div className="flex gap-4 justify-center text-[9px] mt-2">
                  {showScoreTrend && <span style={{ color: YELLOW }}>■ {t('report.journal.legendScore')}</span>}
                  {hasFocusPct && <span style={{ color: CYAN }}>■ {t('report.journal.legendFocus')}</span>}
                </div>
              </div>
            )}

            {filter === 'focus-ball' && (
            <div className={panel}>
              <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.journal.scoreTitle', { n: recent.length })}</h3>
              <ScoreChart list={recent} baseline={baseline ? num(baseline.score) : null} />
            </div>
            )}

            {filter === 'focus-ball' && (
            <div className={panel}>
              <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.journal.metricTitle')}</h3>
              <MetricChart list={recent} />
              <div className="flex gap-4 justify-center text-[9px] mt-2">
                <span style={{ color: YELLOW }}>■ {t('report.journal.legendEnergy')}</span>
                <span style={{ color: CYAN }}>■ {t('report.journal.legendIncrease')}</span>
                <span style={{ color: GREEN }}>■ {t('report.journal.legendFlow')}</span>
              </div>
            </div>
            )}

            <AlphaPeakReport panelClass={panel} childKey={profiles.activeId} />

            {withPaf.length > 0 && !loadPafHistory(profiles.activeId).length && (
              <div className={panel}>
                <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.journal.pafTitle')}</h3>
                <TrendChart list={withPaf} label={t('report.journal.pafAria')} series={[['paf', PINK]]} />
              </div>
            )}

            {filter === 'focus-ball' && <CheckInCard sessions={sessions} />}

            <div className={panel}>
              <h3 className="text-xs text-[var(--nes-yellow)] mb-2">{t('report.journal.sessions')}</h3>
              <div className="max-h-72 overflow-y-auto overflow-x-auto">
                <table className="w-full text-[9px]">
                  <thead className="text-gray-400 sticky top-0 bg-black">
                    <tr className="text-left">
                      <th className="font-normal py-1">{t('report.journal.colDate')}</th>
                      <th className="font-normal">{t('report.journal.colGame')}</th>
                      <th className="font-normal">{t('report.journal.colLen')}</th>
                      <th className="font-normal" title={t('report.journal.setupHint')}>{t('report.journal.colSetup')}</th>
                      <th className="font-normal hidden sm:table-cell">{t('report.journal.colCue')}</th>
                      <th className="font-normal">{t('report.journal.colScore')}</th>
                      <th className="font-normal hidden sm:table-cell">{t('report.journal.colStars')}</th>
                      <th className="font-normal hidden sm:table-cell">{t('report.journal.colPts')}</th>
                      <th className="font-normal">{t('report.journal.colFeel')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newest.map((s, i) => (
                      <tr key={s.id || `${s.date}-${i}`} className="border-t border-white/10 align-top">
                        <td className="py-1 pr-2">
                          {fmtDate(s.date)}
                          {s.checkIn && <span className="ml-1 text-[var(--nes-green)]">{t('report.journal.checkInTag')}</span>}
                        </td>
                        <td className="pr-2">{gameName(s.game)}</td>
                        <td className="pr-2">{s.durationSec ? t('report.journal.lenMin', { n: Math.round(num(s.durationSec) / 60) }) : '-'}</td>
                        <td className="pr-2" title={SETUP_KEYS.includes(sessionSetup(s)) ? t(`report.journal.setupTitle.${sessionSetup(s)}`) : t('report.journal.setupUnknown')}>
                          {SETUP_KEYS.includes(sessionSetup(s)) ? t(`report.journal.setupShort.${sessionSetup(s)}`) : '?'}
                        </td>
                        <td className="pr-2 hidden sm:table-cell">{s.cue || '-'}</td>
                        <td className="pr-2 text-[var(--nes-yellow)]">{Math.round(num(s.score))}</td>
                        <td className="pr-2 text-[var(--nes-yellow)] hidden sm:table-cell">{'★'.repeat(Math.max(0, Math.min(3, num(s.stars))))}</td>
                        <td className="pr-2 hidden sm:table-cell">{Math.round(num(s.points))}</td>
                        <td>{FEELINGS[num(s.feeling) - 1] || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <button type="button" onClick={exportFile} className={`${smallBtn} border-[var(--nes-green)] text-[var(--nes-green)] hover:bg-[var(--nes-green)] hover:text-black`}>
                {t('report.journal.export')}
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className={`${smallBtn} border-[var(--nes-blue)] text-[var(--nes-blue)] hover:bg-[var(--nes-blue)] hover:text-black`}>
                {t('report.journal.import')}
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImport} />
              {note && <span className="text-[9px] text-gray-300">{note}</span>}
              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} className={`${smallBtn} border-white/60 text-white hover:bg-white hover:text-black`}>
                  {t('report.journal.clear')}
                </button>
              ) : (
                <>
                  <span className="text-[9px] text-gray-300">{t('report.journal.confirmClear', { name: activeName })}</span>
                  <button type="button" onClick={clear} className={`${smallBtn} border-red-400 text-red-400 hover:bg-red-400 hover:text-black`}>{t('report.journal.yesClear')}</button>
                  <button type="button" onClick={() => setConfirming(false)} className={`${smallBtn} border-white/60 text-white`}>{t('report.journal.cancel')}</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
