import { LEVEL_CONFIG, LEVELS, LEVEL_LOGIC, LEVEL_NAMES } from '../core/classic.ts';
import type { Level } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import { POOL_SIZE, allSaves, freeSlotBank, jokerBank, levelHighScores, levelStats, levelTrophy, progression, trophyForRecord, TROPHY_NAMES, unplayedNumbers } from '../game/storage.ts';
import { buildStamp, el } from './dom.ts';
import { clear } from './dom.ts';
import { openOverlay, toast } from './overlay.ts';
import { bindTap } from './pointer.ts';
import { stars } from './stars.ts';
import type { AppContext } from './app-context.ts';
import { openUnfinishedPicker } from './unfinished-picker.ts';

/**
 * Choose Level. A tap deals a random unplayed number from that level; the #
 * button picks a number outright. Numbers are deterministic, so 3-10 is the
 * same deal — givens and deck order — on every device.
 */
export function buildMenu(ctx: AppContext): HTMLElement {
  const screen = el('div', { class: 'screen menu-screen' });

  const menuBtn = el('button', { class: 'iconbtn', 'aria-label': 'Menu' });
  menuBtn.append(el('i'), el('i'), el('i'));
  menuBtn.addEventListener('click', () => openMainMenu(ctx));

  screen.append(
    el('p', { class: 'build-stamp top' }, buildStamp()),
    el('div', { class: 'titlebar' }, menuBtn, el('span', { class: 'id' }, 'SOLDUKU')),
    el(
      'div',
      { class: 'hero' },
      el('h1', {}, 'Choose ', el('span', {}, 'Level')),
      el('p', {}, 'Tap a level to deal · # to choose a deal number'),
    ),
  );

  const progress = progression();
  const totalScore = Object.values(ctx.history).reduce((total, record) => total + (record.bestScore ?? 0), 0);
  screen.append(
    el(
      'div',
      { class: 'home-tally' },
      el('div', {}, el('b', {}, String(totalScore)), el('small', {}, 'total score')),
      el('div', {}, el('b', {}, String(progress.successfulGames)), el('small', {}, 'first wins')),
      el('div', {}, el('b', {}, `${jokerBank()} / ${progress.successfulGames}`), el('small', {}, 'jokers banked / earned')),
      el('div', {}, el('b', {}, `${freeSlotBank()} / ${progress.earnedFreeSlots}`), el('small', {}, 'slots banked / earned')),
    ),
  );

  screen.append(buildHomeHighScores(ctx));

  const resumeBtn = el('button', { class: 'btn primary wide' });
  const resumeActions = el('div', { class: 'actions' }, resumeBtn);
  const refreshResume = (): void => {
    const saves = allSaves();
    resumeActions.hidden = saves.length === 0;
    resumeBtn.textContent =
      saves.length === 1 ? `Resume ${formatPuzzleId(saves[0].id)}` : `${saves.length} unfinished games`;
  };
  resumeBtn.addEventListener('click', () => {
    const saves = allSaves();
    if (saves.length === 1) ctx.playPuzzle(saves[0].id);
    else if (saves.length > 1) openUnfinishedPicker(ctx);
  });
  refreshResume();
  screen.append(resumeActions);

  const list = el('div', { class: 'levels' });
  for (const level of LEVELS) {
    // The stored mastery only rises, but a fresh device with imported history
    // has none — so take whichever of the two is better informed.
    list.append(buildLevelRow(ctx, level, Math.max(progress.mastery[level] ?? 0, levelTrophy(ctx.history, level))));
  }
  screen.append(list);

  screen.append(
    el(
      'p',
      { class: 'hint-line' },
      'Sudoku rules place the cards; solitaire luck deals them. Levels grade the logic the grid demands.',
    ),
  );
  return screen;
}

