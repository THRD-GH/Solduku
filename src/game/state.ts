import {
  ALL_DIGITS,
  CELLS,
  PEERS,
  UNITS,
  bit,
  boxOf,
  colOf,
  maskToDigit,
  popcount,
  rowOf,
} from '../core/grid.ts';
import { CLASSIC_CONS, LEVEL_CONFIG } from '../core/classic.ts';
import { propagatedCandidates } from '../core/solver.ts';
import { isJoker, JOKER_SUIT } from '../core/types.ts';
import type { Card, Puzzle, PuzzleId } from '../core/types.ts';
import type { SavedGame } from './storage.ts';

/** Where a card is sitting before it is played. */
export type Zone = { kind: 'hand'; index: number } | { kind: 'free'; index: number };

/** Points for playing a card, finishing a unit, and per card of a flush. */
export const POINTS = { place: 1, unit: 10, flushPerCard: 12 } as const;

/** The least played cards a completed unit needs before a flush counts. */
const FLUSH_MIN_CARDS = 3;

/** What one placement was worth, for the toast and the win screen. */
export interface UnitScore {
  /** 0..8 row, 9..17 column, 18..26 box. */
  unit: number;
  flush: boolean;
  /** Suit of the flush, when there is one. */
  suit: number;
  /** Number of played cards counted for the flush payout. */
  played: number;
  points: number;
}

export interface PlaceResult {
  gained: number;
  units: UnitScore[];
  riskBonus: number;
  questBonus: number;
  /** This placement was the one that made the grid impossible to complete. */
  killedGrid: boolean;
}

/** Legal destinations split by whether playing there still leaves a win. */
export interface PlacementSafety {
  safe: Set<number>;
  doomed: Set<number>;
}

/** A unit still worth chasing, for the scoring panel. */
export interface FlushProspect {
  unit: number;
  /** Cards already played into it. */
  played: number;
  /** Open cells still to fill. */
  open: number;
  /** The suit it is committed to, or -1 when only jokers are down. */
  suit: number;
  /** Whether one suit can still take every card in the unit. */
  alive: boolean;
  /** Unit bonus plus the full flush payout if it completes pure. */
  potential: number;
}

/** One user action, kept so undo can put everything back — including scoring
 *  it triggered. Saved with the game, so putting a deal down does not cost
 *  the history. */
export interface Move {
  from: Zone;
  card: Card;
  /** Cell played to, or null when the card went to a stash slot. */
  cell: number | null;
  freeIndex?: number;
  /** Legacy saves may contain auto-drawn cards after a move. New moves leave this at zero. */
  drawn: number;
  scoreDelta: number;
  unitsScored: number[];
  flushUnits: number[];
}

export class Game {
  readonly id: PuzzleId;
  readonly puzzle: Puzzle;
  /** Card played per cell; null where empty or given. */
  placed: (Card | null)[];
  hand: Card[];
  free: (Card | null)[];
  /** Jokers waiting in their own pile, separate from the number deck. */
  jokerPile = 0;
  private initialJokers = 0;
  /** One suit flush per deal becomes an optional score quest. */
  readonly questSuit: number;
  questComplete = false;
  riskBonuses = 0;
  usedBankedAid = false;
  rescuedWithJoker = false;
  /** Cards drawn so far — deck[0..deckPos) are gone. */
  deckPos = 0;
  score = 0;
  scoredUnits = new Set<number>();
  flushUnits = new Set<number>();
  selected: Zone | null = null;
  elapsedMs = 0;
  completed = false;
  /** No card can be played or stashed — the deal is lost as it stands. */
  dead = false;
  /**
   * Whether the partial grid still has any sudoku completion. The deck always
   * holds exactly the digits the open cells need, so the deal is winnable
   * precisely as long as this stays true — when it flips, some legal-but-wrong
   * placement has doomed the endgame, however far away that endgame is.
   */
  completable = true;
  private history: Move[] = [];

