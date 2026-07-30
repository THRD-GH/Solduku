/** Static geometry of a 9x9 sudoku grid. Everything here is precomputed once. */

export const SIZE = 9;
export const CELLS = 81;
export const ALL_DIGITS = 0b111111111; // bit 0 => digit 1 ... bit 8 => digit 9

export const bit = (digit: number): number => 1 << (digit - 1);

/** Digits (1..9) present in a bitmask. */
export function maskToDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}

export function popcount(mask: number): number {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
}

/** Lowest set digit in a mask, or 0. Only meaningful when popcount === 1. */
export function maskToDigit(mask: number): number {
  return mask === 0 ? 0 : 32 - Math.clz32(mask & -mask);
}

export const rowOf = (i: number): number => (i / 9) | 0;
export const colOf = (i: number): number => i % 9;
export const boxOf = (i: number): number => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);

/** 27 units: 9 rows, 9 columns, 9 boxes. */
export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const r0 = ((b / 3) | 0) * 3;
    const c0 = (b % 3) * 3;
    const cells: number[] = [];
    for (let r = r0; r < r0 + 3; r++) for (let c = c0; c < c0 + 3; c++) cells.push(r * 9 + c);
    units.push(cells);
  }
  return units;
})();

/** The 20 cells sharing a row, column or box with cell i. */
export const PEERS: number[][] = (() => {
  const peers: number[][] = Array.from({ length: CELLS }, () => []);
  for (let i = 0; i < CELLS; i++) {
    const seen = new Set<number>();
    for (const unit of UNITS) {
      if (!unit.includes(i)) continue;
      for (const j of unit) if (j !== i) seen.add(j);
    }
    peers[i] = [...seen];
  }
  return peers;
})();

/** Orthogonally adjacent cells — used when growing cages. */
export const NEIGHBOURS: number[][] = (() => {
  const nb: number[][] = Array.from({ length: CELLS }, () => []);
  for (let i = 0; i < CELLS; i++) {
    const r = rowOf(i);
    const c = colOf(i);
    if (r > 0) nb[i].push(i - 9);
    if (r < 8) nb[i].push(i + 9);
    if (c > 0) nb[i].push(i - 1);
    if (c < 8) nb[i].push(i + 1);
  }
  return nb;
})();