/** A concise personal-best board keeps high scores visible before a new deal. */
function buildHomeHighScores(ctx: AppContext): HTMLElement {
  const grid = el('div', { class: 'home-score-grid' });
  let hasScore = false;
  for (const level of LEVELS) {
    const entry = levelHighScores(ctx.history, level, 1)[0];
    if (!entry) continue;
    hasScore = true;
    const trophy = trophyForRecord(level, ctx.history[formatPuzzleId(entry.id)]);
    const replay = el(
      'button',
      { class: 'home-score', 'aria-label': `Replay your best ${LEVEL_NAMES[level]} deal, ${formatPuzzleId(entry.id)}, score ${entry.score}` },
      el('span', { class: 'home-score-level' }, LEVEL_NAMES[level]),
      el('b', {}, String(entry.score)),
      el('small', {}, `${formatPuzzleId(entry.id)} - ${TROPHY_NAMES[trophy]}`),
    );
    replay.addEventListener('click', () => ctx.playPuzzle(entry.id));
    grid.append(replay);
  }

  const allScores = el('button', { class: 'text-btn' }, 'All scores');
  allScores.addEventListener('click', () => ctx.openProgress());
  return el(
    'section',
    { class: 'home-highscores' },
    el('div', { class: 'home-section-head' }, el('h2', {}, 'Your best deals'), allScores),
    hasScore ? grid : el('p', { class: 'home-score-empty' }, 'Win a deal to put your first high score here.'),
    hasScore ? el('small', { class: 'home-score-note' }, 'Tap a score to replay that deal.') : null,
  );
}

function buildLevelRow(ctx: AppContext, level: Level, trophyTier: number): HTMLElement {
  const left = unplayedNumbers(ctx.history, level).length;
  const stat = levelStats(ctx.history, level);

  const button = el(
    'button',
    { class: 'source', disabled: left === 0 },
    el('span', { class: 'source-name' }, 'Deal'),
    el(
      'span',
      { class: 'source-meta' },
      `${left} left · ${LEVEL_LOGIC[level]}` +
        (stat.bestScore === null ? '' : ` · best ${stat.bestScore}`),
    ),
  );
  if (left > 0) {
    bindTap(button, {
      onTap: () => ctx.playRandom(level),
      onLong: () => openPicker(ctx, level),
    });
  }

  const pick = el('button', {
    class: 'pick',
    title: 'Choose a deal number',
    'aria-label': `Choose a deal number for level ${level}`,
  });
  pick.textContent = '#';
  pick.addEventListener('click', () => openPicker(ctx, level));

  const trophies = el('div', {
    class: 'trophy-strip',
    role: 'img',
    'aria-label': `${TROPHY_NAMES[trophyTier]} trophy progress: ${trophyTier} of 4 earned`,
  });
  for (let tier = 1; tier <= 4; tier++) {
    trophies.append(
      el(
        'span',
        {
          class: `trophy ${tier <= trophyTier ? 'earned' : ''}`.trim(),
          title: `${TROPHY_NAMES[tier]} trophy${tier <= trophyTier ? ' earned' : ' not yet earned'}`,
          'aria-hidden': 'true',
        },
        '🏆',
      ),
    );
  }

  const levelHead = el(
    'button',
    { class: 'level-head level-info', title: `About ${LEVEL_NAMES[level]} difficulty` },
    stars(level, 10),
    el('span', { class: 'name' }, LEVEL_NAMES[level]),
    trophies,
  );
  levelHead.addEventListener('click', () => openLevelInfo(level));

  return el(
    'div',
    { class: 'level sol' },
    levelHead,
    el('div', { class: 'source-row' }, button, pick),
  );
}

const LEVEL_GUIDE: Record<Level, string> = {
  1: 'Every next step can be found with basic singles: a number has one remaining legal home.',
  2: 'Locked candidates appear: a number trapped in one box line can be ruled out from the rest of that row or column.',
  3: 'Look for small candidate groups and occasional x-wings. The grid rewards a little more scanning before you commit.',
  4: 'Logic gets you close, then one carefully checked branch may be needed to break the last uncertainty.',
  5: 'Expect two layers of branching beyond standard logic. Card storage becomes as important as the sudoku deductions.',
  6: 'The deepest puzzles need sustained trial and error. Keep options open, use your storage deliberately, and plan ahead.',
};

