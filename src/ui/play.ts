import { CELLS, colOf, rowOf } from '../core/grid.ts';
import { LEVEL_NAMES } from '../core/classic.ts';
import {
  JOKER_SUIT,
  SUIT_GLYPHS,
  formatPuzzleId,
  isJoker,
  isRedSuit,
  jokerVariant,
  rankLabel,
} from '../core/types.ts';
import type { Card } from '../core/types.ts';
import type { Game, PlaceResult, Zone } from '../game/state.ts';
import {
  clearSaveFor,
  awardScoreTrophy,
  earnWinReward,
  freeSlotBank,
  jokerBank,
  markFinished,
  saveGame,
  saveHistory,
  spendFreeSlot,
  spendJokers,
  TROPHY_NAMES,
  winsToNextFreeSlot,
} from '../game/storage.ts';
import { SUPERSTAR_TIER, trophyBands, trophyForTarget } from '../core/scoring.ts';
import { trophyIcon } from './glyphs.ts';
import { buildStamp, el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { openMainMenu } from './menu.ts';
import type { AppContext } from './app-context.ts';
import type { Step } from '../core/techniques.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The jesters.
 *
 * Four court fools in the same hand: belled cap, gold crown, painted face and
 * a scalloped ruff, each in its own pair of colours. They are drawn rather
 * than shipped as artwork because a joker is never bigger than about thirty
 * pixels here — an illustration with real hatching in it would be mud at that
 * size, so what survives is the silhouette and the colour, which is all a
 * player needs to say "the green one" about a card in their hand.
 *
 * The colours are printed on, not inherited: a playing card does not change
 * its face because the room got darker.
 */
interface JesterPalette {
  /** The two halves of the cap and ruff. */
  a: string;
  b: string;
  /** Bells, crown and trim. */
  gold: string;
}

const JESTERS: JesterPalette[] = [
  { a: '#c8382f', b: '#2b3a63', gold: '#e8b53a' },
  { a: '#6b4b9e', b: '#1f8a76', gold: '#e8b53a' },
  { a: '#c23a72', b: '#334155', gold: '#e8b53a' },
  { a: '#d98324', b: '#1f6b45', gold: '#e8b53a' },
];

const JESTER_INK = '#1e2436';
const JESTER_SKIN = '#f6efe0';

function jesterCap(variant = 0): SVGSVGElement {
  const v = jokerVariant({ digit: 0, suit: JOKER_SUIT, variant });
  const paint = JESTERS[v];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'jhat');
  svg.setAttribute('aria-hidden', 'true');

  const add = (tag: string, attrs: Record<string, string>): void => {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  };
  const horn = (d: string, fill: string): void =>
    add('path', { d, fill, stroke: JESTER_INK, 'stroke-width': '1.1', 'stroke-linejoin': 'round' });
  const bell = (cx: number, cy: number, r = 3.2): void => {
    add('circle', { cx: String(cx), cy: String(cy), r: String(r), fill: paint.gold, stroke: JESTER_INK, 'stroke-width': '1.1' });
    add('circle', { cx: String(cx), cy: String(cy + r * 0.28), r: String(r * 0.3), fill: JESTER_INK });
  };

  // ---- the cap, which is what tells the four of them apart at a glance ----
  switch (v) {
    case 1:
      // Two tall horns swept out wide.
      horn('M18 22 Q6 20 4 7 Q13 10 24 18 Z', paint.a);
      horn('M30 22 Q42 20 44 7 Q35 10 24 18 Z', paint.b);
      bell(4, 7);
      bell(44, 7);
      break;
    case 2:
      // A low bonnet of three round lobes.
      horn('M13 22 Q6 16 9 8 Q17 11 22 19 Z', paint.a);
      horn('M35 22 Q42 16 39 8 Q31 11 26 19 Z', paint.b);
      horn('M18 19 Q24 5 30 19 Z', paint.a);
      bell(9, 7.5, 2.9);
      bell(39, 7.5, 2.9);
      bell(24, 5, 2.9);
      break;
    case 3:
      // Two horns around a star, for the wildest of the four.
      horn('M17 22 Q7 19 6 9 Q14 12 23 19 Z', paint.b);
      horn('M31 22 Q41 19 42 9 Q34 12 25 19 Z', paint.a);
      add('polygon', {
        points: '24,2 26.4,8.6 33.4,8.6 27.8,12.9 29.9,19.6 24,15.5 18.1,19.6 20.2,12.9 14.6,8.6 21.6,8.6',
        fill: paint.gold,
        stroke: JESTER_INK,
        'stroke-width': '1.1',
        'stroke-linejoin': 'round',
      });
      bell(6, 9, 2.9);
      bell(42, 9, 2.9);
      break;
    default:
      // The classic three points, two out and one up.
      horn('M15 21 Q5 19 4 8 Q12 11 23 18 Z', paint.a);
      horn('M33 21 Q43 19 44 8 Q36 11 25 18 Z', paint.b);
      horn('M18 19 Q24 3 30 19 Z', paint.a);
      bell(4, 8);
      bell(44, 8);
      bell(24, 3.5);
  }

  // ---- ruff, face, then the crown over the brow ----
  add('path', {
    d: 'M7 38 Q11 48 16 39 Q20 48 24 39.5 Q28 48 32 39 Q37 48 41 38 L41 34 L7 34 Z',
    fill: paint.b,
    stroke: JESTER_INK,
    'stroke-width': '1.1',
    'stroke-linejoin': 'round',
  });
  add('path', { d: 'M16 39 Q20 48 24 39.5 Q28 48 32 39 L32 34 L16 34 Z', fill: paint.a });
  add('path', {
    d: 'M7 38 Q11 48 16 39 Q20 48 24 39.5 Q28 48 32 39 Q37 48 41 38',
    fill: 'none',
    stroke: paint.gold,
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
  });

  add('ellipse', {
    cx: '24', cy: '29', rx: '9', ry: '9.8',
    fill: JESTER_SKIN, stroke: JESTER_INK, 'stroke-width': '1.2',
  });
  // Painted diamonds over each eye, and a grin.
  add('path', { d: 'M20.4 26.6 21.8 23.4 23.2 26.6 21.8 29Z', fill: paint.a });
  add('path', { d: 'M24.8 26.6 26.2 23.4 27.6 26.6 26.2 29Z', fill: paint.a });
  add('path', { d: 'M19.6 32.4 Q24 36.4 28.4 32.4 Q24 34 19.6 32.4Z', fill: '#b8332c', stroke: JESTER_INK, 'stroke-width': '0.9', 'stroke-linejoin': 'round' });

  add('path', {
    d: 'M13.5 24.5 L16 18.5 L19.5 22.5 L24 16 L28.5 22.5 L32 18.5 L34.5 24.5 Z',
    fill: paint.gold,
    stroke: JESTER_INK,
    'stroke-width': '1.1',
    'stroke-linejoin': 'round',
  });
  return svg;
}

