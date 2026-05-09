import { legalPlayIds } from './game';
import { Card, GameState, SeatIndex } from './types';

export type PublicSeatInfo = {
  /** Public hand size for non-self players, full hand for self (or null if not viewer). */
  handCount: number;
  hand?: Card[]; // present only for self-view
};

export type RedactedState = Omit<GameState, 'hands' | 'kitty' | 'seed'> & {
  seats: Record<SeatIndex, PublicSeatInfo>;
  /** For player viewers: their legal-play card ids. For spectators: []. */
  legalPlayIds: string[];
  /** Whether viewer is a spectator (no hand). */
  spectator: boolean;
  /** Viewer's seat index (0..3) or null for spectator. */
  viewerSeat: SeatIndex | null;
};

/**
 * Build the per-recipient view of game state.
 * - viewerSeat=null → spectator: all hands hidden.
 * - viewerSeat=N    → player N: their own hand visible, others hidden.
 *
 * The kitty (containing buried cards + the discarded card after dealer-discard) and
 * the random seed are NEVER sent to clients.
 */
export function redactState(state: GameState, viewerSeat: SeatIndex | null): RedactedState {
  const seats: Record<SeatIndex, PublicSeatInfo> = {
    0: { handCount: state.hands[0].length },
    1: { handCount: state.hands[1].length },
    2: { handCount: state.hands[2].length },
    3: { handCount: state.hands[3].length },
  };
  if (viewerSeat !== null) {
    seats[viewerSeat] = {
      handCount: state.hands[viewerSeat].length,
      hand: state.hands[viewerSeat].slice(),
    };
  }
  const { hands: _hands, kitty: _kitty, seed: _seed, ...rest } = state;
  return {
    ...rest,
    seats,
    legalPlayIds: viewerSeat === null ? [] : legalPlayIds(state, viewerSeat),
    spectator: viewerSeat === null,
    viewerSeat,
  };
}
