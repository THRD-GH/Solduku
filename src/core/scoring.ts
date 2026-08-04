import { UNITS } from './grid.ts';
import type { Puzzle } from './types.ts';

/** Points for playing a card, finishing a unit, and per card of a flush. */
export const POINTS = { place: 1, unit: 10, flushPerCard: 12 } as const;

/** The least played cards a completed unit needs before a flush counts. */
export const FLUSH_MIN_CARDS = 3;

/** Completing a flush in the deal's quest suit. */
export const QUEST_BONUS = 25;

/** Placing a card from a full hand that completes a unit. */
export const RISK_BONUS = 5;

/**
 * 0 unranked, 1–4 the four graded bands, 5 the Superstar.
 *
 * The Superstar is not a band and is not advertised: it is what happens when a
 * deal is played past the score the grid was calculated to be worth. A
 * standard deal cannot quite get there — it takes bonus play the target does
 * not count, or the extra jokers a player has earned and chosen to spend.
 */
export type TrophyTier = 0 | 1 | 2 | 3 | 4 | 5;
export type EarnedTrophyTier = 1 | 2 | 3 | 4;
export const SUPERSTAR_TIER = 5;

/**
 * Trophies as a share of the ground a deal actually covers.
 *
 * Fixed per-level scores could not work: measured over 20 deals a level, the
 * floor barely moves between levels (305 to 327) while the ceiling swings
 * about twofold *within* one level — level 5 runs from 483 to 917 depending
 * only on how the suits fell. A fixed number therefore graded the shuffle
 * rather than the play, and Diamond was out of reach on a third of level 1
 * deals while being the easiest tier on level 6.
 *
 * Measured from the floor — what simply finishing pays — so a trophy always
 * means bonus play, never just completion.
 */
export const TROPHY_BAND_SHARE: Record<EarnedTrophyTier, number> = {
  1: 0.2,
  2: 0.4,
  3: 0.65,
  4: 0.85,
};

/**
 * A deal with no flush available has no span to divide, so the bands would
 * all collapse onto the floor and hand out Diamond for finishing. Such a deal
 * can still be played above the floor with full-hand bonuses, so that is the
 * ground the bands measure instead.
 */
const MIN_SPAN = 135;

/** One unit the target expects to flush, and what it costs to do it. */
export interface TargetFlush {
  unit: number;
  suit: number;
  /** Cards played into the unit — the flush pays per card. */
  cards: number;
  /** How many of those cards have to be jokers, for want of the right suit. */
  jokers: number;
}

export interface DealTarget {
  /** One point per card played; every open cell takes exactly one. */
  cards: number;
  /** Ten points per row, column and box. */
  units: number;
  flush: number;
  quest: number;
  /** cards + units + flush + quest — a clean run that takes every flush below. */
  total: number;
  flushed: TargetFlush[];
}

/** What each trophy costs on this particular deal. */
export function trophyBands(target: DealTarget): Record<EarnedTrophyTier, number> {
  const floor = target.cards + target.units;
  const span = Math.max(target.total - floor, MIN_SPAN);
  return {
    1: Math.round(floor + span * TROPHY_BAND_SHARE[1]),
    2: Math.round(floor + span * TROPHY_BAND_SHARE[2]),
    3: Math.round(floor + span * TROPHY_BAND_SHARE[3]),
    4: Math.round(floor + span * TROPHY_BAND_SHARE[4]),
  };
}

/** The trophy a score has earned on the deal it was scored in. */
export function trophyForTarget(target: DealTarget, score: number): TrophyTier {
  // Past everything the grid was calculated to be worth.
  if (score > target.total) return SUPERSTAR_TIER;
  const bands = trophyBands(target);
  if (score >= bands[4]) return 4;
  if (score >= bands[3]) return 3;
  if (score >= bands[2]) return 2;
  if (score >= bands[1]) return 1;
  return 0;
}