/** Tap a level title to understand both its sudoku and solitaire difficulty. */
function openLevelInfo(level: Level): void {
  const cfg = LEVEL_CONFIG[level];
  openOverlay((close) => {
    const done = el('button', { class: 'btn wide' }, 'Got it');
    done.addEventListener('click', close);
    const stat = (value: number, label: string): HTMLElement =>
      el('div', { class: 'level-stat' }, el('b', {}, String(value)), el('small', {}, label));
    return el(
      'div',
      { class: 'panel level-guide' },
      el('p', { class: 'intro-kicker' }, `LEVEL ${level}`),
      el('h2', {}, LEVEL_NAMES[level]),
      el('p', { class: 'summary' }, `Sudoku focus: ${LEVEL_LOGIC[level]}.`),
      el('h3', {}, 'What changes'),
      el('p', {}, LEVEL_GUIDE[level]),
      el('h3', {}, 'Card pressure'),
      el('p', {}, 'Harder levels reveal fewer givens and give you less room to hold cards.'),
      el(
        'div',
        { class: 'level-stats' },
        stat(cfg.hand, 'hand cards'),
        stat(cfg.free, 'free slots'),
        stat(cfg.jokers, 'level jokers'),
      ),
      el('div', { class: 'panel-footer' }, done),
    );
  });
}

/** Deal numbers per range tab, so the list is not a wall of buttons. */
const RANGE_SIZE = 100;

export function openPicker(ctx: AppContext, level: Level): void {
  const available = new Set(unplayedNumbers(ctx.history, level));

  openOverlay((close) => {
    const play = (n: number): void => {
      close();
      ctx.playPuzzle({ level, number: n });
    };

    const ranges: { from: number; to: number; free: number }[] = [];
    for (let from = 1; from <= POOL_SIZE; from += RANGE_SIZE) {
      const to = Math.min(from + RANGE_SIZE - 1, POOL_SIZE);
      let free = 0;
      for (let n = from; n <= to; n++) if (available.has(n)) free++;
      ranges.push({ from, to, free });
    }
    let current = Math.max(
      0,
      ranges.findIndex((r) => r.free > 0),
    );

    const tabs = el('div', { class: 'picker-ranges' });
    const grid = el('div', { class: 'picker' });
    const summary = el('p', { class: 'summary' });

    const draw = (): void => {
      clear(tabs);
      for (const [i, range] of ranges.entries()) {
        const tab = el(
          'button',
          { class: `btn ${i === current ? 'on' : ''}`.trim(), disabled: range.free === 0 },
          `${range.from}–${range.to}`,
        );
        tab.addEventListener('click', () => {
          current = i;
          draw();
        });
        tabs.append(tab);
      }

      const range = ranges[current];
      clear(grid);
      let shown = 0;
      for (let n = range.from; n <= range.to; n++) {
        if (!available.has(n)) continue;
        shown++;
        const b = el('button', { class: 'btn' }, formatPuzzleId({ level, number: n }));
        b.addEventListener('click', () => play(n));
        grid.append(b);
      }
      if (shown === 0) {
        grid.append(el('p', { class: 'summary' }, 'Nothing left here — try another range.'));
      }

      summary.textContent =
        available.size === 0
          ? 'Every deal here has been played.'
          : `${available.size} of ${POOL_SIZE} available · showing ${range.from}–${range.to}`;
    };

    const jump = el('input', {
      type: 'number',
      min: 1,
      max: POOL_SIZE,
      inputmode: 'numeric',
      placeholder: 'no.',
      'aria-label': 'Go to deal number',
    });
    const go = el('button', { class: 'btn' }, 'Go');
    const goTo = (): void => {
      const n = Number(jump.value);
      if (!Number.isInteger(n) || n < 1 || n > POOL_SIZE) {
        toast(`Pick a number between 1 and ${POOL_SIZE}`);
        return;
      }
      play(n);
    };
    go.addEventListener('click', goTo);
    jump.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goTo();
    });

    const cancel = el('button', { class: 'btn wide' }, 'Cancel');
    cancel.addEventListener('click', close);

    draw();
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, `Level ${level} — ${LEVEL_NAMES[level]}`),
      el('div', { class: 'picker-jump' }, el('label', {}, 'Go to'), jump, go),
      tabs,
      summary,
      grid,
      el('div', { class: 'panel-footer' }, cancel),
    );
  });
}

export function openMainMenu(ctx: AppContext): void {
  openOverlay((close) => {
    const item = (label: string, run: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'btn' }, label);
      b.addEventListener('click', () => {
        close();
        run();
      });
      return b;
    };
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Menu'),
      el(
        'div',
        { class: 'menu-list' },
        item('Settings', () => ctx.openSettings()),
        item('Quick start', () => ctx.openIntro()),
        item('Progress', () => ctx.openProgress()),
        item('Scoring', () => ctx.openScoring()),
        item('Help', () => ctx.openHelp()),
        item('About', () => toast('Solduku — solitaire meets sudoku')),
      ),
    );
  });
}