  constructor(id: PuzzleId, puzzle: Puzzle, restore?: SavedGame) {
    this.id = id;
    this.puzzle = puzzle;
    this.questSuit = puzzle.seed % 4;
    const cfg = LEVEL_CONFIG[puzzle.difficulty];
    if (restore) {
      this.initialJokers = restore.initialJokers ?? (puzzle.jokerCount === undefined ? 0 : puzzle.jokerCount);
      this.jokerPile = restore.jokerPile ?? this.initialJokers;
      this.questComplete = restore.questComplete ?? false;
      this.riskBonuses = restore.riskBonuses ?? 0;
      this.usedBankedAid = restore.usedBankedAid ?? false;
      this.rescuedWithJoker = restore.rescuedWithJoker ?? false;
      this.placed = restore.placed.map((c) => (c ? { ...c } : null));
      this.hand = restore.hand.map((c) => ({ ...c }));
      this.free = restore.free.map((c) => (c ? { ...c } : null));
      this.deckPos = restore.deckPos;
      this.score = restore.score;
      this.scoredUnits = new Set(restore.scoredUnits);
      this.flushUnits = new Set(restore.flushUnits);
      this.elapsedMs = restore.elapsedMs;
      this.history = (restore.moves ?? []).map((m) => ({
        ...m,
        from: { ...m.from },
        card: { ...m.card },
        unitsScored: [...m.unitsScored],
        flushUnits: [...m.flushUnits],
      }));
      this.completed = this.emptyCount === 0;
      this.dead = !this.completed && !this.anyMove();
      this.completable = this.checkCompletable();
    } else {
      this.initialJokers = puzzle.jokerCount ?? cfg.jokers;
      this.jokerPile = this.initialJokers;
      this.placed = new Array<Card | null>(CELLS).fill(null);
      this.hand = [];
      this.free = new Array<Card | null>(cfg.free).fill(null);
      this.refill();
    }
  }

  get handSize(): number {
    return LEVEL_CONFIG[this.puzzle.difficulty].hand;
  }

  get deckLeft(): number {
    return this.puzzle.deck.length - this.deckPos;
  }

