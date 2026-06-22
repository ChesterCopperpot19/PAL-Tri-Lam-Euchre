'use client';
import { Fragment, useMemo, useState } from 'react';
import type { MatchRecord } from '@/lib/shared-types';
import { flattenHands, handsToCSV, cardText, suitSymbol, type HandRow } from '@/lib/stats-hands';

function shortDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Render a card/suit string, red for ♥/♦. */
function Suited({ text }: { text: string }) {
  if (!text) return <span className="text-white/30">—</span>;
  const red = text.includes('♥') || text.includes('♦');
  return <span className={red ? 'text-red-400' : 'text-white/90'}>{text}</span>;
}

function ResultBadge({ result }: { result: string }) {
  const cls =
    result === 'Euchred'
      ? 'text-red-300'
      : result.includes('march')
        ? 'text-emerald-300'
        : result === 'Loner made'
          ? 'text-cyan-300'
          : 'text-white/80';
  return <span className={cls}>{result}</span>;
}

function HandDetail({ row }: { row: HandRow }) {
  return (
    <div className="space-y-2 text-xs">
      <div>
        <span className="text-white/45 uppercase tracking-wider text-[10px]">Game</span>{' '}
        <span className="text-white/80">
          {row.nsNames.join(' & ')} vs {row.ewNames.join(' & ')} · final {row.finalScore.NS}–
          {row.finalScore.EW}
        </span>
      </div>
      <div>
        <span className="text-white/45 uppercase tracking-wider text-[10px]">Bidding</span>{' '}
        {row.bids.length === 0 ? (
          <span className="text-white/40">—</span>
        ) : (
          row.bids.map((b, i) => (
            <span key={i} className="text-white/80">
              {i > 0 && <span className="text-white/30">, </span>}
              {row.seatNames[b.seat] || `Seat ${b.seat}`}{' '}
              {b.action === 'pass' ? (
                <span className="text-white/50">pass</span>
              ) : (
                <>
                  {b.action} <Suited text={suitSymbol(b.suit)} />
                  {b.alone ? ' alone' : ''}
                </>
              )}
            </span>
          ))
        )}
      </div>
      <div className="space-y-0.5">
        <span className="text-white/45 uppercase tracking-wider text-[10px]">Tricks</span>
        {row.tricks.length === 0 ? (
          <div className="text-white/40">—</div>
        ) : (
          row.tricks.map((t, i) => (
            <div key={i} className="text-white/80">
              <span className="text-white/40">T{i + 1}</span>{' '}
              <span className="text-white/40">led <Suited text={suitSymbol(t.ledSuit)} /></span>
              {' — '}
              {t.plays.map((p, j) => (
                <span key={j} className={t.winner === p.seat ? 'text-gold font-medium' : ''}>
                  {j > 0 && <span className="text-white/30">, </span>}
                  {row.seatNames[p.seat] || `Seat ${p.seat}`} <Suited text={cardText(p.card)} />
                  {t.winner === p.seat ? ' ✓' : ''}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** The full hand-level data set: one row per hand, expandable to bids & tricks. */
export default function HandLevelData({ matches }: { matches: MatchRecord[] }) {
  const rows = useMemo(() => flattenHands(matches), [matches]);
  const gameCount = useMemo(() => new Set(rows.map((r) => r.gameId)).size, [rows]);
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="text-white/45 text-sm">
        No hand-level data yet — hands are recorded for games played from now on. Older games predate
        hand-level tracking.
      </p>
    );
  }

  function download() {
    const blob = new Blob([handsToCSV(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pal-trilam-euchre-hands.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-white/45">
          {rows.length} hands across {gameCount} game{gameCount === 1 ? '' : 's'} · tap a row for bids
          &amp; tricks
        </p>
        <button
          onClick={download}
          className="text-sm bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg px-3 py-1.5"
        >
          ⬇️ Hand CSV
        </button>
      </div>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[880px]">
          <thead className="text-white/60 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left py-1 px-1.5">Date</th>
              <th className="text-right py-1 px-1.5">Hand</th>
              <th className="text-left py-1 px-1.5">Dealer</th>
              <th className="text-left py-1 px-1.5">Maker</th>
              <th className="text-center py-1 px-1.5">Trump</th>
              <th className="text-center py-1 px-1.5">Up</th>
              <th className="text-center py-1 px-1.5" title="Round trump was decided">Bid</th>
              <th className="text-center py-1 px-1.5">Alone</th>
              <th className="text-left py-1 px-1.5">Result</th>
              <th className="text-right py-1 px-1.5">Pts</th>
              <th className="text-right py-1 px-1.5" title="Maker tricks – defender tricks">Trk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.gameId}-${r.handNo}`;
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <tr
                    className="border-t border-white/5 cursor-pointer hover:bg-white/5"
                    onClick={() => setOpen(isOpen ? null : key)}
                  >
                    <td className="py-1.5 px-1.5 text-white/70 whitespace-nowrap">{shortDate(r.ts)}</td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums text-white/60">{r.handNo}</td>
                    <td className="py-1.5 px-1.5 whitespace-nowrap">{r.dealer || '—'}</td>
                    <td className="py-1.5 px-1.5 font-medium whitespace-nowrap">{r.maker}</td>
                    <td className="py-1.5 px-1.5 text-center"><Suited text={suitSymbol(r.trump)} /></td>
                    <td className="py-1.5 px-1.5 text-center"><Suited text={r.upcard} /></td>
                    <td
                      className="py-1.5 px-1.5 text-center text-white/70"
                      title={r.bidRound === 1 ? 'Ordered up (round 1)' : r.bidRound === 2 ? 'Named suit (round 2)' : ''}
                    >
                      {r.bidRound ? `R${r.bidRound}` : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 text-center">{r.alone ? '🔥' : ''}</td>
                    <td className="py-1.5 px-1.5 whitespace-nowrap"><ResultBadge result={r.result} /></td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums whitespace-nowrap">
                      {r.points ? `${r.pointsTeam} +${r.points}` : '—'}
                    </td>
                    <td className="py-1.5 px-1.5 text-right tabular-nums">
                      {r.makerTricks}-{r.defenderTricks}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-black/30">
                      <td colSpan={11} className="px-3 py-2">
                        <HandDetail row={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
