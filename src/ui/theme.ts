import { PALETTES, saveSettings } from '../game/storage.ts';
import type { Palette, Theme } from '../game/storage.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

const LIGHT: { value: Theme; label: string; note: string }[] = [
  { value: 'day', label: 'Day', note: 'Daylight over the table' },
  { value: 'night', label: 'Night', note: 'Under a low lamp' },
  { value: 'contrast', label: 'Contrast', note: 'Built for legibility, not looks' },
];

/**
 * How the game looks: which table it is played on, and what light is on it.
 *
 * The two are separate choices rather than one list of nine, because every
 * table has both a daylight and a lamplight and nobody should have to give up
 * the one they prefer to try a different cloth. Contrast is the exception —
 * it is tuned for legibility and ignores the table entirely, which the panel
 * says outright rather than leaving the table row looking broken.
 */
export function openTheme(ctx: AppContext): void {
  openOverlay((close) => {
    const tableRows = el('div', { class: 'theme-tables' });
    const lightTabs = el('div', { class: 'tabs' });
    const note = el('p', { class: 'summary theme-note' });

    const draw = (): void => {
      const contrast = ctx.settings.theme === 'contrast';

      tableRows.replaceChildren();
      for (const palette of PALETTES) {
        const chosen = ctx.settings.palette === palette.value;
        const row = el(
          'button',
          {
            class: `theme-table ${chosen ? 'on' : ''}`.trim(),
            'aria-pressed': chosen,
            disabled: contrast,
          },
          el('span', { class: `table-chip ${palette.value}` }),
          el('span', { class: 'theme-table-text' }, el('b', {}, palette.label), el('small', {}, palette.note)),
        );
        row.addEventListener('click', () => {
          ctx.settings.palette = palette.value as Palette;
          saveSettings(ctx.settings);
          ctx.applyTheme();
          draw();
        });
        tableRows.append(row);
      }

      lightTabs.replaceChildren();
      for (const light of LIGHT) {
        const b = el(
          'button',
          {
            class: `btn ${ctx.settings.theme === light.value ? 'on' : ''}`.trim(),
            title: light.note,
          },
          light.label,
        );
        b.addEventListener('click', () => {
          ctx.settings.theme = light.value;
          saveSettings(ctx.settings);
          ctx.applyTheme();
          draw();
        });
        lightTabs.append(b);
      }

      note.textContent = contrast
        ? 'Contrast sets its own colours for legibility, so the table has no say while it is on.'
        : (LIGHT.find((l) => l.value === ctx.settings.theme)?.note ?? '');
    };
    draw();

    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Theme'),
      el('h3', {}, 'Light'),
      lightTabs,
      note,
      el('h3', {}, 'Table'),
      tableRows,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