/**
 * The undo arrow: a hooked arc pointing back on itself. `mirrored` flips it
 * for redo, so the pair reads as the same gesture in opposite directions.
 */
function undoArrow(mirrored = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'gicon');
  svg.setAttribute('aria-hidden', 'true');

  const group = document.createElementNS(SVG_NS, 'g');
  if (mirrored) group.setAttribute('transform', 'translate(24,0) scale(-1,1)');
  group.setAttribute('fill', 'none');
  group.setAttribute('stroke', 'currentColor');
  group.setAttribute('stroke-width', '2.3');
  group.setAttribute('stroke-linecap', 'round');
  group.setAttribute('stroke-linejoin', 'round');

  const arc = document.createElementNS(SVG_NS, 'path');
  arc.setAttribute('d', 'M7 9h8a5 5 0 0 1 0 10h-5');
  const head = document.createElementNS(SVG_NS, 'polyline');
  head.setAttribute('points', '11,5 7,9 11,13');
  group.append(arc, head);
  svg.append(group);
  return svg;
}

/** A house: the way back to the menu, in the shape everyone reads as home. */
function homeIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'gicon');
  svg.setAttribute('aria-hidden', 'true');
  const roof = document.createElementNS(SVG_NS, 'path');
  roof.setAttribute('d', 'M12 3 1.8 11.4l1.6 1.9L12 6l8.6 7.3 1.6-1.9Z');
  roof.setAttribute('fill', 'currentColor');
  const walls = document.createElementNS(SVG_NS, 'path');
  walls.setAttribute('d', 'M5.2 12.6 12 7l6.8 5.6V21h-4.4v-5.4H9.6V21H5.2Z');
  walls.setAttribute('fill', 'currentColor');
  svg.append(roof, walls);
  return svg;
}

/** Two upright bars — pause, in the shape every player already knows. */
function pauseBars(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'gicon');
  svg.setAttribute('aria-hidden', 'true');
  for (const x of ['7', '13.6']) {
    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', x);
    bar.setAttribute('y', '4.5');
    bar.setAttribute('width', '3.4');
    bar.setAttribute('height', '15');
    bar.setAttribute('rx', '1.2');
    bar.setAttribute('fill', 'currentColor');
    svg.append(bar);
  }
  return svg;
}

/**
 * A card's face, at cell size (.scard) or tray size (.pcard content).
 *
 * `role` is the digit a placed joker has been forced into by the grid around
 * it; it wears that digit in place of its name, because on the board what
 * matters is what the cell now counts as.
 */
function cardFace(card: Card, role = 0): (HTMLElement | SVGSVGElement)[] {
  if (isJoker(card)) {
    return [
      jesterCap(jokerVariant(card)),
      el('span', { class: 'st' }, role === 0 ? 'JOKER' : rankLabel(role)),
    ];
  }
  const rank = rankLabel(card.digit);
  const suit = SUIT_GLYPHS[card.suit];
  // The ace drops its middle number for a single large pip, the way an ace is
  // drawn in any deck. The corners still carry the rank, so it stays readable
  // fanned out in the hand.
  return [
    el('span', { class: 'corner tl' }, rank, el('small', {}, suit)),
    el('span', { class: 'card-rank' }, rank),
    el('span', { class: 'card-suit' }, suit),
    el('span', { class: 'corner br' }, rank, el('small', {}, suit)),
  ];
}

function suitClass(card: Card): string {
  if (isJoker(card)) return `joker jv-${jokerVariant(card)}`;
  return `suit-${card.suit} ${isRedSuit(card.suit) ? 'red' : 'black'}${card.digit === 1 ? ' ace' : ''}`;
}

const unitName = (unit: number): string => (unit < 9 ? 'Row' : unit < 18 ? 'Column' : 'Box');
const ACHIEVEMENT_NAMES: Record<string, string> = {
  'first-deal': 'First Deal',
  'flush-finder': 'Flush Finder',
  'risk-taker': 'Risk Taker',
  'quest-chaser': 'Quest Chaser',
  'last-laugh': 'Last Laugh',
  'clean-streak-3': 'Clean Streak',
};

const HINT_NAMES: Record<string, string> = {
  'naked single': 'Naked single',
  'hidden single': 'Hidden single',
  'locked candidates': 'Locked candidates',
  'naked subset': 'Naked pair or triple',
  'hidden subset': 'Hidden pair or triple',
  'x-wing': 'X-wing',
};

const HINT_REASONS: Record<string, string> = {
  'naked single': 'Every other number is already used in that cell’s row, column or box, so only one is left for it.',
  'hidden single': 'Only one cell in its row, column or box can take that number.',
  'locked candidates': 'A candidate is confined to one box-line intersection, so it can be removed from the rest of that line.',
  'naked subset': 'A small group of cells has claimed the same small set of candidates, ruling them out elsewhere in the unit.',
  'hidden subset': 'A small group of digits can only occupy the same small group of cells.',
  'x-wing': 'A digit is restricted to matching two-row and two-column positions, ruling it out from the other cells in those columns.',
};

const cellName = (cell: number): string => `R${Math.floor(cell / 9) + 1}C${(cell % 9) + 1}`;

