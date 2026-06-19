'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import PlayerNameSelect from '@/components/PlayerNameSelect';
import type { ManualMatchInput, ManualPlayerInput } from '@/lib/shared-types';

// The four name slots, in form order. team1 = partners, team2 = partners.
const SLOTS = ['t1p1', 't1p2', 't2p1', 't2p2'] as const;
type Slot = (typeof SLOTS)[number];

// Optional per-player stats shown behind the "detailed stats" toggle.
const STAT_COLS = [
  { key: 'tricks', label: 'Tricks', title: 'Total tricks won' },
  { key: 'handsCalled', label: 'Called', title: 'Hands called (became maker)' },
  { key: 'callsWon', label: 'Made', title: 'Calls won (not euchred)' },
  { key: 'euchres', label: 'Set', title: 'Times euchred when calling' },
  { key: 'defEuch', label: '🛡', title: 'Euchres your team inflicted on opponents' },
  { key: 'marches', label: 'March', title: 'Marches (5-trick sweeps)' },
  { key: 'loneCalled', label: 'Lone', title: 'Loners called' },
  { key: 'loneWon', label: 'Lone✓', title: 'Loners made' },
] as const;

const STORAGE_KEY = 'euchre.lastTeams';

export default function LogGamePage() {
  const [names, setNames] = useState<Record<Slot, string>>({
    t1p1: '',
    t1p2: '',
    t2p1: '',
    t2p2: '',
  });
  const [winner, setWinner] = useState<'team1' | 'team2' | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [score, setScore] = useState({ t1: '', t2: '' });
  const [hands, setHands] = useState('');
  const [details, setDetails] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the same crew from last time for quick repeat entry.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') setNames((n) => ({ ...n, ...saved }));
    } catch {
      /* ignore */
    }
  }, []);

  const setName = (slot: Slot, v: string) => setNames((n) => ({ ...n, [slot]: v }));
  const setDetail = (slot: Slot, key: string, v: string) =>
    setDetails((d) => ({ ...d, [slot]: { ...d[slot], [key]: v } }));

  const team1Label = `${names.t1p1.trim() || 'Player 1'} & ${names.t1p2.trim() || 'Player 2'}`;
  const team2Label = `${names.t2p1.trim() || 'Player 3'} & ${names.t2p2.trim() || 'Player 4'}`;

  // Client-side gate (the server validates again).
  const validation = useMemo<string | null>(() => {
    const list = SLOTS.map((s) => names[s].trim());
    if (list.some((n) => !n)) return 'Enter all four player names.';
    if (new Set(list.map((n) => n.toLowerCase())).size !== 4) return 'All four names must be different.';
    if (!winner) return 'Pick which team won.';
    return null;
  }, [names, winner]);

  function buildInput(): ManualMatchInput {
    const numOrUndef = (v?: string) =>
      v && v.trim() ? Math.max(0, Math.floor(Number(v) || 0)) : undefined;
    const player = (slot: Slot): ManualPlayerInput => {
      const d = details[slot] ?? {};
      return {
        name: names[slot].trim(),
        tricks: numOrUndef(d.tricks),
        handsCalled: numOrUndef(d.handsCalled),
        callsWon: numOrUndef(d.callsWon),
        euchres: numOrUndef(d.euchres),
        defensiveEuchres: numOrUndef(d.defEuch),
        marches: numOrUndef(d.marches),
        loneCalled: numOrUndef(d.loneCalled),
        loneWon: numOrUndef(d.loneWon),
      };
    };
    return {
      team1: [player('t1p1'), player('t1p2')],
      team2: [player('t2p1'), player('t2p2')],
      winner: winner!,
      finalScore:
        score.t1.trim() || score.t2.trim()
          ? { team1: Number(score.t1) || 0, team2: Number(score.t2) || 0 }
          : undefined,
      handsPlayed: hands.trim() ? Number(hands) || 0 : undefined,
    };
  }

  function save() {
    setError(null);
    if (validation) {
      setError(validation);
      return;
    }
    setStatus('saving');
    getSocket().emit('stats:add', buildInput(), (res) => {
      if (res.ok) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
        } catch {
          /* ignore */
        }
        setStatus('saved');
      } else {
        setStatus('idle');
        setError(res.error);
      }
    });
  }

  /** Reset for another game but keep the same players. */
  function logAnother() {
    setWinner(null);
    setScore({ t1: '', t2: '' });
    setHands('');
    setDetails({});
    setShowDetails(false);
    setStatus('idle');
    setError(null);
  }

  if (status === 'saved') {
    return (
      <main className="min-h-screen px-4 py-10 max-w-md mx-auto text-center">
        <div className="bg-black/40 border border-gold/40 rounded-2xl p-8 space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="font-display text-3xl text-gold">Game logged!</h1>
          <p className="text-white/70 text-sm">
            {winner === 'team1' ? team1Label : team2Label} took it down. It&apos;s now in the
            dashboard.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={logAnother}
              className="bg-gold text-black font-semibold rounded-lg py-2.5 hover:brightness-110"
            >
              Log another game
            </button>
            <Link
              href="/stats"
              className="bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg py-2.5 font-medium"
            >
              View dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const nameInput = (slot: Slot, placeholder: string) => (
    <PlayerNameSelect
      value={names[slot]}
      onChange={(v) => setName(slot, v)}
      placeholder={placeholder}
    />
  );

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Stats</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">
            Log an in-person game
          </h1>
          <p className="text-white/55 text-sm mt-1">
            Record a game you played at the table. Only the four names and the winner are required.
          </p>
        </div>
        <Link
          href="/stats"
          className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← Stats
        </Link>
      </div>

      <div className="space-y-4">
        {/* Teams */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gold/90 font-semibold mb-1">
              Team 1 <span className="text-white/40 normal-case">(partners)</span>
            </div>
            {nameInput('t1p1', 'Player 1')}
            {nameInput('t1p2', 'Player 2')}
          </div>
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-gold/90 font-semibold mb-1">
              Team 2 <span className="text-white/40 normal-case">(partners)</span>
            </div>
            {nameInput('t2p1', 'Player 3')}
            {nameInput('t2p2', 'Player 4')}
          </div>
        </div>

        {/* Winner */}
        <div>
          <div className="text-xs uppercase tracking-wider text-white/70 mb-2">Who won?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['team1', 'team2'] as const).map((t) => {
              const sel = winner === t;
              const label = t === 'team1' ? team1Label : team2Label;
              return (
                <button
                  key={t}
                  onClick={() => setWinner(t)}
                  aria-pressed={sel}
                  className={`rounded-xl py-3 px-3 border text-sm font-medium transition ${
                    sel
                      ? 'bg-gold text-black border-gold'
                      : 'bg-black/40 border-white/15 text-white/85 hover:border-gold/60'
                  }`}
                >
                  {sel ? '🏆 ' : ''}
                  {label} won
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional details */}
        <div className="bg-black/30 border border-white/10 rounded-xl">
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-white/80"
            aria-expanded={showDetails}
          >
            <span>➕ Add final score &amp; detailed stats (optional)</span>
            <span aria-hidden>{showDetails ? '▲' : '▼'}</span>
          </button>
          {showDetails && (
            <div className="px-4 pb-4 space-y-4 border-t border-white/10 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-white/60">
                  Team 1 score
                  <input
                    type="number"
                    min={0}
                    value={score.t1}
                    onChange={(e) => setScore((s) => ({ ...s, t1: e.target.value }))}
                    className="mt-1 w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold"
                  />
                </label>
                <label className="text-xs text-white/60">
                  Team 2 score
                  <input
                    type="number"
                    min={0}
                    value={score.t2}
                    onChange={(e) => setScore((s) => ({ ...s, t2: e.target.value }))}
                    className="mt-1 w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold"
                  />
                </label>
                <label className="text-xs text-white/60">
                  Hands played
                  <input
                    type="number"
                    min={0}
                    value={hands}
                    onChange={(e) => setHands(e.target.value)}
                    className="mt-1 w-full bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="text-white/55">
                    <tr>
                      <th className="text-left font-medium pb-1">Player</th>
                      {STAT_COLS.map((c) => (
                        <th key={c.key} title={c.title} className="font-medium pb-1 px-1">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SLOTS.map((slot) => (
                      <tr key={slot}>
                        <td className="py-1 pr-2 text-white/80 truncate max-w-[90px]">
                          {names[slot].trim() || slot}
                        </td>
                        {STAT_COLS.map((c) => (
                          <td key={c.key} className="px-0.5 py-0.5">
                            <input
                              type="number"
                              min={0}
                              value={details[slot]?.[c.key] ?? ''}
                              onChange={(e) => setDetail(slot, c.key, e.target.value)}
                              className="w-12 bg-black/40 border border-white/15 rounded px-1 py-1 text-center outline-none focus:border-gold"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-white/40 mt-1">
                  Leave blank for any stat you didn&apos;t track — it&apos;ll record as 0.
                </p>
              </div>
            </div>
          )}
        </div>

        {error && <div className="text-red-300 text-sm">{error}</div>}

        <button
          onClick={save}
          disabled={status === 'saving' || validation !== null}
          className="w-full bg-gold text-black font-semibold rounded-lg py-3 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          title={validation ?? 'Save this game'}
        >
          {status === 'saving' ? 'Saving…' : 'Save game'}
        </button>
      </div>
    </main>
  );
}
