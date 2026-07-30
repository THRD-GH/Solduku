import { CELLS, popcount } from './grid.ts';
import {
  MAX_DIFFICULTY,
  buildConstraints,
  initialCandidates,
  propagate,
} from './techniques.ts';
import type { Candidates, Constraints, LogicTrace } from './techniques.ts';
import type { Cage } from './types.ts';

export { buildConstraints, initialCandidates, propagate, MAX_DIFFICULTY };
export type { Candidates, Constraints, LogicTrace };

export function candidatesToGrid(cand: Candidates): number[] {
  const out = new Array<number>(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const m = cand[i];
    out[i] = popcount(m) === 1 ? 32 - Math.clz32(m) : 0;
  }
  return out;
}

export interface SolveResult {
  /** Number of solutions found, capped at `maxSolutions`. */
  count: number;
  solution: number[] | null;
  /** Branch points taken once the technique stack ran dry. */
  guesses: number;
  /** True if `nodeLimit` cut the search short, so `count` is not trustworthy. */
  aborted: boolean;
}

export interface SolveOptions {
  maxSolutions?: number;
  /** Cap the technique stack — lower values model a less experienced solver. */
  maxDifficulty?: number;
  /** Bound the search so a pathological position cannot stall generation. */
  nodeLimit?: number;
  start?: Candidates;
  trace?: LogicTrace;
}

export function solve(input: Cage[] | Constraints, opts: SolveOptions = {}): SolveResult {
  const {
    maxSolutions = 2,
    maxDifficulty = MAX_DIFFICULTY,
    nodeLimit = Infinity,
    start,
    trace,
  } = opts;
  const cons = Array.isArray(input) ? buildConstraints(input) : input;
  const solutions: number[][] = [];
  let guesses = 0;
  let nodes = 0;
  let aborted = false;

  const search = (cand: Candidates): void => {
    if (solutions.length >= maxSolutions || aborted) return;
    if (++nodes > nodeLimit) {
      aborted = true;
      return;
    }
    if (!propagate(cand, cons, maxDifficulty, trace)) return;

    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < CELLS; i++) {
      const pc = popcount(cand[i]);
      if (pc > 1 && pc < bestCount) {
        bestCount = pc;
        best = i;
        if (pc === 2) break;
      }
    }
    if (best === -1) {
      solutions.push(candidatesToGrid(cand));
      return;
    }

    guesses++;
    let m = cand[best];
    while (m) {
      const b = m & -m;
      m ^= b;
      const next = Uint16Array.from(cand);
      next[best] = b;
      search(next);
      if (solutions.length >= maxSolutions || aborted) return;
    }
  };

  search(start ? Uint16Array.from(start) : initialCandidates());
  return { count: solutions.length, solution: solutions[0] ?? null, guesses, aborted };
}

/** True only if the puzzle provably has exactly one solution within the budget. */
export function isUnique(cons: Constraints, nodeLimit = 20000): boolean {
  const r = solve(cons, { maxSolutions: 2, nodeLimit });
  return !r.aborted && r.count === 1;
}

export interface Classification {
  /** True when the technique stack finishes the grid with no trial and error. */
  logical: boolean;
  /** Hardest technique the solve was forced onto, 1..MAX_DIFFICULTY. */
  hardest: number;
  /** Branch points needed once logic ran out; zero when `logical`. */
  guesses: number;
  /** How often each technique fired, for reporting. */
  used: Map<string, number>;
}

/**
 * Rates a puzzle by what it demands. A puzzle is only as hard as the hardest
 * step it forces, so the solve always reaches for the easiest technique that
 * still makes progress and records how far up the stack it had to go.
 */
export function classify(cons: Constraints, nodeLimit = 30000): Classification {
  const trace: LogicTrace = { hardest: 0, used: new Map() };
  const logicOnly = solve(cons, { maxSolutions: 1, nodeLimit, trace });

  if (logicOnly.guesses === 0 && !logicOnly.aborted) {
    return { logical: true, hardest: trace.hardest, guesses: 0, used: trace.used };
  }
  return {
    logical: false,
    hardest: trace.hardest,
    guesses: logicOnly.aborted ? Infinity : logicOnly.guesses,
    used: trace.used,
  };
}

/** Candidate masks after propagation only — used for Lazy Mode and hints. */
export function propagatedCandidates(
  input: Cage[] | Constraints,
  start?: Candidates,
): Candidates | null {
  const cons = Array.isArray(input) ? buildConstraints(input) : input;
  const cand = start ? Uint16Array.from(start) : initialCandidates();
  return propagate(cand, cons, MAX_DIFFICULTY) ? cand : null;
}
