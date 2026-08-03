import { LEVEL_NAMES } from '../core/classic.ts';
import { formatPuzzleId } from '../core/types.ts';
import { allSaves } from '../game/storage.ts';
import { el, formatTime } from './dom.ts';
import { openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

/** Choose among every unfinished deal without losing any of their card state. */
export function openUnfinishedPicker(ctx: AppContext): void {
  openOverlay((close) => {
    const saves = allSaves();
    const rows = el('div', { class: 'unfinished-picker' });

    for (const saved of saves) {
      const id = saved.id;
      const resume = el(
        'button',
        { class: 'statrow open', 'aria-label': `Resume ${formatPuzzleId(id)}` },
        el('span', {}, formatPuzzleId(id)),
        el('span', { class: 'when' }, LEVEL_NAMES[id.level]),
        el('span', { class: 'when' }, `Score ${saved.score}`),
        el('span', { class: 'when' }, formatTime(saved.elapsedMs)),
        el('span', { class: 'resume-label' }, 'Resume'),
      );
      resume.addEventListener('click', () => {
        close();
        ctx.playPuzzle(id);
      });
      rows.append(el('div', { class: 'unfinished-row' }, resume));
    }

    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Unfinished games'),
      el('p', { class: 'summary' }, `Choose from ${saves.length} unfinished deals.`),
      rows,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
