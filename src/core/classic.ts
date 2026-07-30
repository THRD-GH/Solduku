/**
 * Classic-sudoku generation for Solduku: a solved grid, givens dug out under a
 * uniqueness proof, and the remaining cells dealt as a shuffled deck of cards.
 *
 * The technique stack (techniques.ts) is shared with the killer build. With no
 * cages, only the classic rungs can ever fire — naked/hidden singles (1),
 * locked candidates (3), naked/hidden subsets (4) and x-wing (7) — and those
 * rungs are exactly the difficulty ladder.
 */
import { ALL_DIGITS, CELLS, PEERS, bit } from './grid.ts';
import { mulberry32, shuffle } from './rng.ts';
import { solve } from './solver.ts';
import type { Candidates, Constraints, LogicTrace } from './solver.ts';
import { JOKER_SUIT } from './types.ts';
import type { Card, Level, Puzzle } from './types.ts';

export const LEVELS: Level[] = [1, 2, 3, 4, 5, 6];

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Gentle',
  2: 'Easy',
  3: 'Steady',
  4: 'Tricky',
  5: 'Tough',
  6: 'Brutal',
};

/** What each rung demands of the sudoku, shown on the menu and in Help. */
export const LEVEL_LOGIC: Record<Level, string> = {
  1: 'singles only',
  2: 'locked candidates',
  3: 'subsets & x-wing',
  4: 'one branch beyond logic',
  5: 'two branches beyond logic',
  6: 'deep trial and error',
};

export interface LevelConfig {
  /** Dig depths to grade at, most givens first. The technique bands are
   *  narrow, so each grid is sampled at several depths rather than one. */
  checkpoints: number[];
  /** Cards held at once. */
  hand: number;
  /** FreeCell-style stash slots. */
  free: number;
  /** Wild cards mixed into the deck. */
  jokers: number;
}

/**
 * The solitaire side eases off as the sudoku side tightens: fewer givens means
 * a longer deal, so the harder levels also hold fewer cards and stash slots —
 * both dials move toward "you must actually solve it to survive".
 */
export const LEVEL_CONFIG: Record<Level, LevelConfig> = {
  1: { checkpoints: [46], hand: 5, free: 3, jokers: 2 },
  2: { checkpoints: [40, 36, 33, 30, 28, 26], hand: 4, free: 3, jokers: 2 },
  3: { checkpoints: [34, 31, 28, 26, 24], hand: 4, free: 2, jokers: 1 },
  4: { checkpoints: [28, 26, 24, 23], hand: 4, free: 2, jokers: 1 },
  5: { checkpoints: [26, 24, 23], hand: 3, free: 2, jokers: 1 },
  6: { checkpoints: [24, 23], hand: 3, free: 1, jokers: 1 },
};

/** Classic sudoku has no cages; rows, columns and boxes carry everything. */
export const CLASSIC_CONS: Constraints = {
  cages: [],
  unitRemainder: [],
  regionRemainder: [],
  locked: [],
};

export function givensToCandidates(givens: number[]): Candidates {
  const cand = new Uint16Array(CELLS).fill(ALL_DIGITS);
  for (let i = 0; i < CELLS; i++) if (givens[i] !== 0) cand[i] = bit(givens[i]);
  return cand;
}

/** A solved grid, produced by shuffled backtracking. */
export function randomSolution(rnd: () => number): number[] {
  const grid = new Array<number>(CELLS).fill(0);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const fill = (i: number): boolean => {
    if (i === CELLS) return true;
    for (const d of shuffle([...digits], rnd)) {
      let ok = true;
      for (const p of PEERS[i]) {
        if (grid[p] === d) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      grid[i] = d;
      if (fill(i + 1)) return true;
      grid[i] = 0;
    }
    return false;
  };

  fill(0);
  return grid;
}

/** True only if the givens provably have exactly one solution within budget. */
export function isUniqueGivens(givens: number[], nodeLimit = 20000): boolean {
  const r = solve(CLASSIC_CONS, {
    start: givensToCandidates(givens),
    maxSolutions: 2,
    nodeLimit,
  });
  return !r.aborted && r.count === 1;
}

export interface ClassicClassification {
  /** True when the technique stack finishes the grid with no trial and error. */
  logical: boolean;
  /** Hardest technique the solve was forced onto (1, 3, 4 or 7 here). */
  hardest: number;
  /** Branch points needed once logic ran out; zero when `logical`. */
  guesses: number;
}

/** Rates the givens by what they demand — the solve always reaches for the
 *  easiest technique that still makes progress. */
export function classifyGivens(givens: number[], nodeLimit = 30000): ClassicClassification {
  const trace: LogicTrace = { hardest: 0, used: new Map() };
  const r = solve(CLASSIC_CONS, {
    start: givensToCandidates(givens),
    maxSolutions: 1,
    nodeLimit,
    trace,
  });
  if (r.guesses === 0 && !r.aborted) {
    return { logical: true, hardest: trace.hardest, guesses: 0 };
  }
  return { logical: false, hardest: trace.hardest, guesses: r.aborted ? Infinity : r.guesses };
}

/**
 * Collapses a classification onto the 0..5 rung ladder, so level N wants
 * score N-1. Only the classic techniques can fire without cages, which is why
 * the `hardest` values checked here are sparse.
 */
export function difficultyScore(c: ClassicClassification): number {
  // The bands are cut where classic sudoku actually has population: x-wing as
  // the hardest technique is a ~1% sliver, so it shares a rung with subsets,
  // and the non-logical end splits by branch depth instead — sampled at
  // minimal givens, grids need 1..3 branch points and rarely more.
  if (!c.logical) return c.guesses <= 1 ? 3 : c.guesses === 2 ? 4 : 5;
  if (c.hardest <= 1) return 0; // singles only
  if (c.hardest === 3) return 1; // locked candidates
  return 2; // naked/hidden subsets, x-wing
}

/**
 * Remove givens in random order, keeping a removal only when the puzzle still
 * has exactly one solution. May stop above `target` when nothing more can go.
 */
export function digGivens(solution: number[], target: number, rnd: () => number): number[] {
  const givens = [...solution];
  let remaining = CELLS;
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    rnd,
  );
  for (const cell of order) {
    if (remaining <= target) break;
    const keep = givens[cell];
    givens[cell] = 0;
    if (isUniqueGivens(givens)) remaining--;
    else givens[cell] = keep;
  }
  return givens;
}

