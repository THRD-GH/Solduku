import { ALL_DIGITS, CELLS, PEERS, UNITS, bit, boxOf, colOf, rowOf } from '../core/grid.ts';
import { CLASSIC_CONS, LEVEL_CONFIG } from '../core/classic.ts';
import { solve } from '../core/solver.ts';
import { isJoker } from '../core/types.ts';
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
  points: number;
}

export interface PlaceResult {
  gained: number;
  units: UnitScore[];
  /** This placement was the one that made the grid impossible to complete. */
  killedGrid: boolean;
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

/** One user action, kept so undo can put everything back — including the
 *  cards drawn after the move and any scoring it triggered. */
interface Move {
  from: Zone;
  card: Card;
  /** Cell played to, or null when the card went to a stash slot. */
  cell: number | null;
  freeIndex?: number;
  /** Cards drawn into the hand after this move. */
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
    const cfg = LEVEL_CONFIG[puzzle.difficulty];
    if (restore) {
      this.placed = restore.placed.map((c) => (c ? { ...c } : null));
      this.hand = restore.hand.map((c) => ({ ...c }));
      this.free = restore.free.map((c) => (c ? { ...c } : null));
      this.deckPos = restore.deckPos;
      this.score = restore.score;
      this.scoredUnits = new Set(restore.scoredUnits);
      this.flushUnits = new Set(restore.flushUnits);
      this.elapsedMs = restore.elapsedMs;
      this.completed = this.emptyCount === 0;
      this.dead = !this.completed && !this.anyMove();
      this.completable = this.checkCompletable();
    } else {
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

  /**
   * True while the current partial grid still has at least one sudoku
   * completion. Joker cells are wild, so they enter the check as open cells
   * the solver may assign any digit — whatever it picks is what the joker is
   * already standing in for.
   */
  private checkCompletable(): boolean {
    const cand = new Uint16Array(CELLS).fill(ALL_DIGITS);
    for (let i = 0; i < CELLS; i++) {
      const d = this.digitAt(i);
      if (d !== 0) cand[i] = bit(d);
    }
    const r = solve(CLASSIC_CONS, { start: cand, maxSolutions: 1, nodeLimit: 20000 });
    // An aborted search proves nothing — give the deal the benefit of the doubt.
    return r.aborted || r.count > 0;
  }

  /** Whether anything at all can still be done from this position. */
  anyMove(): boolean {
    for (const card of this.availableCards()) {
      for (let i = 0; i < CELLS; i++) if (this.legal(i, card)) return true;
    }
    return this.hand.length > 0 && this.free.some((f) => f === null);
  }

  private refill(): number {
    let drawn = 0;
    while (this.hand.length < this.handSize && this.deckPos < this.puzzle.deck.length) {
      this.hand.push(this.puzzle.deck[this.deckPos++]);
      drawn++;
    }
    return drawn;
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
      out.push({ unit: u, flush, suit, points });
    }
    return out;
  }

  /** Play the card in `zone` onto `cell`. Null when the move is not legal. */
  place(zone: Zone, cell: number): PlaceResult | null {
    if (this.completed || this.dead) return null;
    const card = this.cardIn(zone);
    if (card === null || !this.legal(cell, card)) return null;

    this.takeFrom(zone);
    this.placed[cell] = card;

    const units = this.settleUnits(cell);
    const gained = POINTS.place + units.reduce((t, u) => t + u.points, 0);
    this.score += gained;

    const drawn = this.refill();
    this.history.push({
      from: zone,
      card,
      cell,
      drawn,
      scoreDelta: gained,
      unitsScored: units.map((u) => u.unit),
      flushUnits: units.filter((u) => u.flush).map((u) => u.unit),
    });

    this.selected = null;
    this.completed = this.emptyCount === 0;
    this.dead = !this.completed && !this.anyMove();
    // Jokers never clash, so only a digit card can newly doom the grid.
    let killedGrid = false;
    if (!this.completed && this.completable && !isJoker(card)) {
      this.completable = this.checkCompletable();
      killedGrid = !this.completable;
    }
    return { gained, units, killedGrid };
  }

  /** Park a hand card in an empty stash slot. */
  stash(handIndex: number, freeIndex: number): boolean {
    if (this.completed || this.dead) return false;
    if (this.free[freeIndex] !== null) return false;
    const card = this.hand[handIndex];
    if (card === undefined) return false;

    this.hand.splice(handIndex, 1);
    this.free[freeIndex] = card;
    const drawn = this.refill();
    this.history.push({
      from: { kind: 'hand', index: handIndex },
      card,
      cell: null,
      freeIndex,
      drawn,
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
      deckPos: this.deckPos,
      score: this.score,
      scoredUnits: [...this.scoredUnits],
      flushUnits: [...this.flushUnits],
      elapsedMs: this.elapsedMs,
    };
  }
}
