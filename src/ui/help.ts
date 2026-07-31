import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

/** The rules, short enough to read mid-deal. */
export function openHelp(): void {
  openOverlay((close) => {
    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'How to play'),
      el(
        'p',
        {},
        'The grid starts with printed givens — a real sudoku with exactly one solution. ',
        'The other cells arrive as cards: each open cell of the solution is a card in the deck, shuffled.',
      ),
      el('h3', {}, 'Placing cards'),
      el(
        'p',
        {},
        'Tap a card, then tap a highlighted cell. A card may go anywhere its digit is legal — no repeat in the row, column or box. ',
        'You are not asked to match the hidden solution, only to stay legal… but stray too far and the deal locks up.',
      ),
      el(
        'p',
        {},
        'Free cells park one card each, like FreeCell. The joker — the jester card — is fully wild: it can be played onto any empty cell and counts as whatever digit and suit the cell needs.',
      ),
      el('h3', {}, 'Scoring'),
      el(
        'ul',
        {},
        el('li', {}, '+1 for every card placed.'),
        el('li', {}, '+10 for completing a row, column or box.'),
        el(
          'li',
          {},
          '+12 per card when a completed unit is a flush — every card you played into it shares one suit (3 cards minimum; jokers count as any suit).',
        ),
      ),
      el(
        'p',
        {},
        'Tap the score in the title bar for the full table, tips on scoring better, and which flushes are still alive on the board.',
      ),
      el('h3', {}, 'Winning and losing'),
      el(
        'p',
        {},
        'Fill the grid and the deal is won. If no card in your hand or free cells can be placed and there is nowhere left to stash, the deal is dead — undo or restart.',
      ),
      el(
        'p',
        {},
        'Every deal is winnable: the deck holds exactly the digits the grid needs. What kills a deal is a legal placement that contradicts the one true solution. ',
        'By default the game flags that moment — the deal number turns red and a warning appears — so you can undo at once. Turn the warning off in Settings to play blind.',
      ),
      el('h3', {}, 'Levels'),
      el(
        'p',
        {},
        'Levels grade the sudoku underneath by the solving techniques it demands, from singles-only up to grids beyond the technique stack. ',
        'Harder levels also deal fewer givens, a smaller hand and fewer free cells.',
      ),
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
