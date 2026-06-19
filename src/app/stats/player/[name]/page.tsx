'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getSocket } from '@/lib/socket-client';
import type { MatchRecord, StatsPayload } from '@/lib/shared-types';
import { computePlayers } from '@/lib/stats-analytics';
import { computeElo } from '@/lib/stats-elo';
import { computeProfile, computeRadar } from '@/lib/stats-profile';
import { computeBadges, badgesFor } from '@/lib/stats-achievements';
import { RadarChart, EloLineChart } from '@/components/stats/ProfileCharts';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const one = (n: number) => n.toFixed(1);

type Tab = 'overview' | 'partners' | 'trends' | 'field';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'partners', label: 'Partnerships' },
  { id: 'trends', label: 'Trends' },
  { id: 'field', label: 'Vs. The Field' },
];

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="font-display text-2xl text-gold leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-white/45">{sub}</div>}
    </div>
  );
}

export default function PlayerProfilePage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent((params?.name ?? '').toString());

  const [data, setData] = useState<StatsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    socket.emit('stats:get', (payload) => {
      if (!cancelled) {
        setData(payload);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allMatches = useMemo<MatchRecord[]>(() => data?.matches ?? [], [data]);
  const players = useMemo(() => computePlayers(allMatches), [allMatches]);
  const elo = useMemo(() => computeElo(allMatches), [allMatches]);
  const radar = useMemo(() => computeRadar(players), [players]);
  const profile = useMemo(() => computeProfile(name, allMatches), [name, allMatches]);
  const myRow = useMemo(() => players.find((p) => p.name === name) ?? null, [players, name]);
  const myElo = elo.get(name) ?? null;
  const myRadar = radar.get(name) ?? null;
  const myBadges = useMemo(() => badgesFor(name, computeBadges(players, elo)), [players, elo, name]);

  return (
    <main className="min-h-screen px-3 sm:px-4 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">Player</div>
          <h1 className="font-display text-3xl sm:text-4xl text-gold tracking-wide leading-tight truncate">
            {name}
          </h1>
        </div>
        <Link
          href="/stats"
          className="shrink-0 text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-2"
        >
          ← Dashboard
        </Link>
      </div>

      {!loaded ? (
        <div className="text-white/60">Loading…</div>
      ) : !profile.exists ? (
        <div className="bg-black/40 border border-white/10 rounded-2xl p-6 text-white/70">
          No completed four-human games for <span className="text-white/90">{name}</span> yet.
        </div>
      ) : (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
            <Kpi label="Elo" value={myElo ? myElo.rating : '—'} sub={myElo?.provisional ? 'provisional' : undefined} />
            <Kpi label="Games" value={profile.games} />
            <Kpi label="Record" value={`${profile.wins}-${profile.losses}`} />
            <Kpi label="Win %" value={pct(profile.winPct)} />
            <Kpi label="PPG" value={myRow ? one(myRow.ppgFor) : '—'} sub={myRow ? `${myRow.pointDiff >= 0 ? '+' : ''}${one(myRow.pointDiff)} diff` : undefined} />
            <Kpi label="Streak" value={myRow ? (myRow.currentStreak === 0 ? '—' : `${myRow.currentStreak > 0 ? 'W' : 'L'}${Math.abs(myRow.currentStreak)}`) : '—'} />
          </div>

          {myBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {myBadges.map((b) => (
                <span
                  key={b.id}
                  title={b.desc}
                  className="text-xs bg-black/40 border border-gold/30 rounded-full px-2 py-1"
                >
                  {b.emoji} {b.name}
                </span>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/10 mb-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                  tab === t.id ? 'border-gold text-gold' : 'border-transparent text-white/60 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Play style</h2>
                {mounted && myRadar ? (
                  <RadarChart axes={myRadar.scaled} raw={myRadar.raw} />
                ) : (
                  <p className="text-white/40 text-sm">Not enough data.</p>
                )}
                <p className="text-[11px] text-white/40 mt-1">Each axis is scaled relative to the club (hover for raw values).</p>
              </section>
              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Calling</h2>
                {myRow ? (
                  <dl className="text-sm space-y-1.5">
                    <Row k="Hands called" v={myRow.handsCalled} />
                    <Row k="Call success" v={`${myRow.callsWon}/${myRow.handsCalled} · ${pct(myRow.callPct)}`} />
                    <Row k="Marches" v={myRow.marches} />
                    <Row k="Euchred (set)" v={myRow.euchres} />
                    <Row k="Loners called / made" v={`${myRow.loneCalled} / ${myRow.loneWon}`} />
                    <Row k="Total tricks" v={myRow.tricks} />
                  </dl>
                ) : (
                  <p className="text-white/40 text-sm">No data.</p>
                )}
              </section>
            </div>
          )}

          {/* ── Partnerships ── */}
          {tab === 'partners' && <PartnersTab profile={profile} />}

          {/* ── Trends ── */}
          {tab === 'trends' && (
            <div className="space-y-4">
              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Elo over time</h2>
                {mounted && myElo && myElo.history.length > 1 ? (
                  <EloLineChart history={myElo.history} />
                ) : (
                  <p className="text-white/40 text-sm">Needs a few more games.</p>
                )}
              </section>
              <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Recent form</h2>
                <div className="flex flex-wrap gap-1">
                  {profile.rollingForm.slice(-20).map((w, i) => (
                    <span
                      key={i}
                      title={w ? 'Win' : 'Loss'}
                      className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-semibold ${
                        w ? 'bg-emerald-500/30 text-emerald-200' : 'bg-red-500/30 text-red-200'
                      }`}
                    >
                      {w ? 'W' : 'L'}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-white/40 mt-1">Most recent {Math.min(20, profile.rollingForm.length)} games (left → right).</p>
              </section>
              <ActivitySection profile={profile} />
            </div>
          )}

          {/* ── Vs The Field ── */}
          {tab === 'field' && <FieldTab profile={profile} />}
        </>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-white/5 pb-1">
      <span className="text-white/60">{k}</span>
      <span className="text-white/90">{v}</span>
    </div>
  );
}

function PartnersTab({ profile }: { profile: ReturnType<typeof computeProfile> }) {
  const qualified = profile.partners.filter((p) => p.games >= 2);
  const best = qualified.slice().sort((a, b) => b.winPct - a.winPct || b.games - a.games)[0];
  const worst = qualified.slice().sort((a, b) => a.winPct - b.winPct || b.games - a.games)[0];
  return (
    <div className="space-y-4">
      {best && worst && best !== worst && (
        <div className="grid grid-cols-2 gap-3">
          <Callout emoji="💞" title="Best partner" name={best.name} detail={`${pct(best.winPct)} · ${best.wins}-${best.losses}`} good />
          <Callout emoji="🙅" title="Toughest pairing" name={worst.name} detail={`${pct(worst.winPct)} · ${worst.wins}-${worst.losses}`} />
        </div>
      )}
      <section className="bg-black/40 border border-white/10 rounded-2xl p-4 overflow-x-auto">
        <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Every partner</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-white/55 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-1">Partner</th>
              <th className="text-right py-1 px-2">GP</th>
              <th className="text-right py-1 px-2">W-L</th>
              <th className="text-right py-1 px-2">Win%</th>
              <th className="text-right py-1 px-2">PPG</th>
            </tr>
          </thead>
          <tbody>
            {profile.partners.map((p) => (
              <tr key={p.name} className="border-t border-white/5">
                <td className="text-left py-1.5">
                  <Link href={`/stats/player/${encodeURIComponent(p.name)}`} className="hover:text-gold">
                    {p.name}
                  </Link>
                </td>
                <td className="text-right py-1.5 px-2 tabular-nums">{p.games}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{p.wins}-{p.losses}</td>
                <td className="text-right py-1.5 px-2 tabular-nums text-gold">{pct(p.winPct)}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{one(p.ppgFor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function FieldTab({ profile }: { profile: ReturnType<typeof computeProfile> }) {
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-4 overflow-x-auto">
      <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Head-to-head vs everyone</h2>
      <table className="w-full min-w-[420px] text-sm">
        <thead className="text-white/55 text-[10px] uppercase tracking-wider">
          <tr>
            <th className="text-left py-1">Opponent</th>
            <th className="text-right py-1 px-2">Meetings</th>
            <th className="text-right py-1 px-2">Your W-L</th>
            <th className="text-right py-1 px-2">Win%</th>
          </tr>
        </thead>
        <tbody>
          {profile.opponents.map((o) => (
            <tr key={o.name} className="border-t border-white/5">
              <td className="text-left py-1.5">
                <Link href={`/stats/player/${encodeURIComponent(o.name)}`} className="hover:text-gold">
                  {o.name}
                </Link>
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums">{o.games}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">
                <span className={o.wins >= o.losses ? 'text-emerald-300' : 'text-red-300'}>
                  {o.wins}-{o.losses}
                </span>
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums text-gold">{pct(o.winPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ActivitySection({ profile }: { profile: ReturnType<typeof computeProfile> }) {
  const days = profile.activity.slice(-30);
  const maxG = days.reduce((m, d) => Math.max(m, d.games), 1);
  return (
    <section className="bg-black/40 border border-white/10 rounded-2xl p-4">
      <h2 className="text-sm uppercase tracking-wider text-gold font-semibold mb-2">Activity</h2>
      {days.length === 0 ? (
        <p className="text-white/40 text-sm">No games yet.</p>
      ) : (
        <div className="flex items-end gap-1 h-20 overflow-x-auto">
          {days.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1 shrink-0" title={`${d.day}: ${d.wins}/${d.games} won`}>
              <div
                className="w-3 rounded-t bg-gold/70"
                style={{ height: `${Math.max(8, (d.games / maxG) * 56)}px` }}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-white/40 mt-1">Games per day, most recent {days.length} active days.</p>
    </section>
  );
}

function Callout({
  emoji,
  title,
  name,
  detail,
  good,
}: {
  emoji: string;
  title: string;
  name: string;
  detail: string;
  good?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${good ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-red-400/30 bg-red-500/5'}`}>
      <div className="text-[10px] uppercase tracking-wider text-white/50">
        {emoji} {title}
      </div>
      <div className="font-display text-xl text-white mt-0.5 truncate">{name}</div>
      <div className="text-xs text-white/60">{detail}</div>
    </div>
  );
}
