import { ALL_DIGITS, CELLS, PEERS, UNITS, bit, boxOf, colOf, popcount, rowOf } from './grid.ts';
import { combosFor } from './combos.ts';
import type { Cage } from './types.ts';

export type Candidates = Uint16Array;

export function initialCandidates(): Candidates {
  return new Uint16Array(CELLS).fill(ALL_DIGITS);
}

/** A group of cells with a known total. `distinct` groups also forbid repeats. */
interface SumGroup {
  cells: number[];
  sum: number;
  distinct: boolean;
}

export interface Constraints {
  cages: Cage[];
  /** Innies/outies of a single unit: known sum, and all distinct. */
  unitRemainder: Cage[];
  /** Innies/outies across two or three units: known sum, repeats allowed. */
  regionRemainder: SumGroup[];
  /** Cages inside one unit, paired with the rest of that unit. */
  locked: { cage: Cage; outside: number[] }[];
}

const MAX_DISTINCT_REMAINDER = 6;

/** Rows/columns grouped into the bands and stacks used by innies and outies. */
function regions(): number[][][] {
  const rows = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c));
  const cols = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c));
  const out: number[][][] = [];
  for (const lines of [rows, cols]) {
    for (let i = 0; i < 9; i++) {
      if (i + 1 < 9) out.push([lines[i], lines[i + 1]]);
      if (i % 3 === 0) out.push([lines[i], lines[i + 1], lines[i + 2]]);
    }
  }
  return out;
}

const REGIONS = regions();

export function buildConstraints(cages: Cage[]): Constraints {
  const owner = new Int16Array(CELLS).fill(-1);
  cages.forEach((cage, i) => cage.cells.forEach((cell) => (owner[cell] = i)));

  const unitRemainder: Cage[] = [];
  const locked: { cage: Cage; outside: number[] }[] = [];

  for (const unit of UNITS) {
    const inUnit = new Set(unit);
    const ids = new Set<number>();
    for (const cell of unit) ids.add(owner[cell]);

    let insideSum = 0;
    const leftover: number[] = [];
    const contained: Cage[] = [];
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => inUnit.has(c))) {
        insideSum += cage.sum;
        if (cage.cells.length >= 2 && cage.cells.length <= 4) contained.push(cage);
      } else {
        for (const c of cage.cells) if (inUnit.has(c)) leftover.push(c);
      }
    }

    for (const cage of contained) {
      const own = new Set(cage.cells);
      locked.push({ cage, outside: unit.filter((c) => !own.has(c)) });
    }
    if (leftover.length >= 1 && leftover.length <= MAX_DISTINCT_REMAINDER) {
      unitRemainder.push({ cells: leftover.sort((a, b) => a - b), sum: 45 - insideSum });
    }
  }

  // The same subtraction over bands and stacks. Cells left over here span more
  // than one unit, so they may repeat a digit — only the total is known.
  const regionRemainder: SumGroup[] = [];
  for (const region of REGIONS) {
    const cells = new Set(region.flat());
    const ids = new Set<number>();
    for (const c of cells) ids.add(owner[c]);

    let insideSum = 0;
    const leftover: number[] = [];
    for (const id of ids) {
      const cage = cages[id];
      if (cage.cells.every((c) => cells.has(c))) insideSum += cage.sum;
      else for (const c of cage.cells) if (cells.has(c)) leftover.push(c);
    }
    const sum = 45 * region.length - insideSum;
    if (leftover.length >= 1 && leftover.length <= 10) {
      regionRemainder.push({ cells: leftover, sum, distinct: false });
    }
  }

  return { cages, unitRemainder, regionRemainder, locked };
}

// ---------------------------------------------------------------- primitives

const eliminate = (cand: Candidates, cell: number, mask: number): number => {
  const next = cand[cell] & ~mask;
  if (next === cand[cell]) return 0;
  if (next === 0) return -1;
  cand[cell] = next;
  return 1;
};