/**
 * The same dig, snapshotted at each checkpoint on the way down. One removal
 * order serves the whole ladder, so a rung is always a superset of the rung
 * below it and the walk costs one dig plus one classify per checkpoint.
 */
export function digLadder(
  solution: number[],
  checkpoints: number[],
  rnd: () => number,
): number[][] {
  const givens = [...solution];
  let remaining = CELLS;
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    rnd,
  );
  let at = 0;
  const rungs: number[][] = [];
  for (const target of checkpoints) {
    while (remaining > target && at < order.length) {
      const cell = order[at++];
      if (givens[cell] === 0) continue;
      const keep = givens[cell];
      givens[cell] = 0;
      if (isUniqueGivens(givens)) remaining--;
      else givens[cell] = keep;
    }
    rungs.push([...givens]);
  }
  return rungs;
}

/**
 * The deck: one card per open cell, so the digit multiset always matches what
 * the grid needs. Suits are spread evenly, then jokers replace whole cards —
 * a joker's digit is gone from the deck and must be covered by playing the
 * joker wild.
 */
export function buildDeck(
  solution: number[],
  givens: number[],
  jokers: number,
  rnd: () => number,
): Card[] {
  const open: number[] = [];
  for (let i = 0; i < CELLS; i++) if (givens[i] === 0) open.push(i);

  const suits = shuffle(
    open.map((_, k) => k % 4),
    rnd,
  );
  const deck: Card[] = open.map((cell, k) => ({ digit: solution[cell], suit: suits[k] }));

  const slots = shuffle(
    deck.map((_, k) => k),
    rnd,
  ).slice(0, Math.min(jokers, deck.length));
  for (const k of slots) deck[k] = { digit: 0, suit: JOKER_SUIT };

  return shuffle(deck, rnd);
}

/** Deterministic seed for puzzle `number` of `level` — 3-10 is always 3-10. */
export function puzzleSeed(level: Level, number: number): number {
  let h = 0x811c9dc5 ^ (level * 0x9e3779b1);
  h = Math.imul(h ^ number, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fresh grids tried per deal before settling for the closest rating. */
const ATTEMPTS = 24;

/**
 * Build the puzzle numbered `number` in `level`. Same inputs, same puzzle —
 * givens, deck order, jokers and all — on any device, forever.
 */
export function generatePuzzle(level: Level, number: number): Puzzle {
  const cfg = LEVEL_CONFIG[level];
  const want = level - 1;
  const seed = puzzleSeed(level, number);
  const rnd = mulberry32(seed);

  let best: { solution: number[]; givens: number[]; rating: number } | null = null;
  let bestDistance = Infinity;

  for (let attempt = 0; attempt < ATTEMPTS && bestDistance > 0; attempt++) {
    const solution = randomSolution(rnd);
    // The technique bands are narrow, so grade the same grid at every
    // checkpoint depth and keep whichever rung lands closest to the ask.
    for (const givens of digLadder(solution, cfg.checkpoints, rnd)) {
      const rating = difficultyScore(classifyGivens(givens));
      const distance = Math.abs(rating - want);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { solution, givens, rating };
        if (distance === 0) break;
      }
    }
  }

  if (!best) throw new Error(`could not generate puzzle ${level}-${number}`);
  const deck = buildDeck(best.solution, best.givens, cfg.jokers, rnd);
  return {
    givens: best.givens,
    solution: best.solution,
    deck,
    difficulty: level,
    seed,
    rating: best.rating,
  };
}
