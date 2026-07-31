import { SUIT_GLYPHS } from '../core/types.ts';
import { POINTS } from '../game/state.ts';
import type { Game } from '../game/state.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';

const unitName = (unit: number): string =>
  unit < 9 ? `Row ${unit + 1}` : unit < 18 ? `Column ${unit - 8}` : `Box ${unit - 17}`;

/**
 * The scoring table, how to score better, and — mid-deal — where the flush
 * money still is on this board.
 */
export function openScoring(game: Game | null): void {
  openOverlay((close) => {
    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);

    const parts: (HTMLElement | string)[] = [
      el('h2', {}, 'Scoring'),
      el(
        'ul',
        {},
        el('li', {}, `+${POINTS.place} for every card placed.`),
        el('li', {}, `+${POINTS.unit} for completing a row, column or box.`),
        el(
          'li',
          {},
          `+${POINTS.flushPerCard} per card when a completed unit is a flush — every card you played into it shares one suit (3 cards minimum; jokers and the cards under them count as any suit).`,
        ),
      ),
      el('h3', {}, 'How to score better'),
      el(
        'ul',
        {},
        el(
          'li',
          {},
          'Pick a flush target early. A box with few givens is the best canvas: more open cells means more cards, and the payout is per card.',
        ),
        el(
          'li',
          {},
          'Funnel one suit toward that unit and dump its digits elsewhere when they arrive in the wrong suit — a single off-suit card kills the flush for good.',
        ),
        el(
          'li',
          {},
          'Free cells are flush insurance: stash the right digit in the wrong suit rather than poison the target unit.',
        ),
        el(
          'li',
          {},
          'Spend the joker where it pays twice: as the last card of a flush it keeps the bonus alive and rescues a digit the deck no longer holds.',
        ),
        el(
          'li',
          {},
          'Units overlap — a cell sits in a row, a column and a box. Finishing one card can land three completion bonuses at once, so watch for cells that close more than one unit.',
        ),
        el(
          'li',
          {},
          'The placement points take care of themselves; the game is won and lost on which units complete pure. Two live flushes beat five dead certainties.',
        ),
      ),
    ];

    if (game !== null) {
      const prospects = game.flushProspects().slice(0, 6);
      parts.push(
        el(
          'p',
          { class: 'summary' },
          game.questComplete
            ? `Flush quest complete: ${SUIT_GLYPHS[game.questSuit]} +25 banked.`
            : `Flush quest: complete any ${SUIT_GLYPHS[game.questSuit]} flush for +25.`,
        ),
      );
      parts.push(el('h3', {}, 'On this board'));
      if (prospects.length === 0) {
        parts.push(el('p', { class: 'summary' }, 'No cards played into open units yet.'));
      } else {
        const list = el('div', { class: 'prospects' });
        for (const p of prospects) {
          const suit = p.suit === -1 ? 'jokers' : SUIT_GLYPHS[p.suit];
          list.append(
            el(
              'div',
              { class: `prospect ${p.alive ? 'alive' : 'lost'}` },
              el('span', { class: 'p-unit' }, unitName(p.unit)),
              el(
                'span',
                { class: 'p-state' },
                p.alive
                  ? `${p.played} down in ${suit} · ${p.open} to go · worth +${p.potential}`
                  : `flush lost · completion still +${POINTS.unit}`,
              ),
            ),
          );
        }
        parts.push(list);
        if (game.flushUnits.size > 0) {
          parts.push(
            el(
              'p',
              { class: 'summary' },
              `Banked so far: ${game.flushUnits.size} flush${game.flushUnits.size === 1 ? '' : 'es'}.`,
            ),
          );
        }
      }
    }

    return el('div', { class: 'panel' }, ...parts, el('div', { class: 'panel-footer' }, done));
  });
}
