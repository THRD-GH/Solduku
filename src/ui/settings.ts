import { jokerBank, saveSettings } from '../game/storage.ts';
import type { JokerAid, Theme } from '../game/storage.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'night', label: 'Night' },
  { value: 'day', label: 'Day' },
  { value: 'contrast', label: 'Contrast' },
];

const JOKER_AID: { value: JokerAid; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'assist', label: 'Assist' },
  { value: 'generous', label: 'Generous' },
];

export function openSettings(ctx: AppContext): void {
  openOverlay((close) => {
    const rows: HTMLElement[] = [];

    // Theme picker as a row of tabs.
    const tabs = el('div', { class: 'tabs' });
    const drawTabs = (): void => {
      tabs.replaceChildren();
      for (const theme of THEMES) {
        const b = el(
          'button',
          { class: `btn ${ctx.settings.theme === theme.value ? 'on' : ''}`.trim() },
          theme.label,
        );
        b.addEventListener('click', () => {
          ctx.settings.theme = theme.value;
          saveSettings(ctx.settings);
          ctx.applyTheme();
          drawTabs();
        });
        tabs.append(b);
      }
    };
    drawTabs();
    rows.push(
      el(
        'div',
        { class: 'setting stacked' },
        el('span', { class: 'label' }, 'Theme'),
        tabs,
      ),
    );

    const bank = jokerBank();
    const spendTabs = el('div', { class: 'tabs' });
    const spendLabel = el('small', {});
    const drawSpendTabs = (): void => {
      spendTabs.replaceChildren();
      const spend = Math.min(ctx.settings.jokerSpend, bank);
      if (spend !== ctx.settings.jokerSpend) {
        ctx.settings.jokerSpend = spend;
        saveSettings(ctx.settings);
      }
      const less = el('button', { class: 'btn', disabled: spend === 0, 'aria-label': 'Use one fewer joker' }, '−');
      less.addEventListener('click', () => {
        ctx.settings.jokerSpend--;
        saveSettings(ctx.settings);
        drawSpendTabs();
      });
      const count = el('span', { class: 'btn on', 'aria-live': 'polite' }, String(spend));
      const more = el(
        'button',
        { class: 'btn', disabled: spend >= bank, 'aria-label': 'Use one more joker' },
        '+',
      );
      more.addEventListener('click', () => {
        ctx.settings.jokerSpend++;
        saveSettings(ctx.settings);
        drawSpendTabs();
      });
      spendLabel.textContent = `${bank} banked · ${spend} will be spent on the next new deal`;
      spendTabs.append(less, count, more);
    };
    drawSpendTabs();
    rows.push(
      el(
        'div',
        { class: 'setting stacked' },
        el('span', { class: 'label' }, 'Use banked jokers', spendLabel),
        spendTabs,
      ),
    );

    const jokerTabs = el('div', { class: 'tabs' });
    const drawJokerTabs = (): void => {
      jokerTabs.replaceChildren();
      for (const option of JOKER_AID) {
        const b = el(
          'button',
          { class: `btn ${ctx.settings.jokerAid === option.value ? 'on' : ''}`.trim() },
          option.label,
        );
        b.addEventListener('click', () => {
          ctx.settings.jokerAid = option.value;
          saveSettings(ctx.settings);
          drawJokerTabs();
        });
        jokerTabs.append(b);
      }
    };
    drawJokerTabs();
    rows.push(
      el(
        'div',
        { class: 'setting stacked' },
        el(
          'span',
          { class: 'label' },
          'Joker aid',
          el('small', {}, 'New deals only. Assist adds 0–2 jokers; Generous adds 1–3, depending on level.'),
        ),
        jokerTabs,
      ),
    );

    const toggle = (
      label: string,
      hint: string,
      get: () => boolean,
      set: (v: boolean) => void,
    ): HTMLElement => {
      const sw = el('span', { class: `switch ${get() ? 'on' : ''}`.trim() });
      const row = el(
        'div',
        { class: 'setting', role: 'switch', 'aria-checked': get(), tabindex: 0 },
        el('span', { class: 'label' }, label, el('small', {}, hint)),
        sw,
      );
      const flip = (): void => {
        set(!get());
        saveSettings(ctx.settings);
        sw.classList.toggle('on', get());
        row.setAttribute('aria-checked', String(get()));
      };
      row.addEventListener('click', flip);
      row.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          flip();
        }
      });
      return row;
    };

    rows.push(
      toggle(
        'Highlight legal cells',
        'Tint every cell the selected card could go.',
        () => ctx.settings.highlightLegal,
        (v) => {
          ctx.settings.highlightLegal = v;
          ctx.refreshBoard();
        },
      ),
      toggle(
        'Preview safe moves',
        'Green cells still leave a winning route; red cells are legal but end the deal.',
        () => ctx.settings.showSafeMoves,
        (v) => {
          ctx.settings.showSafeMoves = v;
          ctx.refreshBoard();
        },
      ),
      toggle(
        'Warn when the grid dies',
        'Every deal is winnable until a placement makes the sudoku impossible — flag that moment.',
        () => ctx.settings.warnDeadGrid,
        (v) => {
          ctx.settings.warnDeadGrid = v;
          ctx.refreshBoard();
        },
      ),
      toggle(
        'Keep the screen awake',
        'Hold a wake lock while a deal is open.',
        () => ctx.settings.keepAwake,
        (v) => {
          ctx.settings.keepAwake = v;
          ctx.applyWakeLock();
        },
      ),
      toggle(
        'Show the timer',
        'The clock still runs; it is just not shown.',
        () => ctx.settings.showTimer,
        (v) => {
          ctx.settings.showTimer = v;
          ctx.refreshBoard();
        },
      ),
    );

    const done = el('button', { class: 'btn wide' }, 'Close');
    done.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Settings'),
      ...rows,
      el('div', { class: 'panel-footer' }, done),
    );
  });
}