  get emptyCount(): number {
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      if (this.puzzle.givens[i] === 0 && this.placed[i] === null) n++;
    }
    return n;
  }

  isGiven(i: number): boolean {
    return this.puzzle.givens[i] !== 0;
  }

  cardAt(i: number): Card | null {
    return this.placed[i];
  }

  /** The digit a cell contributes to its units. Jokers contribute nothing. */
  digitAt(i: number): number {
    if (this.puzzle.givens[i] !== 0) return this.puzzle.givens[i];
    const card = this.placed[i];
    return card === null ? 0 : card.digit;
  }

  cardIn(zone: Zone): Card | null {
    return zone.kind === 'hand' ? (this.hand[zone.index] ?? null) : this.free[zone.index];
  }

  /** Every card currently available to play. */
  private availableCards(): Card[] {
    const out = [...this.hand];
    for (const card of this.free) if (card !== null) out.push(card);
    return out;
  }

  /** A card may go on any empty cell its digit does not clash into.
   *  The joker clashes with nothing. */
  legal(cell: number, card: Card): boolean {
    if (this.puzzle.givens[cell] !== 0 || this.placed[cell] !== null) return false;
    if (isJoker(card)) return true;
    for (const p of PEERS[cell]) if (this.digitAt(p) === card.digit) return false;
    return true;
  }

  legalCells(card: Card): number[] {
    const out: number[] = [];
    for (let i = 0; i < CELLS; i++) if (this.legal(i, card)) out.push(i);
    return out;
  }

  /** Preview every legal destination without changing the deal. */
  placementSafety(zone: Zone): PlacementSafety {
    const card = this.cardIn(zone);
    const safe = new Set<number>();
    const doomed = new Set<number>();
    if (card === null || this.completed || this.dead || !this.completable) return { safe, doomed };

    const cells = this.legalCells(card);
    this.takeFrom(zone);
    for (const cell of cells) {
      this.placed[cell] = card;
      if (this.checkCompletable()) safe.add(cell);
      else doomed.add(cell);
      this.placed[cell] = null;
    }
    if (zone.kind === 'hand') this.hand.splice(zone.index, 0, card);
    else this.free[zone.index] = card;
    return { safe, doomed };
  }

  /** Digit cards and wilds still to come: hand, free cells and deck. */
  private supply(): { have: number[]; wild: number } {
    const have = new Array<number>(10).fill(0);
    let wild = this.jokerPile;
    const count = (card: Card): void => {
      if (isJoker(card)) wild++;
      else have[card.digit]++;
    };
    for (const card of this.hand) count(card);
    for (const card of this.free) if (card !== null) count(card);
    for (let k = this.deckPos; k < this.puzzle.deck.length; k++) count(this.puzzle.deck[k]);
    return { have, wild };
  }

  /**
   * True while the deal can still be finished.
   *
   * A completable *grid* is not enough: the cards have to be able to spell
   * that completion out. The deck holds a fixed multiset of digits plus a
   * few wilds, so a grid whose last cell wants a 6 is lost if the only card
   * left is a 3 — legal sudoku, unplayable hand. The search therefore fills
   * the board and spends the supply at the same time, and only a completion
   * that does both counts.
   *
   * Cells fall into two kinds: empty ones, which cost a card of that digit
   * (or a wild), and cells already holding a joker, which are paid for and
   * may take any digit the grid allows.
   */
  private checkCompletable(): boolean {
    const cand = new Uint16Array(CELLS).fill(ALL_DIGITS);
    const needsCard: boolean[] = new Array<boolean>(CELLS).fill(false);
    const open: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      const d = this.digitAt(i);
      if (d !== 0) {
        cand[i] = bit(d);
        continue;
      }
      // Either empty (a card must pay for it) or a placed joker (already paid).
      open.push(i);
      needsCard[i] = this.placed[i] === null;
    }
    if (open.length === 0) return true;

    // Peers of a settled cell can never repeat its digit.
    for (let i = 0; i < CELLS; i++) {
      const d = this.digitAt(i);
      if (d === 0) continue;
      for (const p of PEERS[i]) if (this.digitAt(p) === 0) cand[p] &= ~bit(d);
    }

    const { have, wild } = this.supply();
    let nodes = 0;
    let aborted = false;

    const search = (cells: number[], cand: Uint16Array, have: number[], wild: number): boolean => {
      if (++nodes > 30000) {
        aborted = true;
        return false;
      }
      if (cells.length === 0) return true;

      // A digit card with nowhere left to go is dead weight, and every card
      // must be played — so that position is already lost, however far off.
      for (let d = 1; d <= 9; d++) {
        if (have[d] === 0) continue;
        let room = 0;
        for (const c of cells) if (needsCard[c] && cand[c] & bit(d)) room++;
        if (room < have[d]) return false;
      }

      // Most-constrained cell first, as everywhere else in the solver.
      let best = -1;
      let bestCount = 10;
      for (const c of cells) {
        const n = popcount(cand[c]);
        if (n === 0) return false;
        if (n < bestCount) {
          bestCount = n;
          best = c;
          if (n === 1) break;
        }
      }

      const rest = cells.filter((c) => c !== best);
      let mask = cand[best];
      while (mask) {
        const b = mask & -mask;
        mask ^= b;
        const digit = maskToDigit(b);

        // Pay for the cell: a matching card, or a wild. A joker already on
        // the board costs nothing — it was paid for when it was played.
        let nextHave = have;
        let nextWild = wild;
        if (needsCard[best]) {
          if (have[digit] > 0) {
            nextHave = [...have];
            nextHave[digit]--;
          } else if (wild > 0) {
            nextWild = wild - 1;
          } else {
            continue;
          }
        }

        const nextCand = Uint16Array.from(cand);
        nextCand[best] = b;
        // The digit is spoken for in this cell's row, column and box.
        for (const p of PEERS[best]) nextCand[p] &= ~b;
        let ok = true;
        for (const c of rest) if (nextCand[c] === 0) ok = false;
        if (ok && search(rest, nextCand, nextHave, nextWild)) return true;
        if (aborted) return false;
      }
      return false;
    };

    const alive = search(open, cand, have, wild);
    // An exhausted budget proves nothing — give the deal the benefit of the doubt.
    return alive || aborted;
  }

  /**
   * What each placed joker is actually standing in for. A joker has no
   * identity of its own — it earns one as the grid around it fills. A digit
   * is reported only when the solver's propagation forces it: every
   * completion of the current board gives that joker that digit. Unforced
   * jokers map to 0.
   */
  jokerRoles(): Map<number, number> {
    const roles = new Map<number, number>();
    const jokers: number[] = [];
    for (let i = 0; i < CELLS; i++) {
      const card = this.placed[i];
      if (card !== null && isJoker(card)) jokers.push(i);
    }
    if (jokers.length === 0) return roles;

    const start = new Uint16Array(CELLS).fill(ALL_DIGITS);
    for (let i = 0; i < CELLS; i++) {
      const d = this.digitAt(i);
      if (d !== 0) start[i] = bit(d);
    }
    const cand = propagatedCandidates(CLASSIC_CONS, start);
    for (const j of jokers) {
      roles.set(j, cand !== null && popcount(cand[j]) === 1 ? maskToDigit(cand[j]) : 0);
    }
    return roles;
  }

  /** Whether anything at all can still be done from this position. */
  anyMove(): boolean {
    for (const card of this.availableCards()) {
      for (let i = 0; i < CELLS; i++) if (this.legal(i, card)) return true;
    }
    if (this.hand.length > 0 && this.free.some((f) => f === null)) return true;
    if (this.canDrawJoker()) return true;
    return this.canDraw();
  }

  /** The deck can be tapped whenever it can fill at least one hand slot. */
  canDraw(): boolean {
    return !this.completed && !this.dead && this.hand.length < this.handSize && this.deckLeft > 0;
  }

  /** A banked joker may enter even a dead deal, provided there is hand room. */
  canDrawBankedJoker(): boolean {
    return !this.completed;
  }

  private refill(): number {
    let drawn = 0;
    while (this.hand.length < this.handSize && this.deckPos < this.puzzle.deck.length) {
      this.hand.push(this.puzzle.deck[this.deckPos++]);
      drawn++;
    }
    return drawn;
  }

  /** Draw from the pile until the hand is full, or the deck is empty. */
  draw(): number {
    if (!this.canDraw()) return 0;
    return this.refill();
  }

  /** Load one player-earned joker into the separate joker pile. */
  addBankedJokerToPile(): boolean {
    if (!this.canDrawBankedJoker()) return false;
    this.jokerPile++;
    this.usedBankedAid = true;
    if (!this.completable) this.rescuedWithJoker = true;
    this.selected = null;
    this.dead = !this.anyMove();
    this.completable = this.checkCompletable();
    return true;
  }

  /** Whether one further joker would restore a valid continuation. */
  canCompleteWithExtraJoker(): boolean {
    if (this.completed) return false;
    this.jokerPile++;
    const completable = this.checkCompletable();
    this.jokerPile--;
    return completable;
  }

  /** A joker can be drawn from its own pile into an open hand slot. */
  canDrawJoker(): boolean {
    return !this.completed && this.hand.length < this.handSize && this.jokerPile > 0;
  }

  drawJoker(): boolean {
    if (!this.canDrawJoker()) return false;
    this.jokerPile--;
    this.hand.push({ digit: 0, suit: JOKER_SUIT });
    this.selected = null;
    this.dead = !this.anyMove();
    return true;
  }

  /** Add one empty free cell from the player's earned bonus-slot bank. */
  addBonusFreeSlot(): boolean {
    if (this.completed) return false;
    this.free.push(null);
    this.usedBankedAid = true;
    this.dead = !this.anyMove();
    return true;
  }

  private takeFrom(zone: Zone): Card | null {
    if (zone.kind === 'hand') {
      const card = this.hand[zone.index];
      if (card === undefined) return null;
      this.hand.splice(zone.index, 1);
      return card;
    }
    const card = this.free[zone.index];
    this.free[zone.index] = null;
    return card;
  }

  /**
   * Score the units this cell just finished. A unit pays out once, when its
   * last cell fills; the flush bonus needs every played card in the unit to
   * share a suit (jokers count as any suit), and enough of them that a run of
   * givens does not hand out flushes for free.
   */
  private settleUnits(cell: number): UnitScore[] {
    const out: UnitScore[] = [];
    const touched = [rowOf(cell), 9 + colOf(cell), 18 + boxOf(cell)];
    for (const u of touched) {
      if (this.scoredUnits.has(u)) continue;
      const cells = UNITS[u];
      let complete = true;
      for (const c of cells) {
        if (this.puzzle.givens[c] === 0 && this.placed[c] === null) {
          complete = false;
          break;
        }
      }
      if (!complete) continue;

      this.scoredUnits.add(u);
      let points = POINTS.unit;
      let suit = -1;
      let flush = true;
      let played = 0;
      for (const c of cells) {
        const card = this.placed[c];
        if (card === null) continue;
        played++;
        if (isJoker(card)) continue;
        if (suit === -1) suit = card.suit;
        else if (card.suit !== suit) flush = false;
      }
      flush = flush && suit !== -1 && played >= FLUSH_MIN_CARDS;
      if (flush) {
        points += POINTS.flushPerCard * played;
        this.flushUnits.add(u);
      }
      out.push({ unit: u, flush, suit, played, points });
    }
    return out;
  }

  /** Play the card in `zone` onto `cell`. Null when the move is not legal. */
  place(zone: Zone, cell: number): PlaceResult | null {
    if (this.completed || this.dead) return null;
    const card = this.cardIn(zone);
    if (card === null || !this.legal(cell, card)) return null;

    const fullHandRisk = zone.kind === 'hand' && this.hand.length === this.handSize;
    this.takeFrom(zone);
    this.placed[cell] = card;

    const units = this.settleUnits(cell);
    const riskBonus = fullHandRisk && units.length > 0 ? 5 : 0;
    const questBonus =
      !this.questComplete && units.some((u) => u.flush && u.suit === this.questSuit) ? 25 : 0;
    if (questBonus > 0) this.questComplete = true;
    if (riskBonus > 0) this.riskBonuses++;
    const gained = POINTS.place + units.reduce((t, u) => t + u.points, 0) + riskBonus + questBonus;
    this.score += gained;

    this.history.push({
      from: zone,
      card,
      cell,
      drawn: 0,
      scoreDelta: gained,
      unitsScored: units.map((u) => u.unit),
      flushUnits: units.filter((u) => u.flush).map((u) => u.unit),
    });

    this.selected = null;
    this.completed = this.emptyCount === 0;
    this.dead = !this.completed && !this.anyMove();
    /*
     * Jokers can doom a position too, even though they never clash: spending
     * a wild on a cell a plain card could have covered can strand a digit
     * that now has nowhere to go. So every placement is checked, not just
     * the digit ones.
     */
    let killedGrid = false;
    if (!this.completed && this.completable) {
      this.completable = this.checkCompletable();
      killedGrid = !this.completable;
    }
    return { gained, units, riskBonus, questBonus, killedGrid };
  }

  /** Park a hand card in an empty stash slot. */
  stash(handIndex: number, freeIndex: number): boolean {
    if (this.completed || this.dead) return false;
    if (this.free[freeIndex] !== null) return false;
    const card = this.hand[handIndex];
    if (card === undefined) return false;

    this.hand.splice(handIndex, 1);
    this.free[freeIndex] = card;
    this.history.push({
      from: { kind: 'hand', index: handIndex },
      card,
      cell: null,
      freeIndex,
      drawn: 0,
      scoreDelta: 0,
      unitsScored: [],
      flushUnits: [],
    });

    this.selected = null;
    this.dead = !this.anyMove();
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * Where the flush money still is: every unscored unit with at least one
   * card played, whether its flush is still alive, and what it would pay if
   * every remaining open cell were filled with the right suit.
   */
  flushProspects(): FlushProspect[] {
    const out: FlushProspect[] = [];
    for (let u = 0; u < UNITS.length; u++) {
      if (this.scoredUnits.has(u)) continue;
      let played = 0;
      let open = 0;
      let suit = -1;
      let alive = true;
      for (const c of UNITS[u]) {
        const card = this.placed[c];
        if (card !== null) {
          played++;
          if (isJoker(card)) continue;
          if (suit === -1) suit = card.suit;
          else if (card.suit !== suit) alive = false;
        } else if (this.puzzle.givens[c] === 0) {
          open++;
        }
      }
      if (played === 0) continue;
      const finalCards = played + open;
      out.push({
        unit: u,
        played,
        open,
        suit,
        alive: alive && finalCards >= 3,
        potential: POINTS.unit + POINTS.flushPerCard * finalCards,
      });
    }
    return out.sort(
      (a, b) => Number(b.alive) - Number(a.alive) || b.played - a.played || a.open - b.open,
    );
  }

  /** Completed flushes, recalculated from the board for a transparent score ledger. */
  completedFlushes(): UnitScore[] {
    const out: UnitScore[] = [];
    for (const unit of this.flushUnits) {
      let played = 0;
      let suit = -1;
      for (const cell of UNITS[unit]) {
        const card = this.placed[cell];
        if (card === null) continue;
        played++;
        if (!isJoker(card) && suit === -1) suit = card.suit;
      }
      out.push({
        unit,
        flush: true,
        suit,
        played,
        points: POINTS.unit + POINTS.flushPerCard * played,
      });
    }
    return out.sort((a, b) => a.unit - b.unit);
  }

  /** Put the last move back: the card, the cards drawn after it, the score. */
  undo(): boolean {
    const move = this.history.pop();
    if (!move) return false;

    for (let k = 0; k < move.drawn; k++) this.hand.pop();
    this.deckPos -= move.drawn;

    if (move.cell !== null) this.placed[move.cell] = null;
    else if (move.freeIndex !== undefined) this.free[move.freeIndex] = null;

    if (move.from.kind === 'hand') this.hand.splice(move.from.index, 0, move.card);
    else this.free[move.from.index] = move.card;

    this.score -= move.scoreDelta;
    for (const u of move.unitsScored) this.scoredUnits.delete(u);
    for (const u of move.flushUnits) this.flushUnits.delete(u);

    this.selected = null;
    this.completed = false;
    this.dead = false;
    if (!this.completable) this.completable = this.checkCompletable();
    return true;
  }

  /** Back to the fresh deal: same givens, same deck order. */
  restart(): void {
    const cfg = LEVEL_CONFIG[this.puzzle.difficulty];
    this.placed = new Array<Card | null>(CELLS).fill(null);
    this.hand = [];
    this.free = new Array<Card | null>(cfg.free).fill(null);
    this.jokerPile = this.initialJokers;
    this.questComplete = false;
    this.riskBonuses = 0;
    this.usedBankedAid = false;
    this.rescuedWithJoker = false;
    this.deckPos = 0;
    this.score = 0;
    this.scoredUnits.clear();
    this.flushUnits.clear();
    this.selected = null;
    this.completed = false;
    this.dead = false;
    this.completable = true;
    this.history = [];
    this.refill();
  }

  toSave(): SavedGame {
    return {
      id: this.id,
      puzzle: this.puzzle,
      placed: this.placed,
      hand: this.hand,
      free: this.free,
      jokerPile: this.jokerPile,
      initialJokers: this.initialJokers,
      questComplete: this.questComplete,
      riskBonuses: this.riskBonuses,
      usedBankedAid: this.usedBankedAid,
      rescuedWithJoker: this.rescuedWithJoker,
      deckPos: this.deckPos,
      score: this.score,
      scoredUnits: [...this.scoredUnits],
      flushUnits: [...this.flushUnits],
      elapsedMs: this.elapsedMs,
      moves: this.history,
    };
  }
}