export class PlayScreen {
  readonly root: HTMLElement;
  isPaused = false;

  private readonly ctx: AppContext;
  readonly game: Game;
  private cells: HTMLElement[] = [];
  private board: HTMLElement;
  private idBox!: HTMLElement;
  private doomBar!: HTMLElement;
  private handRow: HTMLElement;
  private freeRow: HTMLElement;
  private freeSlotPile: HTMLButtonElement;
  private freeSlotCount: HTMLElement;
  private bankPile: HTMLButtonElement;
  private bankCount: HTMLElement;
  private jokerPile: HTMLButtonElement;
  private jokerCount: HTMLElement;
  private deckPile: HTMLButtonElement;
  private deckCount: HTMLElement;
  private scoreBox: HTMLElement;
  private scoreTrack: HTMLButtonElement;
  private scoreFill: HTMLElement;
  private scoreMarks: HTMLElement;
  private scoreAxis: HTMLElement;
  private scoreCaption: HTMLElement;
  private timerBox: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private tickId: number;
  private lastTick = performance.now();
  private finished = false;
  private pauseNode: HTMLElement | null = null;

  constructor(ctx: AppContext, game: Game) {
    this.ctx = ctx;
    this.game = game;

    const menuBtn = el('button', { class: 'iconbtn', 'aria-label': 'Menu' });
    menuBtn.append(el('i'), el('i'), el('i'));
    menuBtn.addEventListener('click', () => openMainMenu(ctx));

    // The clock rides in the title bar next to Home, where it costs no height
    // on a phone — the tray needs every row it has for cards.
    this.timerBox = el('span', { class: 'timerbox' }, '00:00');
    this.idBox = el('span', { class: 'id' }, formatPuzzleId(game.id));
    const titlebar = el(
      'div',
      { class: 'titlebar' },
      menuBtn,
      this.idBox,
      el('span', { class: 'lvl' }, LEVEL_NAMES[game.puzzle.difficulty]),
      this.timerBox,
    );

    /*
     * The score reads as a journey rather than a number: how far along this
     * particular deal you are, where the four trophies sit, and where the deal
     * runs out of points altogether. All of that is known before a card is
     * played, because the givens have one solution — so the only thing left to
     * find out is how much of it you collect.
     */
    this.scoreBox = el('span', { class: 'scorebar-value' }, '0');
    this.scoreFill = el('span', { class: 'scorebar-fill' });
    this.scoreMarks = el('span', { class: 'scorebar-marks' });
    this.scoreAxis = el('span', { class: 'scorebar-axis' });
    this.scoreCaption = el('span', { class: 'scorebar-caption' });
    this.scoreTrack = el(
      'button',
      {
        class: 'scoretrack',
        title: 'Scoring and flush prospects',
        'aria-label': 'Score progress. Opens scoring and flush prospects.',
      },
      el(
        'span',
        { class: 'scorebar', role: 'progressbar', 'aria-valuemin': 0 },
        this.scoreFill,
        this.scoreMarks,
        this.scoreBox,
      ),
      this.scoreAxis,
      this.scoreCaption,
    );
    this.scoreTrack.addEventListener('click', () => ctx.openScoring());

    this.board = el('div', { class: 'board sol', role: 'grid', 'aria-label': 'Solduku board' });
    for (let r = 0; r < 9; r++) {
      const row = el('div', { class: 'row', role: 'row' });
      for (let c = 0; c < 9; c++) {
        const i = r * 9 + c;
        const cell = el('div', {
          class: 'cell',
          role: 'gridcell',
          'data-index': i,
        });
        if (c % 3 === 0 && c !== 0) cell.classList.add('box-l');
        if (r % 3 === 0 && r !== 0) cell.classList.add('box-t');
        this.cells.push(cell);
        row.append(cell);
      }
      this.board.append(row);
    }
    bindTap(
      this.board,
      { onTap: (i) => this.onCellTap(i), forgiveDrift: true },
      (e) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
        return cell ? Number(cell.dataset.index) : -1;
      },
    );

    this.handRow = el('div', { class: 'cardrow hand' });
    this.deckCount = el('span', { class: 'count' }, String(game.deckLeft));
    this.freeRow = el('div', { class: 'cardrow free' });
    this.deckPile = el(
      'button',
      { class: 'deckpile', title: 'Draw cards until the hand is full', 'aria-label': 'Draw cards' },
      el('span', { class: 'deck-back', 'aria-hidden': 'true' }),
      el('span', { class: 'deck-count' }, this.deckCount, el('small', {}, 'cards')),
    );
    this.deckPile.addEventListener('click', () => this.drawCards());
    this.jokerCount = el('span', { class: 'count' }, String(game.jokerPile));
    this.jokerPile = el(
      'button',
      { class: 'jokerpile', title: 'Draw a joker into an open hand slot', 'aria-label': 'Joker pile' },
      jesterCap(),
      this.jokerCount,
      el('small', {}, 'jokers'),
    );
    this.jokerPile.addEventListener('click', () => this.drawJoker());
    this.bankCount = el('span', { class: 'count' }, String(jokerBank()));
    this.bankPile = el(
      'button',
      { class: 'bankpile', title: 'Add a banked joker to the joker pile', 'aria-label': 'Joker bank' },
      jesterCap(),
      this.bankCount,
      el('small', {}, 'bank'),
    );
    this.bankPile.addEventListener('click', () => this.loadBankedJoker());
    this.freeSlotCount = el('span', { class: 'count' }, String(freeSlotBank()));
    this.freeSlotPile = el(
      'button',
      { class: 'slotpile', title: 'Add a bonus free slot', 'aria-label': 'Bonus free-slot bank' },
      el('strong', {}, '+'),
      this.freeSlotCount,
      el('small', {}, 'slots'),
    );
    this.freeSlotPile.addEventListener('click', () => this.useBonusFreeSlot());

