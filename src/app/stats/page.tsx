'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import {
  prepareGames,
  computePlayers,
  computeDuos,
  computeHeadToHead,
  computeSuperlatives,
  filterMatches,
  sortPlayers,
  type Superlative,
} from '@/lib/stats-analytics';
import { computeElo, mostImproved } from '@/lib/stats-elo';
import { computeBadges } from '@/lib/stats-achievements';
import { computeClutch } from '@/lib/stats-clutch';
import { computeSessions } from '@/lib/stats-sessions';
import { playersToCSV } from '@/lib/stats-csv';
import { clearAdminKey, getAdminKey, promptAdminKey } from '@/lib/stats-admin-key';
import SuperlativeCards from '@/components/stats/SuperlativeCards';
import StatsFilters, {
  EMPTY_FILTERS,
  matchFilterFor,
  type StatsFilterState,
} from '@/components/stats/StatsFilters';
import Leaderboard, { type RankedRow, type LeaderKey } from '@/components/stats/Leaderboard';
import AchievementsStrip from '@/components/stats/AchievementsStrip';
import DuosSection from '@/components/stats/DuosSection';
import FrenemyTable from '@/components/stats/FrenemyTable';
import PartnershipHeatmap from '@/components/stats/PartnershipHeatmap';
import CallsByRank from '@/components/stats/CallsByRank';
import CallsBySuit from '@/components/stats/CallsBySuit';
import DealerAnalytics from '@/components/stats/DealerAnalytics';
import LuckIndex from '@/components/stats/LuckIndex';
import PartnershipScatter from '@/components/stats/PartnershipScatter';
import { EloTimelineChart, VolumeChart } from '@/components/stats/StatCharts';
import HandLevelData from '@/components/stats/HandLevelData';
import SessionRecap from '@/components/stats/SessionRecap';
import GameRow from '@/components/stats/GameRow';