const restrict = (cand: Candidates, cell: number, mask: number): number => {
  const next = cand[cell] & mask;
  if (next === cand[cell]) return 0;
  if (next === 0) return -1;
  cand[cell] = next;
  return 1;
};

/** Result of one technique pass: -1 contradiction, 0 nothing, 1 progress. */
type Outcome = -1 | 0 | 1;

function nakedSingles(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (let i = 0; i < CELLS; i++) {
    const m = cand[i];
    if (m === 0) return -1;
    if (popcount(m) !== 1) continue;
    for (const p of PEERS[i]) {
      const r = eliminate(cand, p, m);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

function hiddenSingles(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      let count = 0;
      let where = -1;
      for (const c of unit) {
        if (cand[c] & b) {
          count++;
          where = c;
        }
      }
      if (count === 0) return -1;
      if (count === 1 && cand[where] !== b) {
        cand[where] = b;
        changed = 1;
      }
    }
  }
  return changed;
}

/**
 * No digit twice in a cage. Trivial reasoning, but it is the only thing
 * enforcing distinctness in cages too big to enumerate (8 and 9 cells), where
 * the combination rules have nothing to say — a nine-cell cage sums to 45 and
 * holds every digit, so its only real content is that its cells all differ.
 */
function cageDistinct(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    for (const cell of cage.cells) {
      const m = cand[cell];
      if (m === 0) return -1;
      if (popcount(m) !== 1) continue;
      for (const other of cage.cells) {
        if (other === cell) continue;
        const r = eliminate(cand, other, m);
        if (r === -1) return -1;
        if (r === 1) changed = 1;
      }
    }
  }
  return changed;
}