    const tray = el(
      'div',
      { class: 'tray' },
      /*
       * Three rows, not two. The hand and the piles shared a row until a phone
       * proved there was never width for both: the placeholders wrapped, the
       * tray grew a line anyway, and the board was pushed off the screen. The
       * piles now have a row of their own, which costs the same height and
       * never wraps.
       */
      el(
        'div',
        { class: 'tray-row hand-row' },
        el('span', { class: 'tray-label' }, 'Hand'),
        this.handRow,
        // The draw pile belongs beside the hand it fills.
        this.deckPile,
      ),
      el(
        'div',
        { class: 'tray-row' },
        el('span', { class: 'tray-label' }, 'Free'),
        this.freeRow,
      ),
      el(
        'div',
        { class: 'tray-row piles' },
        this.jokerPile,
        this.bankPile,
        this.freeSlotPile,
      ),
    );

    // Undo, redo and pause are the controls reached for mid-thought, so they
    // read as shapes rather than words and keep their width off the row.
    this.undoBtn = el('button', { class: 'btn icon', title: 'Undo', 'aria-label': 'Undo' }, undoArrow());
    this.undoBtn.addEventListener('click', () => this.doUndo());
    this.redoBtn = el('button', { class: 'btn icon', title: 'Redo', 'aria-label': 'Redo' }, undoArrow(true));
    this.redoBtn.addEventListener('click', () => this.doRedo());
    const hint = el('button', { class: 'btn aid' }, 'Hint');
    hint.addEventListener('click', () => this.showHint());
    const pause = el('button', { class: 'btn icon', title: 'Pause', 'aria-label': 'Pause' }, pauseBars());
    pause.addEventListener('click', () => this.pause());
    const restart = el('button', { class: 'btn' }, 'Restart');
    restart.addEventListener('click', () => confirmDialog(this.restartPrompt(), () => this.doRestart()));
    const help = el('button', { class: 'btn' }, 'Help');
    help.addEventListener('click', () => ctx.openHelp());
    const home = el(
      'button',
      { class: 'homebtn', title: 'Home', 'aria-label': 'Home' },
      homeIcon(),
    );
    home.addEventListener('click', () =>
      confirmDialog(
        'Return to the home screen? This deal will be saved so you can resume it later.',
        () => {
          this.save();
          ctx.goMenu();
        },
        'Go home',
      ),
    );
    // Leaving belongs with the deal's identity, not among the play controls.
    titlebar.append(home);

    /*
     * The grid dying is the one thing that ends a deal without ending the
     * game, and it used to announce itself with a toast that was gone in two
     * seconds. It gets a strip of its own, which stays up for as long as the
     * position is lost and carries the way out with it.
     */
    this.doomBar = el('div', { class: 'doombar', role: 'alert', hidden: true });
    const doomUndo = el('button', { class: 'btn' }, 'Undo');
    doomUndo.addEventListener('click', () => this.doUndo());
    this.doomBar.append(
      el('span', {}, 'No completion can use the cards still available.'),
      doomUndo,
    );

    this.root = el(
      'div',
      { class: 'screen play' },
      titlebar,
      this.scoreTrack,
      this.doomBar,
      this.board,
      tray,
      // The three icon controls lead the row, so the hand always knows where
      // to find them; the named buttons take the width that is left.
      el('div', { class: 'actions game-actions' }, this.undoBtn, this.redoBtn, pause, hint, restart, help),
      el('p', { class: 'build-stamp' }, buildStamp()),
    );

