import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

/** The short first-run guide. Detailed rules remain in Help. */
export function openIntro(onDone: () => void): void {
  openOverlay(
    (close) => {
      const finish = (): void => {
        onDone();
        close();
      };
      const later = el('button', { class: 'btn' }, 'Skip for now');
      later.addEventListener('click', finish);
      const start = el('button', { class: 'btn primary' }, 'Choose a level');
      start.addEventListener('click', finish);
      const step = (number: string, title: string, text: string): HTMLElement =>
        el(
          'div',
          { class: 'intro-step' },
          el('span', { class: 'intro-number' }, number),
          el('div', {}, el('b', {}, title), el('small', {}, text)),
        );
      return el(
        'div',
        { class: 'panel intro-panel' },
        el('p', { class: 'intro-kicker' }, 'WELCOME TO SOLDUKU'),
        el('h2', {}, 'Sudoku, dealt like solitaire'),
        el('p', { class: 'summary' }, 'Build a valid sudoku grid using the cards you draw. Every deal has one solution — but you decide how to reach it.'),
        el(
          'div',
          { class: 'intro-steps' },
          step('1', 'Draw a hand', 'Tap the draw pile to fill the open spots in your hand.'),
          step('2', 'Play a card', 'Tap a card, then a highlighted cell. Its number cannot repeat in that row, column or box.'),
          step('3', 'Chase bonuses', 'Complete rows, columns and boxes. Same-suit cards make flushes; jokers and free slots can rescue a tight deal.'),
        ),
        el('p', { class: 'intro-note' }, 'You can reopen this Quick Start from Menu at any time. Help has the full rules.'),
        el('div', { class: 'actions', style: 'grid-template-columns: 1fr 1fr; margin-top: 12px' }, later, start),
      );
    },
    { dismissable: false },
  );
}
