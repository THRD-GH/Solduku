import { CELLS, colOf, rowOf } from '../core/grid.ts';
import { LEVEL_NAMES } from '../core/classic.ts';
import { SUIT_GLYPHS, formatPuzzleId, isJoker, isRedSuit } from '../core/types.ts';
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
import { buildStamp, el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { openMainMenu } from './menu.ts';
import type { AppContext } from './app-context.ts';
import type { Step } from '../core/techniques.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A three-pronged jester cap with bells — the joker's face, drawn rather
 *  than shipped as an image so it recolours with the theme. */
function jesterCap(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'jhat');
  svg.setAttribute('aria-hidden', 'true');

  const add = (tag: string, attrs: Record<string, string>): SVGElement => {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
    return part;
  };

  add('path', {
    d: 'M4 13.7 C3.8 10.4 3.3 7.8 4.5 5.7 C6.4 7.7 8.2 9.2 9.8 10.5 C10.2 7.1 11.2 4.3 12 2.8 C12.8 4.3 13.8 7.1 14.2 10.5 C15.8 9.2 17.6 7.7 19.5 5.7 C20.7 7.8 20.2 10.4 20 13.7 Z',
    fill: 'currentColor',
  });
  add('path', { d: 'M5.5 14.2 H18.5 L16.6 17.1 L14.6 15.8 L12 18.1 L9.4 15.8 L7.4 17.1 Z', fill: 'currentColor' });
  add('ellipse', { cx: '12', cy: '15.2', rx: '4.5', ry: '5.1', fill: 'var(--card-bg)', stroke: 'currentColor', 'stroke-width': '1.25' });
  add('circle', { cx: '10.35', cy: '14.5', r: '0.7', fill: 'currentColor' });
  add('circle', { cx: '13.65', cy: '14.5', r: '0.7', fill: 'currentColor' });
  add('path', { d: 'M10 17 C11.15 18 12.85 18 14 17', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.05', 'stroke-linecap': 'round' });
  add('path', { d: 'M10.5 20.2 L12 18.1 L13.5 20.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.35', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const [cx, cy] of [
    [4.4, 5.6],
    [12, 2.8],
    [19.6, 5.6],
  ] as const) {
    add('circle', { cx: String(cx), cy: String(cy), r: '1.55', fill: 'currentColor' });
    add('circle', { cx: String(cx), cy: String(cy), r: '0.42', fill: 'var(--card-bg)' });
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
    return [jesterCap(), el('span', { class: 'st' }, role === 0 ? 'JOKER' : String(role))];
  }
  const rank = String(card.digit);
  const suit = SUIT_GLYPHS[card.suit];
  return [
    el('span', { class: 'corner tl' }, rank, el('small', {}, suit)),
    el('span', { class: 'card-rank' }, rank),
    el('span', { class: 'card-suit' }, suit),
    el('span', { class: 'corner br' }, rank, el('small', {}, suit)),
  ];
}

function suitClass(card: Card): string {
  if (isJoker(card)) return 'joker';
  return `suit-${card.suit} ${isRedSuit(card.suit) ? 'red' : 'black'}`;
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
  'hidden single': 'Hidden single',
  'locked candidates': 'Locked candidates',
  'naked subset': 'Naked pair or triple',
  'hidden subset': 'Hidden pair or triple',
  'x-wing': 'X-wing',
};

const HINT_REASONS: Record<string, string> = {
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
  private timerBox: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private tickId: number;
  private lastTick = performance.now();
  private finished = false;

  constructor(ctx: AppContext, game: Game) {
    this.ctx = ctx;
    this.game = game;

    const menuBtn = el('button', { class: 'iconbtn', 'aria-label': 'Menu' });
    menuBtn.append(el('i'), el('i'), el('i'));
    menuBtn.addEventListener('click', () => openMainMenu(ctx));

    this.scoreBox = el('button', {
      class: 'scorebox',
      title: 'Scoring and flush prospects',
      'aria-label': 'Scoring and flush prospects',
    });
    this.scoreBox.textContent = '0';
    this.scoreBox.addEventListener('click', () => ctx.openScoring());
    this.timerBox = el('span', { class: 'timerbox' }, '00:00');
    this.idBox = el('span', { class: 'id' }, formatPuzzleId(game.id));
    const titlebar = el(
      'div',
      { class: 'titlebar' },
      menuBtn,
      this.idBox,
      el('span', { class: 'lvl' }, LEVEL_NAMES[game.puzzle.difficulty]),
      this.scoreBox,
      this.timerBox,
    );

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
      el(
        'div',
        { class: 'tray-row' },
        el('span', { class: 'tray-label' }, 'Hand'),
        this.handRow,
        this.deckPile,
        this.jokerPile,
        this.bankPile,
      ),
      el(
        'div',
        { class: 'tray-row' },
        el('span', { class: 'tray-label' }, 'Free'),
        this.freeRow,
        this.freeSlotPile,
      ),
    );

    this.undoBtn = el('button', { class: 'btn' }, 'Undo');
    this.undoBtn.addEventListener('click', () => this.doUndo());
    this.redoBtn = el('button', { class: 'btn' }, 'Redo');
    this.redoBtn.addEventListener('click', () => this.doRedo());
    const hint = el('button', { class: 'btn aid' }, 'Hint');
    hint.addEventListener('click', () => this.showHint());
    const pause = el('button', { class: 'btn' }, 'Pause');
    pause.addEventListener('click', () => this.pause());
    const restart = el('button', { class: 'btn' }, 'Restart');
    restart.addEventListener('click', () => confirmDialog(this.restartPrompt(), () => this.doRestart()));
    const help = el('button', { class: 'btn' }, 'Help');
    help.addEventListener('click', () => ctx.openHelp());
    const home = el('button', { class: 'btn' }, 'Home');
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
      el('p', { class: 'build-stamp top' }, buildStamp()),
      titlebar,
      this.doomBar,
      this.board,
      tray,
      el('div', { class: 'actions game-actions' }, this.undoBtn, this.redoBtn, hint, pause, restart, help, home),
    );

    this.tickId = window.setInterval(() => this.tick(), 1000);
    this.render();
    // A resumed deal may already be finished or stuck.
    if (this.game.dead) this.deadPanel();
  }

  destroy(): void {
    window.clearInterval(this.tickId);
    if (!this.finished) this.save();
  }

  private saveWhenHidden(): void {
    // Nothing modal to show — just make sure the position is on disk.
    this.save();
  }

  pause(): void {
    if (this.isPaused || this.game.completed) {
      this.saveWhenHidden();
      return;
    }
    this.isPaused = true;
    this.saveWhenHidden();
    this.ctx.applyWakeLock();
    openOverlay(
      (close) => {
        const resume = el('button', { class: 'btn primary wide' }, 'Continue');
        resume.addEventListener('click', close);
        return el(
          'div',
          { class: 'panel won' },
          el('h2', {}, 'Game paused'),
          el('p', { class: 'summary' }, 'Your deal is safely saved. Take your time - the clock is stopped.'),
          resume,
        );
      },
      {
        dismissable: false,
        onClose: () => {
          this.isPaused = false;
          this.lastTick = performance.now();
          this.ctx.applyWakeLock();
        },
      },
    );
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
    this.scoreBox.textContent = String(game.score);
    // The doomed marker follows the setting, so purists can play blind.
    const doomed = !game.completable && this.ctx.settings.warnDeadGrid;
    this.idBox.classList.toggle('doomed', doomed);
    this.idBox.title = doomed ? 'The grid can no longer be completed' : '';
    this.doomBar.hidden = !doomed;
    this.timerBox.textContent = this.ctx.settings.showTimer ? formatTime(game.elapsedMs) : '';
    this.undoBtn.disabled = !game.canUndo();
    this.redoBtn.disabled = !game.canRedo();
  }

  handleKey(e: KeyboardEvent): void {
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
    markFinished(this.ctx.history, game.id, game.score, Date.now(), {
      elapsedMs: game.elapsedMs,
      flushes: game.flushUnits.size,
      aids: game.usedBankedAid ? 1 : 0,
    });
    saveHistory(this.ctx.history);
    clearSaveFor(game.id);
    const trophy = awardScoreTrophy(game.puzzle.difficulty, game.score);
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
            ? el('p', { class: 'summary' }, `🏆 New ${TROPHY_NAMES[trophy.tier]} Trophy for ${LEVEL_NAMES[game.puzzle.difficulty]}.`)
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