    this.tickId = window.setInterval(() => this.tick(), 1000);
    this.render();
    // A resumed deal may already be finished or stuck.
    if (this.game.dead) this.deadPanel();
  }

  destroy(): void {
    window.clearInterval(this.tickId);
    this.pauseNode?.remove();
    if (!this.finished) this.save();
  }

  /**
   * Pause the way the killer app does it: the board goes behind a full screen
   * rather than behind a dialog.
   *
   * A panel with a Continue button left the grid on show around it, which is
   * no pause at all if you have put the phone down mid-thought and someone
   * else picks it up. Resuming takes a deliberate hold, so the tap that woke
   * the screen cannot also give the puzzle back.
   */
  pause(): void {
    if (this.isPaused || this.game.completed) {
      this.save();
      return;
    }
    this.isPaused = true;
    this.save();
    // Put down mid-deal: let the screen behave normally again.
    this.ctx.applyWakeLock();

    const node = el(
      'div',
      { class: 'paused', role: 'dialog', 'aria-label': 'Paused' },
      el(
        'div',
        {},
        el('h2', {}, 'PAUSED'),
        el('p', {}, 'Hold (or press Escape) to continue'),
      ),
    );
    this.pauseNode = node;
    bindTap(node, { onTap: () => toast('Hold to continue'), onLong: () => this.resume() });
    document.body.append(node);
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    // The clock has been standing still; do not bill the player for it.
    this.lastTick = performance.now();
    this.pauseNode?.remove();
    this.pauseNode = null;
    this.ctx.applyWakeLock();
  }

  render(): void {
    const game = this.game;
    const selected = game.selected === null ? null : game.cardIn(game.selected);
    const legal =
      selected !== null && this.ctx.settings.highlightLegal
        ? new Set(game.legalCells(selected))
        : null;
    const safety =
      game.selected !== null && this.ctx.settings.highlightLegal && this.ctx.settings.showSafeMoves
        ? game.placementSafety(game.selected)
        : null;
    // A joker on the board counts as whatever the grid has forced it into, so
    // it answers to that digit here as much as a printed one does.
    const roles = game.jokerRoles();
    const wanted = selected !== null && !isJoker(selected) ? selected.digit : 0;

    for (let i = 0; i < CELLS; i++) {
      const cell = this.cells[i];
      cell.className = 'cell';
      if (colOf(i) % 3 === 0 && colOf(i) !== 0) cell.classList.add('box-l');
      if (rowOf(i) % 3 === 0 && rowOf(i) !== 0) cell.classList.add('box-t');

      cell.replaceChildren();
      if (game.isGiven(i)) {
        // Givens wear the ace too, so a 1 reads the same printed as dealt.
        // A given is the printed puzzle, not a card: it stays a plain digit.
        cell.append(el('span', { class: 'big given' }, String(game.puzzle.givens[i])));
      } else {
        const card = game.cardAt(i);
        if (card !== null) {
          const role = roles.get(i) ?? 0;
          cell.append(
            el('div', { class: `scard ${suitClass(card)}` }, ...cardFace(card, role)),
          );
        } else if (legal?.has(i)) {
          cell.classList.add('legal');
          if (safety?.safe.has(i)) cell.classList.add('safe');
          if (safety?.doomed.has(i)) cell.classList.add('danger');
        }
      }

      // Every cell already answering to the selected digit, jokers included.
      if (wanted !== 0) {
        const digit = game.digitAt(i) || (roles.get(i) ?? 0);
        if (digit === wanted) cell.classList.add('same');
      }
    }

    this.handRow.replaceChildren();
    game.hand.forEach((card, index) => {
      const btn = el('button', { class: `pcard ${suitClass(card)}` }, ...cardFace(card));
      const zone: Zone = { kind: 'hand', index };
      if (this.isSelected(zone)) btn.classList.add('sel');
      btn.addEventListener('click', () => this.toggleSelect(zone));
      this.handRow.append(btn);
    });
    for (let slot = game.hand.length; slot < game.handSize; slot++) {
      const canDraw = game.deckLeft > 0;
      this.handRow.append(
        el(
          'div',
          {
            class: `pcard undrawn ${canDraw ? '' : 'spent'}`.trim(),
            role: 'img',
            'aria-label': canDraw ? 'Card not yet drawn' : 'Empty hand slot',
          },
          el('span', { class: 'undrawn-mark' }, canDraw ? 'DRAW' : '—'),
        ),
      );
    }

    this.freeRow.replaceChildren();
    game.free.forEach((card, index) => {
      const zone: Zone = { kind: 'free', index };
      if (card === null) {
        const slot = el('button', { class: 'pcard empty', 'aria-label': 'Empty free cell' }, '+');
        slot.addEventListener('click', () => this.onEmptyFree(index));
        this.freeRow.append(slot);
      } else {
        const btn = el('button', { class: `pcard ${suitClass(card)}` }, ...cardFace(card));
        if (this.isSelected(zone)) btn.classList.add('sel');
        btn.addEventListener('click', () => this.toggleSelect(zone));
        this.freeRow.append(btn);
      }
    });

    this.deckCount.textContent = String(game.deckLeft);
    this.deckPile.disabled = !game.canDraw();
    const drawCount = Math.min(game.handSize - game.hand.length, game.deckLeft);
    const handNeedsCards = game.hand.length === 0 && game.canDraw();
    this.deckPile.classList.toggle('draw-needed', handNeedsCards);
    this.deckPile.setAttribute('aria-label', handNeedsCards ? 'Draw cards - hand empty' : 'Draw cards');
    this.deckPile.title = game.canDraw()
      ? handNeedsCards
        ? `Your hand is empty - draw ${drawCount} card${drawCount === 1 ? '' : 's'}`
        : `Draw ${drawCount} card${drawCount === 1 ? '' : 's'}`
      : game.deckLeft === 0
        ? 'Deck empty'
        : 'Hand full';
    this.jokerCount.textContent = String(game.jokerPile);
    this.jokerPile.disabled = !game.canDrawJoker();
    this.jokerPile.title =
      game.jokerPile === 0
        ? 'Joker pile empty'
        : game.canDrawJoker()
          ? `Draw one joker · ${game.jokerPile} available`
          : 'Hand full';
    const banked = jokerBank();
    this.bankCount.textContent = String(banked);
    this.bankPile.disabled = banked === 0 || !game.canDrawBankedJoker();
    this.bankPile.title =
      banked === 0
        ? 'No banked jokers'
        : game.canDrawBankedJoker()
          ? `Draw one banked joker · ${banked} available`
          : 'Hand full';
    this.bankPile.disabled = banked === 0 || !game.canDrawBankedJoker();
    this.bankPile.title =
      banked === 0
        ? 'No banked jokers'
        : game.canDrawBankedJoker()
          ? `Add one earned joker to the joker pile · ${banked} available`
          : 'Deal complete';
    const freeSlots = freeSlotBank();
    this.freeSlotCount.textContent = String(freeSlots);
    this.freeSlotPile.disabled = freeSlots === 0 || game.completed;
    this.freeSlotPile.title =
      freeSlots === 0
        ? `No bonus free slots · ${winsToNextFreeSlot()} wins to the next`
        : `Add one bonus free slot · ${freeSlots} available`;
    this.renderScoreBar();
    // The doomed marker follows the setting, so purists can play blind.
    const doomed = !game.completable && this.ctx.settings.warnDeadGrid;
    this.idBox.classList.toggle('doomed', doomed);
    this.idBox.title = doomed ? 'The grid can no longer be completed' : '';
    this.doomBar.hidden = !doomed;
    this.timerBox.textContent = this.ctx.settings.showTimer ? formatTime(game.elapsedMs) : '';
    this.undoBtn.disabled = !game.canUndo();
    this.redoBtn.disabled = !game.canRedo();
  }

  /**
   * The score bar: how far this deal has been taken, with the four trophies
   * and the deal's own ceiling marked along the way.
   *
   * The bar is scaled to whichever is furthest out — the deal's target or the
   * Diamond trophy — so every marker it draws is actually on it. A trophy
   * sitting beyond the target is worth seeing: it says this deal cannot pay
   * for that trophy by flushes alone.
   */
  private renderScoreBar(): void {
    const game = this.game;
    const target = game.target().total;
    const tiers = trophyBands(game.target());
    const score = game.score;
    /*
     * The bar runs a fifth past the furthest mark on it. Full-hand bonuses are
     * not in the target, so a good run finishes above it — and a bar that
     * stops dead at the target would show that as "finished" rather than as
     * the overshoot it is. The headroom leaves somewhere for it to go.
     */
    const HEADROOM = 1.2;
    const max = Math.max(Math.round(target * HEADROOM), score, 1);
    const width = (value: number): number => Math.min(100, (value / max) * 100);
    // Marks are drawn on the bar, so one sitting exactly at the far end would
    // be half outside it and clipped away. Hold them just inside.
    const place = (value: number): number => Math.min(99.4, width(value));

    const tier = trophyForTarget(game.target(), score);
    this.scoreBox.textContent = String(score);
    this.scoreFill.className = `scorebar-fill tier-${tier}`;
    this.scoreFill.style.width = `${width(score).toFixed(2)}%`;

    this.scoreMarks.replaceChildren();
    for (let t = 1; t <= 4; t++) {
      const value = tiers[t as 1 | 2 | 3 | 4];
      const won = score >= value;
      const mark = el(
        'span',
        {
          class: `scorebar-mark tier-${t}${won ? ' passed' : ''}`,
          style: `left:${place(value).toFixed(2)}%`,
          title: `${TROPHY_NAMES[t]} at ${value}${won ? ' — earned' : ''}`,
        },
        trophyIcon(),
      );
      this.scoreMarks.append(mark);
    }
    this.scoreMarks.append(
      el('span', {
        class: `scorebar-mark deal-target${score >= target ? ' passed' : ''}`,
        style: `left:${place(target).toFixed(2)}%`,
        title: `A standard deal of this grid is worth ${target}`,
      }),
    );
    // The Superstar is never posted in advance — it only appears once the
    // score has gone past what the grid was calculated to be worth.
    if (tier === SUPERSTAR_TIER) {
      this.scoreMarks.append(
        el(
          'span',
          {
            class: 'scorebar-mark tier-5 passed superstar',
            style: `left:${place(target).toFixed(2)}%`,
            title: `Superstar — past the ${target} this grid was worth`,
          },
          trophyIcon(),
        ),
      );
    }

    /*
     * The score each line costs, written under it. Labels are dropped rather
     * than allowed to collide: on a narrow screen two bands can land close
     * enough that their numbers would overlap, and half a number is worse
     * than none. The one dropped is always the later of the pair, so the
     * cheapest tiers — the ones still being aimed at — keep their labels.
     */
    this.scoreAxis.replaceChildren();
    const MIN_LABEL_GAP = 7;
    let lastLabel = -Infinity;
    for (let t = 1; t <= 4; t++) {
      const value = tiers[t as 1 | 2 | 3 | 4];
      const at = place(value);
      if (at - lastLabel < MIN_LABEL_GAP) continue;
      lastLabel = at;
      this.scoreAxis.append(
        el(
          'span',
          {
            class: `axis-tick tier-${t}${score >= value ? ' passed' : ''}`,
            // Kept off the ends so the first and last are not half cut off.
            style: `left:${Math.min(96, Math.max(4, at)).toFixed(2)}%`,
          },
          String(value),
        ),
      );
    }

    // What to aim at next: the closest trophy still ahead, else the target.
    const ahead: { name: string; value: number }[] = [];
    for (let t = 1; t <= 4; t++) {
      const value = tiers[t as 1 | 2 | 3 | 4];
      if (score < value) ahead.push({ name: TROPHY_NAMES[t], value });
    }
    if (score < target) ahead.push({ name: 'the deal target', value: target });
    ahead.sort((a, b) => a.value - b.value);
    const next = ahead[0];
    this.scoreCaption.textContent =
      tier === SUPERSTAR_TIER
        ? `Superstar · ${score - target} past what this grid was worth`
        : (next === undefined
            ? `${TROPHY_NAMES[tier]} · every mark on this deal passed`
            : `${tier === 0 ? 'Unranked' : TROPHY_NAMES[tier]} · ${next.value - score} to ${next.name}`) +
          ` · deal worth ${target}`;

    const bar = this.scoreTrack.firstElementChild;
    bar?.setAttribute('aria-valuemax', String(max));
    bar?.setAttribute('aria-valuenow', String(score));
    bar?.setAttribute(
      'aria-valuetext',
      `${score} of a possible ${target}. ${next === undefined ? 'All marks passed.' : `${next.value - score} to ${next.name}.`}`,
    );
  }

  handleKey(e: KeyboardEvent): void {
    if (this.isPaused) {
      if (e.key === 'Escape') this.resume();
      return;
    }
    if (e.key === 'Escape') {
      this.game.selected = null;
      this.render();
      return;
    }
    if (e.key === 'z' || e.key === 'u') {
      this.doUndo();
      return;
    }
    if (e.key === 'y') {
      this.doRedo();
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      this.selectDigit(Number(e.key));
      return;
    }
    // The ace answers to its letter as well as to its digit.
    if (e.key === 'a' || e.key === 'A') {
      this.selectDigit(1);
      return;
    }
    if (e.key === 'j' || e.key === '0') {
      this.selectDigit(0);
      return;
    }
    if (e.key === 's') this.ctx.openScoring();
  }

  private isSelected(zone: Zone): boolean {
    const sel = this.game.selected;
    return sel !== null && sel.kind === zone.kind && sel.index === zone.index;
  }

  private toggleSelect(zone: Zone): void {
    this.game.selected = this.isSelected(zone) ? null : zone;
    this.render();
  }

  /** Keyboard route: select the first hand (then free) card with this digit. */
  private selectDigit(digit: number): void {
    const inHand = this.game.hand.findIndex((c) => c.digit === digit);
    if (inHand >= 0) {
      this.toggleSelect({ kind: 'hand', index: inHand });
      return;
    }
    const inFree = this.game.free.findIndex((c) => c !== null && c.digit === digit);
    if (inFree >= 0) this.toggleSelect({ kind: 'free', index: inFree });
  }

  private onCellTap(i: number): void {
    const sel = this.game.selected;
    if (sel === null) return;
    const result = this.game.place(sel, i);
    if (result === null) return;
    this.afterMove(result);
  }

  private onEmptyFree(freeIndex: number): void {
    const sel = this.game.selected;
    if (sel === null || sel.kind !== 'hand') return;
    if (!this.game.stash(sel.index, freeIndex)) return;
    this.afterMove(null);
  }

  /** Restarting keeps any bank tokens spent here, so say so before it happens. */
  private restartPrompt(): string {
    const kept: string[] = [];
    if (this.game.bankedJokers > 0) {
      kept.push(`${this.game.bankedJokers} banked joker${this.game.bankedJokers === 1 ? '' : 's'}`);
    }
    if (this.game.bonusSlots > 0) {
      kept.push(`${this.game.bonusSlots} bonus free slot${this.game.bonusSlots === 1 ? '' : 's'}`);
    }
    const base = 'Restart this deal from the top? Same givens, same deck order.';
    return kept.length === 0 ? base : `${base} You keep the ${kept.join(' and ')} already spent here.`;
  }

  private doRestart(): void {
    this.game.restart();
    this.render();
    this.save();
  }

  private doUndo(): void {
    if (!this.game.undo()) {
      toast('That move cannot be taken back - the card drawn to replace it has been played');
      this.render();
      return;
    }
    this.render();
    this.save();
    if (this.game.lastUndoReturnedReplacement) toast('Undo: replacement card returned to its pile');
  }

  private doRedo(): void {
    if (!this.game.redo()) return;
    this.afterMove(null);
  }

  private showHint(): void {
    const step = this.game.hintStep();
    if (step === null) {
      toast('No named technique is available here - use card positions and safe-move preview to explore.');
      return;
    }
    this.markHint(step);
    openOverlay(
      (close) => {
        const done = el('button', { class: 'btn primary wide' }, 'Got it');
        done.addEventListener('click', close);
        const focus = step.solved
          ? `${cellName(step.solved.cell)} must be ${step.solved.digit}.`
          : `Focus on ${step.cells.slice(0, 4).map(cellName).join(', ')}${step.cells.length > 4 ? '...' : ''}.`;
        return el(
          'div',
          { class: 'panel hint-panel' },
          el('p', { class: 'intro-kicker' }, 'SUDOKU HINT'),
          el('h2', {}, HINT_NAMES[step.technique] ?? step.technique),
          el('p', { class: 'summary' }, focus),
          el('p', {}, HINT_REASONS[step.technique] ?? 'This step narrows the cells that can take the next number.'),
          el('p', { class: 'intro-note' }, 'The highlighted cells show the pattern. This hint does not play a card for you.'),
          done,
        );
      },
      { onClose: () => this.clearHint() },
    );
  }

  private markHint(step: Step): void {
    this.clearHint();
    for (const cell of step.cells) this.cells[cell]?.classList.add('hinted');
    if (step.solved) this.cells[step.solved.cell]?.classList.add('hinted');
  }

  private clearHint(): void {
    for (const cell of this.cells) cell.classList.remove('hinted');
  }

  private drawCards(): void {
    if (this.game.draw() === 0) return;
    this.render();
    this.save();
  }

  private drawJoker(): void {
    if (!this.game.drawJoker()) return;
    this.render();
    this.save();
  }

  private loadBankedJoker(): void {
    const banked = jokerBank();
    if (banked === 0 || !this.game.canDrawBankedJoker()) return;
    confirmDialog(
      `Add one earned joker to this deal's joker pile? ${banked - 1} will remain.`,
      () => {
        if (!spendJokers(1) || !this.game.addBankedJokerToPile()) return;
        this.render();
        this.save();
      },
    );
  }

  private useBonusFreeSlot(): void {
    const banked = freeSlotBank();
    if (banked === 0 || this.game.completed) return;
    confirmDialog(
      `Use one bonus free slot in this deal? ${banked - 1} will remain.`,
      () => {
        if (!spendFreeSlot() || !this.game.addBonusFreeSlot()) return;
        this.render();
        this.save();
      },
    );
  }

  private afterMove(result: PlaceResult | null): void {
    this.render();

    if (result !== null && result.killedGrid && this.ctx.settings.warnDeadGrid) {
      if (jokerBank() > 0 && this.game.canCompleteWithExtraJoker()) {
        this.extraJokerPanel();
        return;
      }
      this.doomPanel();
      return;
    }
    if (result !== null && (result.units.length > 0 || result.riskBonus > 0 || result.questBonus > 0)) {
      const scoreEvents = result.units.map((u) =>
        u.flush
          ? `${unitName(u.unit)} ${u.played}-card flush ${SUIT_GLYPHS[u.suit]} +${u.points}`
          : `${unitName(u.unit)} +${u.points}`,
      );
      scoreEvents.push('CARD +1');
      if (result.riskBonus > 0) scoreEvents.push(`FULL HAND BONUS +${result.riskBonus}`);
      if (result.questBonus > 0) scoreEvents.push(`FLUSH QUEST +${result.questBonus}`);
      scoreEvents.push(`TOTAL +${result.gained}`);
      toast(scoreEvents.join(' · '), result.units.some((u) => u.flush) || result.riskBonus > 0 || result.questBonus > 0);
    }

    if (this.game.completed) {
      this.finish();
      return;
    }
    this.save();
    if (this.game.dead) this.deadPanel();
  }

  private save(): void {
    if (this.finished) return;
    saveGame(this.game.toSave());
  }

  private finish(): void {
    this.finished = true;
    this.undoBtn.disabled = true;
    this.redoBtn.disabled = true;
    const game = this.game;
    const key = formatPuzzleId(game.id);
    const previous = this.ctx.history[key]?.bestScore;
    const firstCompletion = !this.ctx.history[key]?.finished;
    const earned = trophyForTarget(game.target(), game.score);
    markFinished(this.ctx.history, game.id, game.score, Date.now(), {
      elapsedMs: game.elapsedMs,
      flushes: game.flushUnits.size,
      aids: game.bankedJokers + game.bonusSlots,
      trophy: earned,
    });
    saveHistory(this.ctx.history);
    clearSaveFor(game.id);
    const trophy = awardScoreTrophy(game.puzzle.difficulty, earned);
    const reward =
      firstCompletion
        ? earnWinReward({
            level: game.puzzle.difficulty,
            score: game.score,
            flushes: game.flushUnits.size,
            usedAid: game.usedBankedAid,
            riskBonuses: game.riskBonuses,
            questComplete: game.questComplete,
            rescuedWithJoker: game.rescuedWithJoker,
          })
        : null;

    const isBest = previous === undefined || game.score > previous;
    openOverlay(
      (close) => {
        const next = el('button', { class: 'btn primary' }, 'Next deal');
        next.addEventListener('click', () => {
          close();
          this.ctx.playRandom(game.puzzle.difficulty);
        });
        const menu = el('button', { class: 'btn' }, 'Main menu');
        menu.addEventListener('click', () => {
          close();
          this.ctx.goMenu();
        });
        return el(
          'div',
          { class: 'panel won' },
          el('h2', {}, 'Deal complete'),
          el(
            'p',
            { class: 'summary' },
            `Score ${game.score} in ${formatTime(game.elapsedMs)}` +
              (isBest ? ' — a new best for this deal.' : ` · best ${previous}.`),
          ),
          el(
            'p',
            { class: 'summary' },
            game.flushUnits.size === 0
              ? 'No flushes this time.'
              : `${game.flushUnits.size} flush${game.flushUnits.size === 1 ? '' : 'es'} along the way.`,
          ),
          reward === null
            ? ''
            : el(
                'p',
                { class: 'summary' },
                reward.earnedFreeSlot
                  ? `You earned a joker and a bonus free slot · ${reward.jokers} jokers and ${reward.freeSlots} slots now banked.`
                  : `You earned a joker · ${reward.jokers} now banked.`,
              ),
          reward !== null && reward.newAchievements.length > 0
            ? el(
                'p',
                { class: 'summary' },
                `Unlocked: ${reward.newAchievements.map((id) => ACHIEVEMENT_NAMES[id] ?? id).join(' · ')}`,
              )
            : '',
          trophy.newlyEarned
            ? el(
                'p',
                { class: 'summary won-trophy' },
                el('span', { class: `row-trophy tier-${trophy.tier}` }, trophyIcon()),
                `New ${TROPHY_NAMES[trophy.tier]} trophy for ${LEVEL_NAMES[game.puzzle.difficulty]}.`,
              )
            : '',
          el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr; margin-top: 12px' }, next, menu),
        );
      },
      { dismissable: true, overlayClass: 'board-adjacent', anchor: this.board },
    );
  }

  /**
   * The move that just ended the deal. Shown as a panel rather than a toast:
   * from here the grid cannot be finished however well it is played, and the
   * undo that fixes it is only one move deep — but only until the next move
   * buries it.
   */
  private doomPanel(): void {
    this.save();
    openOverlay((close) => {
      const undo = el('button', { class: 'btn primary' }, 'Undo that move');
      undo.addEventListener('click', () => {
        close();
        this.doUndo();
      });
      const on = el('button', { class: 'btn' }, 'Play on');
      on.addEventListener('click', close);
      const restart = el('button', { class: 'btn' }, 'Restart');
      restart.addEventListener('click', () => {
        close();
        this.doRestart();
      });
      return el(
        'div',
        { class: 'panel' },
        el('h2', { class: 'bad' }, 'That move ended the deal'),
        el(
          'p',
          { class: 'summary' },
          'The card was legal, but after it was played no valid completion could use the cards still available. Undo puts it back.',
        ),
        el(
          'div',
          { class: 'actions', style: 'grid-template-columns: 1fr 1fr 1fr; margin-top: 12px' },
          undo,
          on,
          restart,
        ),
      );
    });
  }

  /** The completion solver found that one earned joker repairs this position. */
  private extraJokerPanel(): void {
    const banked = jokerBank();
    openOverlay((close) => {
      const use = el('button', { class: 'btn primary' }, 'Use extra joker');
      use.addEventListener('click', () => {
        if (!spendJokers(1) || !this.game.addBankedJokerToPile()) return;
        close();
        this.render();
        this.save();
      });
      const on = el('button', { class: 'btn' }, 'Play on');
      on.addEventListener('click', close);
      const restart = el('button', { class: 'btn' }, 'Restart');
      restart.addEventListener('click', () => {
        close();
        this.doRestart();
      });
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'An extra joker can save this'),
        el(
          'p',
          { class: 'summary' },
          `The normal joker pile cannot complete this grid, but the solver found a valid continuation with one extra joker. Use one of your ${banked} banked jokers to add it to the joker pile.`,
        ),
        el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr 1fr; margin-top: 12px' }, use, on, restart),
      );
    });
  }

  private deadPanel(): void {
    openOverlay((close) => {
      const undo = el('button', { class: 'btn primary', disabled: !this.game.canUndo() }, 'Undo last move');
      undo.addEventListener('click', () => {
        close();
        this.doUndo();
      });
      const restart = el('button', { class: 'btn' }, 'Restart');
      restart.addEventListener('click', () => {
        close();
        this.doRestart();
      });
      const menu = el('button', { class: 'btn' }, 'Menu');
      menu.addEventListener('click', () => {
        close();
        this.ctx.goMenu();
      });
      return el(
        'div',
        { class: 'panel' },
        el('h2', {}, 'No moves left'),
        el(
          'p',
          { class: 'summary' },
          this.game.completable
            ? 'Nothing in the hand or free cells can be placed, and there is nowhere to stash — the draw order got you. Undo a few moves and route differently.'
            : 'The grid stopped being completable somewhere back there: a legal placement contradicted the only solution. Undo until the warning clears, or restart.',
        ),
        el('div', { class: 'actions', style: 'margin-top: 12px' }, undo, restart, menu),
      );
    });
  }

  private tick(): void {
    const now = performance.now();
    if (!document.hidden && !this.isPaused && !this.game.completed && !this.game.dead) {
      this.game.elapsedMs += now - this.lastTick;
      if (this.ctx.settings.showTimer) this.timerBox.textContent = formatTime(this.game.elapsedMs);
    }
    this.lastTick = now;
  }
}