/**
 * The best score this deal can actually be played to.
 *
 * The givens have exactly one solution, so every open cell's *digit* is
 * already decided before a card is dealt — the only freedom is which card of
 * that digit lands there, and therefore which suit. Placement and unit points
 * are fixed by the deal, so the whole question is which units can be flushed.
 *
 * A unit can flush in suit s if every open cell in it can be paid for with a
 * card of its own digit in suit s, or with a joker. Units are taken
 * best-paying first, and one is only accepted if the cards to do it are
 * genuinely still there and no cell it covers has already been promised to
 * another suit. Everything the search accepts is therefore mutually
 * consistent and playable together: the target is a score a perfect run can
 * really reach, not a ceiling stitched together from incompatible bests.
 *
 * Risk bonuses are deliberately left out — they depend on when a player draws
 * rather than on the deal — so a very good run can finish slightly above the
 * target.
 */
export function dealTarget(puzzle: Puzzle, jokers: number, questSuit: number): DealTarget {
  const isOpen = (cell: number): boolean => puzzle.givens[cell] === 0;
  const cards = puzzle.givens.reduce((n, given) => n + (given === 0 ? 1 : 0), 0);

  // What the number deck can pay with: supply[digit][suit].
  const supply: number[][] = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  for (const card of puzzle.deck) if (card.digit !== 0) supply[card.digit][card.suit]++;

  const candidates: { unit: number; suit: number; cells: number[]; value: number }[] = [];
  for (let unit = 0; unit < UNITS.length; unit++) {
    const cells = UNITS[unit].filter(isOpen);
    if (cells.length < FLUSH_MIN_CARDS) continue;
    for (let suit = 0; suit < 4; suit++) {
      candidates.push({ unit, suit, cells, value: POINTS.flushPerCard * cells.length });
    }
  }
  // Best-paying first; ties by unit then suit so a deal always reports the
  // same target.
  candidates.sort((a, b) => b.value - a.value || a.unit - b.unit || a.suit - b.suit);

  const pack = (jokerBudget: number): TargetFlush[] => {
  const used: number[][] = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  const promised = new Map<number, number>();
  const taken = new Set<number>();
  let jokersUsed = 0;
  const flushed: TargetFlush[] = [];

  for (const candidate of candidates) {
    if (taken.has(candidate.unit)) continue;
    // A cell promised to one suit cannot serve a flush in another.
    if (candidate.cells.some((cell) => (promised.get(cell) ?? candidate.suit) !== candidate.suit)) {
      continue;
    }

    // Cells already promised to this same suit are paid for; the rest are not.
    const unpaid = candidate.cells.filter((cell) => !promised.has(cell));
    const spent: number[] = [];
    let jokerCost = 0;
    let affordable = true;
    for (const cell of unpaid) {
      const digit = puzzle.solution[cell];
      if (used[digit][candidate.suit] < supply[digit][candidate.suit]) {
        used[digit][candidate.suit]++;
        spent.push(digit);
      } else if (jokersUsed + jokerCost < jokerBudget) {
        jokerCost++;
      } else {
        affordable = false;
        break;
      }
    }
    if (!affordable) {
      for (const digit of spent) used[digit][candidate.suit]--;
      continue;
    }

    jokersUsed += jokerCost;
    for (const cell of candidate.cells) promised.set(cell, candidate.suit);
    taken.add(candidate.unit);
    flushed.push({
      unit: candidate.unit,
      suit: candidate.suit,
      cards: candidate.cells.length,
      jokers: jokerCost,
    });
  }

    flushed.sort((a, b) => a.unit - b.unit);
    return flushed;
  };

  /*
   * Spending a wild on an early unit can promise its cells to a suit that a
   * later, better-paying unit then cannot use — so more jokers does not always
   * mean a higher packing. Every budget up to the deal's own is tried and the
   * best kept, which makes the figure both stable and monotone in jokers.
   */
  const worth = (flushed: TargetFlush[]): number => {
    const flush = flushed.reduce((total, f) => total + POINTS.flushPerCard * f.cards, 0);
    return flush + (flushed.some((f) => f.suit === questSuit) ? QUEST_BONUS : 0);
  };
  let flushed = pack(0);
  for (let budget = 1; budget <= jokers; budget++) {
    const attempt = pack(budget);
    if (worth(attempt) > worth(flushed)) flushed = attempt;
  }

  const flush = flushed.reduce((total, f) => total + POINTS.flushPerCard * f.cards, 0);
  const quest = flushed.some((f) => f.suit === questSuit) ? QUEST_BONUS : 0;
  const units = UNITS.length * POINTS.unit;
  return { cards, units, flush, quest, total: cards + units + flush + quest, flushed };
}