/** A titled dashboard panel. */
function Section({
  title,
  children,
  right,
  note,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-gold font-semibold">{title}</h2>
          {note && <p className="text-[11px] text-white/45 mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Interactive controls.
  const [minGames, setMinGames] = useState(1); // leaderboard / efficiency qualification
  const [duoMin, setDuoMin] = useState(2); // min games together for best/worst duos
  const [sortKey, setSortKey] = useState<LeaderKey>('rating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filters (date range + how the game was recorded)
  const [filters, setFilters] = useState<StatsFilterState>(EMPTY_FILTERS);
  const [fullStats, setFullStats] = useState(true); // leaderboard: all stat columns (default on)
  const [showHands, setShowHands] = useState(false); // full hand-level data set (collapsed by default)
  const [showDealer, setShowDealer] = useState(false); // dealer analytics (loads heavy bid logs)
  const [showLuck, setShowLuck] = useState(false); // luck index (loads heavy trick logs)

  // Charts render client-only (canvas), so gate them until after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Admin unlock: deleting games requires the shared admin key (checked server-
  // side). Kept in sessionStorage (see stats-admin-key.ts) so an admin enters it
  // once per tab; delete controls stay hidden until unlocked. The real gate is on
  // the server — this is just UX.
  const [adminKey, setAdminKey] = useState<string | null>(null);
  useEffect(() => {
    setAdminKey(getAdminKey());
  }, []);

  // Ignore socket acks that land after this page has unmounted.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(() => {
    getSocket().emit('stats:get', (payload) => {
      if (!alive.current) return;
      setData(payload);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function unlockAdmin() {
    const k = promptAdminKey('Enter the stats admin key to enable deleting games:');
    if (k) setAdminKey(k);
  }
  function lockAdmin() {
    clearAdminKey();
    setAdminKey(null);
  }

  function onDelete(id: string) {
    if (!adminKey) return; // delete controls are hidden while locked
    if (!window.confirm('Delete this game from the stats? This cannot be undone.')) return;
    getSocket().emit('stats:delete', { id, key: adminKey }, (res) => {
      if (res.ok) {
        load();
        return;
      }
      if (res.code === 'auth') {
        lockAdmin();
        window.alert(`${res.error}\n\nThe saved key was cleared — click “Admin” to re-enter it.`);
      } else {
        window.alert(res.error);
      }
    });
  }

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  // Apply the date/source filters before computing anything.
  const matches = useMemo(() => filterMatches(allMatches, matchFilterFor(filters)), [allMatches, filters]);
  // Run the human-only filter + name canonicalization ONCE per history change;
  // every compute function recognises the prepared array and skips its own pass.
  const human = useMemo(() => prepareGames(matches), [matches]);
  const players = useMemo(() => computePlayers(human), [human]);
  const duos = useMemo(() => computeDuos(human), [human]);
  const h2h = useMemo(() => computeHeadToHead(human), [human]);
  const elo = useMemo(() => computeElo(human), [human]);
  const badges = useMemo(() => computeBadges(human, players, elo), [human, players, elo]);
  const improved = useMemo(() => mostImproved(elo), [elo]);
  const clutch = useMemo(() => computeClutch(human), [human]);
  const sessions = useMemo(() => computeSessions(human), [human]);
  const lastSession = sessions.length ? sessions[sessions.length - 1] : null;

  // Lowest-Elo player among the qualified set (gets the WFEPE card + seahorse).
  const lowestEloName = useMemo<string | null>(() => {
    const rated = players
      .filter((p) => p.games >= minGames)
      .map((p) => ({ name: p.name, rating: elo.get(p.name)?.rating }))
      .filter((p): p is { name: string; rating: number } => p.rating != null);
    if (!rated.length) return null;
    return rated.reduce((lo, p) => (p.rating < lo.rating ? p : lo)).name;
  }, [players, elo, minGames]);

  // Superlatives + Most-Improved + WFEPE (Elo-based) cards.
  const superlatives = useMemo<Superlative[]>(() => {
    const base = computeSuperlatives(players, minGames);
    const earned = improved && improved.gain > 0;
    const mi: Superlative = {
      id: 'improved',
      emoji: '📈',
      title: 'Most Improved',
      blurb: 'Biggest recent Elo gain',
      player: earned ? improved!.name : null,
      value: earned ? `+${improved!.gain}` : '—',
      sub: earned ? 'Elo over recent games' : undefined,
    };
    const wfepe: Superlative = {
      id: 'wfepe',
      emoji: '🌊', // rendered as a seahorse in the card
      title: 'WFEPE',
      blurb: 'Lowest Elo rating',
      player: lowestEloName,
      value: lowestEloName ? `${elo.get(lowestEloName)?.rating ?? '—'}` : '—',
      sub: lowestEloName ? 'lowest Elo' : undefined,
    };

    // ── Clutch cards (from the hand-by-hand score log) ──
    const closeQualified = clutch.players.filter((p) => p.closeGames >= 3);
    const closer = closeQualified.length
      ? closeQualified.reduce((best, p) =>
          p.closeWinPct > best.closeWinPct ||
          (p.closeWinPct === best.closeWinPct && p.closeGames > best.closeGames)
            ? p
            : best
        )
      : null;
    const closerCard: Superlative = {
      id: 'closer',
      emoji: '🔒',
      title: 'The Closer',
      blurb: 'Best record in close games (min 3, decided by ≤2)',
      player: closer ? closer.name : null,
      value: closer ? `${Math.round(closer.closeWinPct * 100)}%` : '—',
      sub: closer ? `${closer.closeWins}–${closer.closeLosses} in close games` : undefined,
    };

    const cb = clutch.biggestComeback;
    const comebackCard: Superlative = {
      id: 'comeback',
      emoji: '🚀',
      title: 'Comeback Kings',
      blurb: 'Biggest deficit ever overcome',
      player: cb ? cb.names[0] : null,
      players: cb ? cb.names : undefined,
      value: cb ? `down ${cb.deficit}` : '—',
      sub: cb
        ? `won ${cb.match.finalScore[cb.team]}–${
            cb.match.finalScore[cb.team === 'NS' ? 'EW' : 'NS']
          }`
        : undefined,
    };

    const heartbreak = clutch.players
      .filter((p) => (p.blownLeads ?? 0) > 0)
      .reduce<(typeof clutch.players)[number] | null>(
        (worst, p) => (!worst || (p.blownLeads ?? 0) > (worst.blownLeads ?? 0) ? p : worst),
        null
      );
    const heartbreakCard: Superlative = {
      id: 'heartbreaker',
      emoji: '💔',
      title: 'The Heartbreaker',
      blurb: 'Most 5+ point leads lost',
      player: heartbreak ? heartbreak.name : null,
      value: heartbreak ? `${heartbreak.blownLeads}` : '—',
      sub: heartbreak ? 'blown 5+ point leads' : undefined,
    };

    return [mi, wfepe, closerCard, comebackCard, heartbreakCard, ...base];
  }, [players, minGames, improved, lowestEloName, elo, clutch]);

  // Merge Elo onto each player for the leaderboard.
  const ranked = useMemo<RankedRow[]>(
    () =>
      players.map((p) => {
        const e = elo.get(p.name);
        return {
          ...p,
          rating: e ? e.rating : null,
          ratingProvisional: e ? e.provisional : false,
          ratingDelta: e ? e.delta : 0,
        };
      }),
    [players, elo]
  );

  const qualified = useMemo(() => ranked.filter((p) => p.games >= minGames), [ranked, minGames]);
  const sorted = useMemo(() => {
    if (sortKey === 'rating') {
      const mult = sortDir === 'desc' ? -1 : 1;
      return qualified
        .slice()
        .sort((a, b) => ((a.rating ?? 0) - (b.rating ?? 0)) * mult || b.games - a.games);
    }
    // Other keys are PlayerRow fields — reuse the shared sorter (same objects).
    return sortPlayers(qualified, sortKey, sortDir) as RankedRow[];
  }, [qualified, sortKey, sortDir]);

  const maxGames = useMemo(() => players.reduce((m, p) => Math.max(m, p.games), 0), [players]);
  const hiddenCount = players.length - qualified.length;

  function onSort(key: LeaderKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function downloadCSV() {
    const csv = playersToCSV(players, elo);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pal-trilam-euchre-stats.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const recent = useMemo(
    () => human.slice().sort((a, b) => b.ts - a.ts).slice(0, 10),
    [human]
  );

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Analytics</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight">
            PAL/Tri-Lam Dashboard
          </h1>
          <p className="text-white/55 text-sm mt-1">
            {human.length} completed {human.length === 1 ? 'game' : 'games'} among four humans
            {data && data.totalMatches > human.length && (
              <span className="text-white/35">
                {' '}
                · {data.totalMatches - human.length} with bots (not counted)
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <Link
            href="/stats/log"
            className="text-sm bg-gold text-black font-semibold rounded-lg px-3 py-2 hover:brightness-110 whitespace-nowrap"
          >
            ✏️ Log a game
          </Link>
          <Link
            href="/"
            className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
          >
            ← Home
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div className="text-white/60">Loading analytics…</div>
      ) : human.length === 0 ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70 space-y-2">
          <p className="text-lg text-white/90">No fully-human games recorded yet.</p>
          <p className="text-sm">
            This dashboard only counts games where all four seats were real people. Finish a game
            with four humans (no bot fill-ins) and the standings, partnerships, rivalries, and charts
            will populate here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Last game night at a glance */}
          {lastSession && <SessionRecap session={lastSession} />}

          {/* Leaderboard — top of page */}
          <Section
            title="Leaderboard"
            note={fullStats ? 'All stats · tap any column to sort' : 'Tap any column to sort'}
            right={
              <button
                onClick={() => setFullStats((v) => !v)}
                className="text-xs bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5 whitespace-nowrap"
                aria-pressed={fullStats}
              >
                {fullStats ? 'Standard view' : '📊 All stats'}
              </button>
            }
          >
            {sorted.length === 0 ? (
              <p className="text-white/50 text-sm">
                No players with at least {minGames} games. Lower the “min games” slider.
              </p>
            ) : (
              <Leaderboard
                rows={sorted}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                full={fullStats}
                seahorseName={lowestEloName}
              />
            )}
          </Section>

          {/* Full hand-level data set — collapsed by default; the standard dashboard below is unchanged. */}
          <Section
            title="Full hand-level data"
            note="Every hand from every game — dealer, trump, up-card, bidding, result, tricks"
            right={
              <button
                onClick={() => setShowHands((v) => !v)}
                aria-pressed={showHands}
                className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
              >
                {showHands ? 'Collapse' : '🔍 Expand full data'}
              </button>
            }
          >
            {showHands ? (
              <HandLevelData matches={human} />
            ) : (
              <p className="text-white/45 text-sm">
                Expand to explore the complete hand-by-hand data set — every hand’s bids, up-card,
                trump, and tricks — plus a hand-level CSV download.
              </p>
            )}
          </Section>

          {/* Superlatives */}
          <SuperlativeCards awards={superlatives} />

          {/* Controls */}
          <section className="bg-black/30 border border-white/10 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                <span className="uppercase tracking-wider">Min games (rankings)</span>
                <span className="text-gold font-medium">{minGames}</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(5, maxGames)}
                value={minGames}
                onChange={(e) => setMinGames(Number(e.target.value))}
                className="w-full accent-gold"
                aria-label="Minimum games to qualify for the leaderboard"
              />
              <div className="text-[11px] text-white/40 mt-0.5">
                Hide casual guests from win-% rankings
                {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
              </div>
            </label>
            <label className="block">
              <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                <span className="uppercase tracking-wider">Min games together (duos)</span>
                <span className="text-gold font-medium">{duoMin}</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(3, maxGames)}
                value={duoMin}
                onChange={(e) => setDuoMin(Number(e.target.value))}
                className="w-full accent-gold"
                aria-label="Minimum games together to qualify a partnership"
              />
              <div className="text-[11px] text-white/40 mt-0.5">
                Filters the best/worst partnership lists
              </div>
            </label>
          </section>

          {/* Filters + actions */}
          <StatsFilters value={filters} onChange={setFilters}>
            <Link
              href="/stats/compare"
              className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
            >
              ⚖️ Compare
            </Link>
            <button
              onClick={downloadCSV}
              className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
            >
              ⬇️ CSV
            </button>
          </StatsFilters>

          {/* Charts */}
          <Section
            title="Elo over time"
            note={`Every rated game, players with ≥ ${minGames} games — the story of the rivalry`}
          >
            {mounted && qualified.length > 0 ? (
              <EloTimelineChart elo={elo} names={qualified.map((p) => p.name)} />
            ) : (
              <p className="text-white/40 text-sm">Not enough qualifying players.</p>
            )}
          </Section>
          <Section title="Who shows up" note="Total games played">
            {mounted && players.length > 0 ? (
              <VolumeChart players={players} />
            ) : (
              <p className="text-white/40 text-sm">No games yet.</p>
            )}
          </Section>

          {/* Partnership matrix */}
          <Section title="Partnership matrix" note="Win % when two players partner up">
            <PartnershipHeatmap players={players} duos={duos} />
          </Section>

          {/* Calls by rank */}
          <Section
            title="Calls by rank"
            note="Which card ranks players call trump on — the round-1 up-card rank, or R2 for a round-2 named call"
          >
            {mounted ? (
              <CallsByRank matches={human} />
            ) : (
              <p className="text-white/40 text-sm">Loading…</p>
            )}
          </Section>

          {/* Calls by suit */}
          <Section
            title="Calls by suit"
            note="Which trump suits players like to call — and how those calls work out"
          >
            {mounted ? (
              <CallsBySuit matches={human} />
            ) : (
              <p className="text-white/40 text-sm">Loading…</p>
            )}
          </Section>

          {/* Dealer & position */}
          <Section
            title="Dealer & position"
            note="The measured dealer advantage, call rates by seat, and stuck dealers"
            right={
              <button
                onClick={() => setShowDealer((v) => !v)}
                aria-pressed={showDealer}
                className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
              >
                {showDealer ? 'Collapse' : '🃏 Expand'}
              </button>
            }
          >
            {showDealer ? (
              <DealerAnalytics matches={human} />
            ) : (
              <p className="text-white/45 text-sm">
                Expand to see how big the dealer advantage really is, who calls from where, and how
                stuck dealers fare. Loads the full bid logs on demand.
              </p>
            )}
          </Section>

          {/* Luck index */}
          <Section
            title="Luck index"
            note="Who gets dealt the cards — trump and bowers per hand, reconstructed from the trick log"
            right={
              <button
                onClick={() => setShowLuck((v) => !v)}
                aria-pressed={showLuck}
                className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
              >
                {showLuck ? 'Collapse' : '🍀 Expand'}
              </button>
            }
          >
            {showLuck ? (
              <LuckIndex matches={human} />
            ) : (
              <p className="text-white/45 text-sm">
                Expand to settle the argument: who actually runs good. Separates card luck from
                skill using every card ever played. Loads the full trick logs on demand.
              </p>
            )}
          </Section>

          {/* Partnership win % by team */}
          <Section
            title="Partnership win % by team"
            note={`Each pairing ranked best to worst · ${duoMin}+ games (use the slider above)`}
          >
            <PartnershipScatter duos={duos} minGames={duoMin} />
          </Section>

          {/* Dynamic Duos */}
          <Section title="Dynamic Duos">
            <DuosSection duos={duos} minTogether={duoMin} />
          </Section>

          {/* Frenemies */}
          <Section
            title="Frenemies — head to head"
            note="Records when two players are on opposing teams"
          >
            <FrenemyTable rows={h2h} minMeetings={1} />
          </Section>

          {/* Achievements */}
          <Section title="🏅 Achievements" note="Badges earned by the crew">
            <AchievementsStrip badges={badges} />
          </Section>

          {/* Recent matches */}
          <Section
            title="Recent games"
            right={
              <div className="flex items-center gap-2">
                <Link
                  href="/stats/games"
                  className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-2.5 py-1"
                >
                  View all →
                </Link>
                <button
                  onClick={adminKey ? lockAdmin : unlockAdmin}
                  title={
                    adminKey
                      ? 'Admin unlocked — click to lock deleting again'
                      : 'Enter the admin key to enable deleting games'
                  }
                  className="text-xs text-white/50 hover:text-white/80 border border-white/15 rounded-lg px-2.5 py-1"
                >
                  {adminKey ? '🔒 Admin ✓' : '🔓 Admin'}
                </button>
              </div>
            }
          >
            <div className="space-y-2">
              {recent.map((m) => (
                <GameRow key={m.id} match={m} onDelete={adminKey ? onDelete : undefined} />
              ))}
            </div>
          </Section>

          <p className="text-[11px] text-white/40 leading-snug">
            Only games played by four humans count — bot fill-ins are excluded. Players are matched by
            display name, so use the same name each time to keep your history together. Win % on a
            handful of games is noisy; use the “min games” slider to focus on the regulars.
          </p>
        </div>
      )}
    </main>
  );
}