/** Digits that survive in a cage when only the sum, not placement, is checked. */
function cageCombinations(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    const cells = cage.cells;
    const n = cells.length;
    let union = 0;
    let any = false;

    for (const combo of combosFor(n, cage.sum)) {
      let live = true;
      for (let i = 0; i < n && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
      let rest = combo;
      while (rest && live) {
        const b = rest & -rest;
        rest ^= b;
        let placeable = false;
        for (let i = 0; i < n && !placeable; i++) if (cand[cells[i]] & b) placeable = true;
        if (!placeable) live = false;
      }
      if (!live) continue;
      any = true;
      union |= combo;
    }

    if (!any) return -1;
    for (const c of cells) {
      const r = restrict(cand, c, union);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/**
 * Full arc consistency on a cage: a digit stays only if some complete
 * assignment of the whole cage — distinct digits, right total — uses it there.
 */
function cageArcConsistency(cand: Candidates, cages: Cage[]): Outcome {
  let changed: Outcome = 0;
  for (const cage of cages) {
    const r = cageSupport(cand, cage);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

function cageSupport(cand: Candidates, cage: Cage): Outcome {
  const cells = cage.cells;
  const n = cells.length;
  if (n > 7) return 0; // enumeration stops paying off past this
  const allowed = new Array<number>(n).fill(0);
  const path = new Int8Array(n);
  let feasible = false;

  const assign = (i: number, used: number, combo: number): boolean => {
    if (i === n) {
      for (let k = 0; k < n; k++) allowed[k] |= bit(path[k]);
      return true;
    }
    let m = cand[cells[i]] & combo & ~used;
    let found = false;
    while (m) {
      const b = m & -m;
      m ^= b;
      path[i] = 32 - Math.clz32(b);
      if (assign(i + 1, used | b, combo)) found = true;
    }
    return found;
  };

  for (const combo of combosFor(n, cage.sum)) {
    let live = true;
    for (let i = 0; i < n && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
    if (!live) continue;

    let covered = true;
    for (let i = 0; i < n; i++) {
      const want = cand[cells[i]] & combo;
      if ((allowed[i] & want) !== want) {
        covered = false;
        break;
      }
    }
    if (covered) {
      feasible = true;
      continue;
    }
    if (assign(0, 0, combo)) feasible = true;
  }

  if (!feasible) return -1;
  let changed: Outcome = 0;
  for (let i = 0; i < n; i++) {
    const r = restrict(cand, cells[i], allowed[i]);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

/**
 * Locked candidates. Pointing: a digit confined to one box within a line
 * leaves the rest of the box. Claiming: confined to one line within a box, it
 * leaves the rest of the line.
 */
function lockedCandidates(cand: Candidates): Outcome {
  let changed: Outcome = 0;

  for (let u = 0; u < UNITS.length; u++) {
    const unit = UNITS[u];
    const isBox = u >= 18;
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const spots = unit.filter((c) => cand[c] & b);
      if (spots.length < 2 || spots.length > 3) continue;
      const inside = new Set(spots);

      const sweep = (cells: number[]): boolean => {
        for (const c of cells) {
          if (inside.has(c)) continue;
          const r = eliminate(cand, c, b);
          if (r === -1) return false;
          if (r === 1) changed = 1;
        }
        return true;
      };

      if (isBox) {
        // Pointing: confined to one line inside this box, so it leaves the line.
        if (spots.every((c) => rowOf(c) === rowOf(spots[0]))) {
          if (!sweep(UNITS[rowOf(spots[0])])) return -1;
        }
        if (spots.every((c) => colOf(c) === colOf(spots[0]))) {
          if (!sweep(UNITS[9 + colOf(spots[0])])) return -1;
        }
      } else if (spots.every((c) => boxOf(c) === boxOf(spots[0]))) {
        // Claiming: confined to one box inside this line, so it leaves the box.
        if (!sweep(UNITS[18 + boxOf(spots[0])])) return -1;
      }
    }
  }
  return changed;
}

/** Naked pairs and triples: n cells in a unit sharing exactly n candidates. */
function nakedSubsets(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    const open = unit.filter((c) => popcount(cand[c]) > 1);
    for (let size = 2; size <= 3; size++) {
      const pool = open.filter((c) => popcount(cand[c]) <= size);
      const n = pool.length;
      if (n <= size) continue;

      const walk = (start: number, picked: number[], mask: number): boolean => {
        if (picked.length === size) {
          if (popcount(mask) !== size) return true;
          const inside = new Set(picked);
          for (const c of unit) {
            if (inside.has(c)) continue;
            const r = eliminate(cand, c, mask);
            if (r === -1) return false;
            if (r === 1) changed = 1;
          }
          return true;
        }
        for (let i = start; i < n; i++) {
          const next = mask | cand[pool[i]];
          if (popcount(next) > size) continue;
          if (!walk(i + 1, [...picked, pool[i]], next)) return false;
        }
        return true;
      };
      if (!walk(0, [], 0)) return -1;
    }
  }
  return changed;
}

/** Hidden pairs and triples: n digits in a unit confined to exactly n cells. */
function hiddenSubsets(cand: Candidates): Outcome {
  let changed: Outcome = 0;
  for (const unit of UNITS) {
    const spots = new Map<number, number[]>();
    for (let d = 1; d <= 9; d++) {
      const cells = unit.filter((c) => cand[c] & bit(d));
      if (cells.length >= 2 && cells.length <= 3) spots.set(d, cells);
    }
    const digits = [...spots.keys()];

    for (let size = 2; size <= 3; size++) {
      const walk = (start: number, picked: number[], cells: Set<number>): boolean => {
        if (picked.length === size) {
          if (cells.size !== size) return true;
          const mask = picked.reduce((m, d) => m | bit(d), 0);
          for (const c of cells) {
            const r = restrict(cand, c, mask);
            if (r === -1) return false;
            if (r === 1) changed = 1;
          }
          return true;
        }
        for (let i = start; i < digits.length; i++) {
          const merged = new Set([...cells, ...spots.get(digits[i])!]);
          if (merged.size > size) continue;
          if (!walk(i + 1, [...picked, digits[i]], merged)) return false;
        }
        return true;
      };
      if (!walk(0, [], new Set())) return -1;
    }
  }
  return changed;
}

/** Digits every surviving combination of an enclosed cage must contain. */
function cageLocking(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const { cage, outside } of cons.locked) {
    const cells = cage.cells;
    let common = ALL_DIGITS;
    let any = false;
    for (const combo of combosFor(cells.length, cage.sum)) {
      let live = true;
      for (let i = 0; i < cells.length && live; i++) if ((cand[cells[i]] & combo) === 0) live = false;
      if (!live) continue;
      any = true;
      common &= combo;
      if (common === 0) break;
    }
    if (!any) return -1;
    if (common === 0) continue;
    for (const c of outside) {
      const r = eliminate(cand, c, common);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/** Innies and outies of a single unit — a known sum over distinct digits. */
function unitRemainders(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const group of cons.unitRemainder) {
    const r = cageSupport(cand, group);
    if (r === -1) return -1;
    if (r === 1) changed = 1;
  }
  return changed;
}

/**
 * Innies and outies across a band or stack. Those cells span several units so
 * digits may repeat — only the total is known, which still bounds each cell.
 */
function regionRemainders(cand: Candidates, cons: Constraints): Outcome {
  let changed: Outcome = 0;
  for (const { cells, sum } of cons.regionRemainder) {
    const lo: number[] = [];
    const hi: number[] = [];
    for (const c of cells) {
      const m = cand[c];
      if (m === 0) return -1;
      lo.push(32 - Math.clz32(m & -m));
      hi.push(32 - Math.clz32(m));
    }
    const totalLo = lo.reduce((a, b) => a + b, 0);
    const totalHi = hi.reduce((a, b) => a + b, 0);
    if (sum < totalLo || sum > totalHi) return -1;

    for (let i = 0; i < cells.length; i++) {
      const othersLo = totalLo - lo[i];
      const othersHi = totalHi - hi[i];
      let mask = 0;
      for (let d = 1; d <= 9; d++) {
        if (!(cand[cells[i]] & bit(d))) continue;
        if (sum - d >= othersLo && sum - d <= othersHi) mask |= bit(d);
      }
      const r = restrict(cand, cells[i], mask);
      if (r === -1) return -1;
      if (r === 1) changed = 1;
    }
  }
  return changed;
}

/** X-Wing: a digit locked to the same two lines in two crossing lines. */
function xWing(cand: Candidates): Outcome {
  let changed: Outcome = 0;

  const scan = (byRow: boolean): boolean => {
    for (let d = 1; d <= 9; d++) {
      const b = bit(d);
      const lines: number[][] = [];
      for (let i = 0; i < 9; i++) {
        const cells: number[] = [];
        for (let j = 0; j < 9; j++) {
          const cell = byRow ? i * 9 + j : j * 9 + i;
          if (cand[cell] & b) cells.push(j);
        }
        lines.push(cells);
      }
      for (let a = 0; a < 9; a++) {
        if (lines[a].length !== 2) continue;
        for (let c = a + 1; c < 9; c++) {
          if (lines[c].length !== 2) continue;
          if (lines[a][0] !== lines[c][0] || lines[a][1] !== lines[c][1]) continue;
          for (const j of lines[a]) {
            for (let i = 0; i < 9; i++) {
              if (i === a || i === c) continue;
              const cell = byRow ? i * 9 + j : j * 9 + i;
              const r = eliminate(cand, cell, b);
              if (r === -1) return false;
              if (r === 1) changed = 1;
            }
          }
        }
      }
    }
    return true;
  };

  if (!scan(true) || !scan(false)) return -1;
  return changed;
}

// ----------------------------------------------------------------- the stack

export interface Technique {
  name: string;
  /** Roughly how hard a person finds it, 1 easiest. */
  difficulty: number;
  run(cand: Candidates, cons: Constraints): Outcome;
}

/**
 * Ordered easiest first. The solver always applies the cheapest technique that
 * fires, so a puzzle's rating is the hardest rung it was ever forced onto.
 */
export const TECHNIQUES: Technique[] = [
  { name: 'naked single', difficulty: 1, run: (c) => nakedSingles(c) },
  { name: 'cage distinct', difficulty: 1, run: (c, k) => cageDistinct(c, k.cages) },
  { name: 'hidden single', difficulty: 1, run: (c) => hiddenSingles(c) },
  { name: 'cage combinations', difficulty: 2, run: (c, k) => cageCombinations(c, k.cages) },
  { name: 'locked candidates', difficulty: 3, run: (c) => lockedCandidates(c) },
  { name: 'cage arc consistency', difficulty: 3, run: (c, k) => cageArcConsistency(c, k.cages) },
  { name: 'naked subset', difficulty: 4, run: (c) => nakedSubsets(c) },
  { name: 'hidden subset', difficulty: 4, run: (c) => hiddenSubsets(c) },
  { name: 'cage locking', difficulty: 5, run: (c, k) => cageLocking(c, k) },
  { name: 'innies/outies (unit)', difficulty: 5, run: (c, k) => unitRemainders(c, k) },
  { name: 'innies/outies (band)', difficulty: 6, run: (c, k) => regionRemainders(c, k) },
  { name: 'x-wing', difficulty: 7, run: (c) => xWing(c) },
];

export const MAX_DIFFICULTY = Math.max(...TECHNIQUES.map((t) => t.difficulty));

export interface Step {
  /** Which technique moved things on. */
  technique: string;
  difficulty: number;
  /** Cells it changed, for pointing at them on the board. */
  cells: number[];
  /** A cell it answered outright, if any. */
  solved: { cell: number; digit: number } | null;
}

/**
 * Striking a placed digit out of its own row, column, box and cage is not a
 * hint — it is bookkeeping any player does without thinking. Settled before
 * looking for the next real step, or every hint would be "we removed some
 * candidates", pointing at half the grid.
 */
const BOOKKEEPING = new Set(['naked single', 'cage distinct']);

/**
 * The next thing a solver would do from this position, using the easiest
 * technique that still achieves something. Returns null when the grid is
 * finished, contradictory, or beyond the technique stack.
 */
export function nextStep(cand: Candidates, cons: Constraints): Step | null {
  for (;;) {
    let moved = false;
    for (const technique of TECHNIQUES) {
      if (!BOOKKEEPING.has(technique.name)) continue;
      const outcome = technique.run(cand, cons);
      if (outcome === -1) return null;
      if (outcome === 1) moved = true;
    }
    if (!moved) break;
  }

  for (const technique of TECHNIQUES) {
    if (BOOKKEEPING.has(technique.name)) continue;
    const before = Uint16Array.from(cand);
    const outcome = technique.run(cand, cons);
    if (outcome === -1) return null;
    if (outcome === 0) continue;

    const cells: number[] = [];
    let solved: Step['solved'] = null;
    for (let i = 0; i < CELLS; i++) {
      if (cand[i] === before[i]) continue;
      cells.push(i);
      if (solved === null && popcount(cand[i]) === 1 && popcount(before[i]) > 1) {
        solved = { cell: i, digit: 32 - Math.clz32(cand[i]) };
      }
    }
    return { technique: technique.name, difficulty: technique.difficulty, cells, solved };
  }
  return null;
}

export interface LogicTrace {
  /** Hardest technique the solve was forced onto. 0 if nothing was needed. */
  hardest: number;
  /** How many times each technique fired. */
  used: Map<string, number>;
}

/**
 * Applies techniques to a fixed point, always reaching for the easiest one
 * that still does something. Returns false only on a contradiction.
 */
export function propagate(
  cand: Candidates,
  cons: Constraints,
  maxDifficulty = MAX_DIFFICULTY,
  trace?: LogicTrace,
): boolean {
  for (;;) {
    let progressed = false;
    for (const technique of TECHNIQUES) {
      if (technique.difficulty > maxDifficulty) break;
      const outcome = technique.run(cand, cons);
      if (outcome === -1) return false;
      if (outcome === 0) continue;
      if (trace) {
        trace.hardest = Math.max(trace.hardest, technique.difficulty);
        trace.used.set(technique.name, (trace.used.get(technique.name) ?? 0) + 1);
      }
      progressed = true;
      break; // restart from the easiest technique
    }
    if (!progressed) return true;
  }
}
