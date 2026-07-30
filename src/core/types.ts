/** Difficulty is a 1..6 star level, graded by the solving techniques the
 *  underlying sudoku demands — the same ladder idea as the killer app. */
export type Level = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Kept for the solver core, which understands groups of cells with a known
 * sum. Solduku itself builds none — a classic grid's constraints are its rows,
 * columns and boxes, so the cage list handed to the solver is always empty.
 */
export interface Cage {
  /** Cell indices 0..80, ascending. cells[0] is the label cell (top-left-most). */
  cells: number[];
  sum: number;
}

/** One card of the deal. Suits are 0..3 (♠ ♥ ♦ ♣); the joker is digit 0. */
export interface Card {
  digit: number;
  suit: number;
}

export const JOKER_SUIT = -1;
export const isJoker = (card: Card): boolean => card.digit === 0;

export const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];
/** Hearts and diamonds are the red suits, as on a real deck. */
export const isRedSuit = (suit: number): boolean => suit === 1 || suit === 2;

export interface Puzzle {
  /** 81 digits, 0 where the deck has to fill the cell. */
  givens: number[];
  /** 81 digits, 1..9 — the unique solution of the givens. */
  solution: number[];
  /** Cards for the open cells, already shuffled — drawn front to back. */
  deck: Card[];
  /** Level this puzzle was generated for. */
  difficulty: Level;
  seed: number;
  /** Achieved rung 0..5 (see difficultyScore) — may differ from the ask. */
  rating: number;
}

/** Stable puzzle identifier, displayed as "3-10". Deals are deterministic:
 *  the same level and number always give the same givens and deck order. */
export interface PuzzleId {
  level: Level;
  number: number;
}

export const formatPuzzleId = (id: PuzzleId): string => `${id.level}-${id.number}`;
