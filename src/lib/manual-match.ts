// Validate + build a MatchRecord from a manually-logged (in-person) game.
// Kept pure (no I/O) so it's shared by the socket handler and unit-tested in
// isolation. team1 → seats 0 & 2 (NS), team2 → seats 1 & 3 (EW), so the two
// players on a team are partners and the analytics treat them correctly.

import type {
  ManualMatchInput,
  ManualPlayerInput,
  MatchRecord,
  PlayerMatchStat,
} from './shared-types';

const MAX_NAME = 24;

const clampInt = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));

/** Strip control chars (keeping spaces/punctuation), trim, cap length. */
export function cleanName(s: string): string {
  const str = s ?? '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code !== 127) out += str[i];
  }
  return out.trim().slice(0, MAX_NAME);
}

/** Returns an error message if the entry is invalid, or null if it's good to save. */
export function validateManualInput(input: ManualMatchInput): string | null {
  if (!input || typeof input !== 'object') return 'Missing data.';
  const { team1, team2 } = input;
  if (
    !Array.isArray(team1) ||
    !Array.isArray(team2) ||
    team1.length !== 2 ||
    team2.length !== 2
  ) {
    return 'Each team needs exactly two players.';
  }
  const names = [...team1, ...team2].map((p) => cleanName(p?.name ?? ''));
  if (names.some((n) => n.length === 0)) return 'All four player names are required.';
  if (new Set(names.map((n) => n.toLowerCase())).size !== 4) {
    return 'All four names must be different.';
  }
  if (input.winner !== 'team1' && input.winner !== 'team2') return 'Pick which team won.';
  if (input.finalScore) {
    const a = Number(input.finalScore.team1);
    const b = Number(input.finalScore.team2);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
      return 'Scores must be 0 or more.';
    }
  }
  return null;
}

/** Build a MatchRecord from a *validated* manual entry. Caller supplies id + ts. */
export function buildManualMatch(input: ManualMatchInput, id: string, ts: number): MatchRecord {
  const stat = (p: ManualPlayerInput, seat: 0 | 1 | 2 | 3, team: 'NS' | 'EW'): PlayerMatchStat => ({
    name: cleanName(p.name),
    seat,
    team,
    isBot: false,
    tricks: clampInt(p.tricks),
    defensiveTricks: clampInt(p.defensiveTricks),
    defensiveEuchres: clampInt(p.defensiveEuchres),
    handsCalled: clampInt(p.handsCalled),
    callsWon: clampInt(p.callsWon),
    euchres: clampInt(p.euchres),
    marches: clampInt(p.marches),
    loneCalled: clampInt(p.loneCalled),
    loneWon: clampInt(p.loneWon),
  });

  const players: PlayerMatchStat[] = [
    stat(input.team1[0], 0, 'NS'),
    stat(input.team2[0], 1, 'EW'),
    stat(input.team1[1], 2, 'NS'),
    stat(input.team2[1], 3, 'EW'),
  ];

  const winnerTeam: 'NS' | 'EW' = input.winner === 'team1' ? 'NS' : 'EW';
  const finalScore = input.finalScore
    ? { NS: clampInt(input.finalScore.team1), EW: clampInt(input.finalScore.team2) }
    : winnerTeam === 'NS'
      ? { NS: 10, EW: 0 }
      : { NS: 0, EW: 10 };

  return {
    id,
    ts,
    winnerTeam,
    finalScore,
    handsPlayed: clampInt(input.handsPlayed),
    players,
    source: 'manual',
  };
}
