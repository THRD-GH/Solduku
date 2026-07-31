import { CELLS, colOf, rowOf } from '../core/grid.ts';
import { LEVEL_NAMES } from '../core/classic.ts';
import { SUIT_GLYPHS, formatPuzzleId, isJoker, isRedSuit } from '../core/types.ts';
import type { Card } from '../core/types.ts';
import type { Game, PlaceResult, Zone } from '../game/state.ts';
import {
  clearSaveFor,
  earnJoker,
  markFinished,
  saveGame,
  saveHistory,
} from '../game/storage.ts';
import { buildStamp, el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { openMainMenu } from './menu.ts';
import type { AppContext } from './app-context.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A three-pronged jester cap with bells — the joker's face, drawn rather
 *  than shipped as an image so it recolours with the theme. */
function jesterCap(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'jhat');
  svg.setAttribute('aria-hidden', 'true');

  const cap = document.createElementNS(SVG_NS, 'path');
  cap.setAttribute(
    'd',
    'M5 15 C4.5 12 3.5 9 4 7 C6 9 7.5 10 8.7 11.2 C9.5 8 10.5 5 12 3.5 ' +
      'C13.5 5 14.5 8 15.3 11.2 C16.5 10 18 9 20 7 C20.5 9 19.5 12 19 15 Z',
  );
  cap.setAttribute('fill', 'currentColor');

  const band = document.createElementNS(SVG_NS, 'rect');
  band.setAttribute('x', '4.2');
  band.setAttribute('y', '15.6');
  band.setAttribute('width', '15.6');
  band.setAttribute('height', '3.2');
  band.setAttribute('rx', '1.6');
  band.setAttribute('fill', 'currentColor');

  svg.append(cap, band);
  for (const [cx, cy] of [
    [4, 6.2],
    [12, 3],
    [20, 6.2],
  ] as const) {
    const bell = document.createElementNS(SVG_NS, 'circle');
    bell.setAttribute('cx', String(cx));
    bell.setAttribute('cy', String(cy));
    bell.setAttribute('r', '1.7');
    bell.setAttribute('fill', 'currentColor');
    svg.append(bell);
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
  return [
    el('span', { class: 'd' }, String(card.digit)),
    el('span', { class: 'st' }, SUIT_GLYPHS[card.suit]),
  ];
}

function suitClass(card: Card): string {
  if (isJoker(card)) return 'joker';
  return isRedSuit(card.suit) ? 'red' : 'black';
}

const unitName = (unit: number): string => (unit < 9 ? 'Row' : unit < 18 ? 'Column' : 'Box');

export class PlayScreen {
  readonly root: HTMLElement;
  isPaused = false;

  private readonly ctx: AppContext;
  readonly game: Game;
  private cells: HTMLElement[] = [];
  private idBox!: HTMLElement;
  private doomBar!: HTMLElement;
  private handRow: HTMLElement;
  private freeRow: HTMLElement;
  private deckCount: HTMLElement;
  private scoreBox: HTMLElement;
  private timerBox: HTMLElement;
  private undoBtn: HTMLButtonElement;
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

    const board = el('div', { class: 'board sol', role: 'grid', 'aria-label': 'Solduku board' });
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
      board.append(row);
    }
    bindTap(
      board,
      { onTap: (i) => this.onCellTap(i), forgiveDrift: true },
      (e) => {
        const cell = (e.target as HTMLElement).closest<HTMLElement>('.cell');
        return cell ? Number(cell.dataset.index) : -1;
      },
    );

    this.handRow = el('div', { class: 'cardrow hand' });
    this.deckCount = el('span', { class: 'count' }, String(game.deckLeft));
    this.freeRow = el('div', { class: 'cardrow free' });

    const tray = el(
      'div',
      { class: 'tray' },
      el(
        'div',
        { class: 'tray-row' },
        el('span', { class: 'tray-label' }, 'Hand'),
        this.handRow,
        el('div', { class: 'deckpile', title: 'Cards left in the deck' }, this.deckCount, el('small', {}, 'deck')),
      ),
      el(
        'div',
        { class: 'tray-row' },
        el('span', { class: 'tray-label' }, 'Free'),
        this.freeRow,
      ),
    );

    this.undoBtn = el('button', { class: 'btn' }, 'Undo');
    this.undoBtn.addEventListener('click', () => this.doUndo());
    const restart = el('button', { class: 'btn' }, 'Restart');
    restart.addEventListener('click', () =>
      confirmDialog('Restart this deal from the top? Same givens, same deck order.', () => {
        this.game.restart();
        this.render();
        this.save();
      }),
    );
    const help = el('button', { class: 'btn' }, 'Help');
    help.addEventListener('click', () => ctx.openHelp());

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
      board,
      tray,
      el('div', { class: 'actions' }, this.undoBtn, restart, help),
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

  pause(): void {
    // Nothing modal to show — just make sure the position is on disk.
    this.save();
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
    if (game.hand.length === 0) {
      this.handRow.append(el('span', { class: 'tray-empty' }, 'empty'));
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
    this.scoreBox.textContent = String(game.score);
    // The doomed marker follows the setting, so purists can play blind.
    const doomed = !game.completable && this.ctx.settings.warnDeadGrid;
    this.idBox.classList.toggle('doomed', doomed);
    this.idBox.title = doomed ? 'The grid can no longer be completed' : '';
    this.doomBar.hidden = !doomed;
    this.timerBox.textContent = this.ctx.settings.showTimer ? formatTime(game.elapsedMs) : '';
    this.undoBtn.disabled = !game.canUndo();
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

  private doUndo(): void {
    if (!this.game.undo()) return;
    this.render();
    this.save();
  }

  private afterMove(result: PlaceResult | null): void {
    this.render();

    if (result !== null && result.killedGrid && this.ctx.settings.warnDeadGrid) {
      this.doomPanel();
      return;
    }
    if (result !== null && result.units.length > 0) {
      toast(
        result.units
          .map((u) =>
            u.flush
              ? `${unitName(u.unit)} flush ${SUIT_GLYPHS[u.suit]} +${u.points}`
              : `${unitName(u.unit)} +${u.points}`,
          )
          .join(' · '),
      );
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
    const game = this.game;
    const key = formatPuzzleId(game.id);
    const previous = this.ctx.history[key]?.bestScore;
    const firstCompletion = !this.ctx.history[key]?.finished;
    markFinished(this.ctx.history, game.id, game.score, Date.now());
    saveHistory(this.ctx.history);
    clearSaveFor(game.id);
    const bank = firstCompletion ? earnJoker() : null;

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
          bank === null
            ? ''
            : el('p', { class: 'summary' }, `You earned a joker · ${bank} now banked.`),
          el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr; margin-top: 12px' }, next, menu),
        );
      },
      { dismissable: false },
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
        this.game.restart();
        this.render();
        this.save();
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
        this.game.restart();
        this.render();
        this.save();
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
    if (!document.hidden && !this.game.completed && !this.game.dead) {
      this.game.elapsedMs += now - this.lastTick;
      if (this.ctx.settings.showTimer) this.timerBox.textContent = formatTime(this.game.elapsedMs);
    }
    this.lastTick = now;
  }
}
