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

    const parts: (HTMLElement | string)[] = [el('h2', {}, 'Scoring')];

    /*
     * What the bar at the top of the board is measuring against. The figure is
     * not a guess: the givens have one solution, so every cell's digit is
     * settled before a card is dealt and the only question is which flushes
     * the suits allow.
     */
    if (game !== null) {
      const target = game.target();
      const flushes = target.flushed
        .map((f) => `${unitName(f.unit)} in ${SUIT_GLYPHS[f.suit]}`)
        .join(', ');
      parts.push(
        el('p', { class: 'summary' }, `This deal is worth ${target.total} played perfectly:`),
        el(
          'ul',
          {},
          el('li', {}, `${target.cards} for the cards — one point each, and every cell takes one.`),
          el('li', {}, `${target.units} for the 27 rows, columns and boxes.`),
          el(
            'li',
            {},
            target.flush === 0
              ? 'No flush is possible with the suits this deal holds.'
              : `${target.flush} for the ${target.flushed.length} flush${target.flushed.length === 1 ? '' : 'es'} the suits allow: ${flushes}.`,
          ),
          target.quest === 0 ? '' : el('li', {}, `${target.quest} for the flush quest.`),
        ),
        el(
          'p',
          { class: 'intro-note' },
          'Full-hand bonuses are not counted here — they depend on when you draw, so a very good run finishes a little above the target.',
        ),
        el('h3', {}, 'The rules'),
      );
    }

    parts.push(
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
    );

    if (game !== null) {
      const prospects = game.flushProspects().slice(0, 6);
      const completed = game.completedFlushes();
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
      if (completed.length > 0) {
        const ledger = el('div', { class: 'prospects' });
        for (const flush of completed) {
          ledger.append(
            el(
              'div',
              { class: 'prospect alive' },
              el('span', { class: 'p-unit' }, unitName(flush.unit)),
              el(
                'span',
                { class: 'p-state' },
                `${flush.played}-card flush ${SUIT_GLYPHS[flush.suit]} · +${flush.points}`,
              ),
            ),
          );
        }
        parts.push(ledger);
      }
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
      }
    }

    return el('div', { class: 'panel' }, ...parts, el('div', { class: 'panel-footer' }, done));
  });
}
