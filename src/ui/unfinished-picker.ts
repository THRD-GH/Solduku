import { LEVEL_NAMES } from '../core/classic.ts';
import { formatPuzzleId } from '../core/types.ts';
import { allSaves, clearSaveFor, releasePuzzle, saveHistory } from '../game/storage.ts';
import { el, formatTime } from './dom.ts';
import { confirmDialog, openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

/** Choose among every unfinished deal without losing any of their card state. */
export function openUnfinishedPicker(ctx: AppContext): void {
  openOverlay((close) => {
    const saves = allSaves();
    const rows = el('div', { class: 'unfinished-picker' });
    const summary = el('p', { class: 'summary' }, `Choose from ${saves.length} unfinished deals.`);

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
      const remove = el('button', {
        class: 'rowx',
        title: 'Remove this game and reset its board',
        'aria-label': `Remove ${formatPuzzleId(id)} and reset its board`,
      }, '×');
      const row = el('div', { class: 'unfinished-row' }, resume, remove);
      remove.addEventListener('click', () => {
        confirmDialog(
          `Remove ${formatPuzzleId(id)} from unfinished games? Its saved board and current score will be cleared, and the deal can be started fresh.`,
          () => {
            clearSaveFor(id);
            releasePuzzle(ctx.history, id);
            saveHistory(ctx.history);
            row.remove();
            const remaining = allSaves().length;
            if (remaining === 0) {
              close();
              ctx.goMenu();
            } else {
              summary.textContent = `Choose from ${remaining} unfinished deals.`;
            }
          },
          'Remove game',
        );
      });
      rows.append(row);
    }

    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Unfinished games'),
      summary,
      rows,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
