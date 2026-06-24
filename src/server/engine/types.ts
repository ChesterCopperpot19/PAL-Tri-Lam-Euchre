// Core types shared across engine + server. Client gets a redacted view via redact.ts.

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export type Card = {
  suit: Suit;
  rank: Rank;
  /** Stable id for diffing & socket transport, e.g. "JH", "10S". */
  id: string;
};

export type SeatIndex = 0 | 1 | 2 | 3;
export type Team = 'NS' | 'EW';

/** Seat layout (clockwise from south = you):
 *   0 = South, 1 = West, 2 = North, 3 = East
 *  Partnerships: 0+2 (NS), 1+3 (EW)
 */
export const PARTNER: Record<SeatIndex, SeatIndex> = { 0: 2, 1: 3, 2: 0, 3: 1 };
export const TEAM_OF: Record<SeatIndex, Team> = { 0: 'NS', 2: 'NS', 1: 'EW', 3: 'EW' };

export type Phase =
  | 'LOBBY'
  | 'DEALING'
  | 'BIDDING_1'
  | 'DEALER_DISCARD'
  | 'BIDDING_2'
  | 'PLAYING'
  | 'HAND_END'
  | 'GAME_OVER';

export type TrickPlay = { seat: SeatIndex; card: Card };

export type Trick = {
  ledSuit: Suit | null; // effective suit (left bower → trump)
  plays: TrickPlay[];
  winner?: SeatIndex;
};

/** One bidding action within a hand (for hand-level analytics). */
export type BidEntry = {
  seat: SeatIndex;
  action: 'order' | 'pass' | 'call';
  round: 1 | 2;
  /** Suit ordered/named (omitted for a pass). */
  suit?: Suit;
  alone?: boolean;
};

export type HandSummary = {
  trump: Suit;
  maker: SeatIndex;
  alone: boolean;
  tricksByTeam: { NS: number; EW: number };
  /** Tricks won per seat in this hand (NS+EW always sums to 5). */
  tricksBySeat: Record<SeatIndex, number>;
  pointsAwarded: { NS: number; EW: number };
  euchred: boolean;
  march: boolean;
  // ── Richer hand-level capture (optional; populated by scoreHand, stripped
  //    from the redacted client state to keep live snapshots small). ──
  /** Dealer's seat this hand. */
  dealer?: SeatIndex;
  /** The up-card turned for round-1 bidding. */
  upcard?: Card | null;
  /** True if the up-card was ordered up (round 1) — i.e. the dealer picked it up. */
  orderedUp?: boolean;
  /** Round trump was decided in: 1 = ordered up, 2 = named suit. */
  bidRound?: 1 | 2;
  /** The full bidding sequence for this hand. */
  bids?: BidEntry[];
  /** Every completed trick (led suit, plays, winner) for trick-level analytics. */
  tricks?: Trick[];
};

export type GameState = {
  phase: Phase;
  /** Hands by seat. Always all 4 entries; sittingOut player still has a (now empty) hand. */
  hands: Record<SeatIndex, Card[]>;
  /** Cards in the kitty (not in any hand or upcard). */
  kitty: Card[];
  /** Card turned up at start of the hand for round-1 bidding. */
  upcard: Card | null;
  /** When dealer takes up the upcard, it moves into their hand and `upcardTaken` records that. */
  upcardTaken: boolean;
  /** Trump suit, set after a successful bid. */
  trump: Suit | null;
  /** The seat that called trump (a.k.a. the maker). */
  maker: SeatIndex | null;
  /** Whether the maker is going alone this hand. */
  alone: boolean;
  /** Seats sitting out this hand (only the alone-maker's partner, if any). */
  sittingOut: SeatIndex[];
  /** Dealer for the current hand. */
  dealer: SeatIndex;
  /** Whose turn it is (bid or play). */
  turn: SeatIndex;
  /** Round-1 / round-2 turn cursor — tracks how many seats have acted in current bidding round. */
  bidActions: number;
  /** Tricks completed this hand. */
  completedTricks: Trick[];
  /** Trick currently in progress. */
  currentTrick: Trick;
  /** Cumulative scores. */
  scores: { NS: number; EW: number };
  /** Trick counts within the current hand. */
  trickCounts: { NS: number; EW: number };
  /** Last-hand summary for the modal. Cleared on next deal. */
  lastHand: HandSummary | null;
  /** Per-hand history accumulated across the game (for end-of-game stats). */
  history: HandSummary[];
  /** Bidding actions for the CURRENT hand (reset each deal; for hand-level stats). */
  bidLog: BidEntry[];
  /** Random seed used for shuffling — kept for tests/replay. */
  seed: number;
};

export type Action =
  | { type: 'START_HAND' }
  | { type: 'BID_ORDER'; seat: SeatIndex; alone: boolean }
  | { type: 'BID_PASS'; seat: SeatIndex }
  | { type: 'BID_CALL'; seat: SeatIndex; suit: Suit; alone: boolean }
  | { type: 'FARMERS_REDEAL'; seat: SeatIndex }
  | { type: 'DEALER_DISCARD'; seat: SeatIndex; cardId: string }
  | { type: 'PLAY_CARD'; seat: SeatIndex; cardId: string };

export type ApplyResult = { state: GameState; events: string[] };

export const ALL_SUITS: Suit[] = ['H', 'D', 'C', 'S'];
export const ALL_RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

export const POINTS_TO_WIN = 10;
