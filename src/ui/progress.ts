import { LEVELS, LEVEL_NAMES } from '../core/classic.ts';
import { formatPuzzleId } from '../core/types.ts';
import type { Level, PuzzleId } from '../core/types.ts';
import { freeSlotBank, levelHighScores, levelStats, progression, SCORE_TROPHY_TARGETS, TROPHY_NAMES, unlockedCardBacks } from '../game/storage.ts';
import type { History } from '../game/storage.ts';
import { el } from './dom.ts';
import { openOverlay } from './overlay.ts';
import type { AppContext } from './app-context.ts';

const ACHIEVEMENTS: { id: string; label: string; hint: string }[] = [
  { id: 'first-deal', label: 'First Deal', hint: 'Win your first deal.' },
  { id: 'flush-finder', label: 'Flush Finder', hint: 'Complete any flush.' },
  { id: 'risk-taker', label: 'Risk Taker', hint: 'Close a unit from a full hand.' },
  { id: 'quest-chaser', label: 'Quest Chaser', hint: 'Finish the deal’s flush quest.' },
  { id: 'last-laugh', label: 'Last Laugh', hint: 'Win after the extra-joker rescue.' },
  { id: 'clean-streak-3', label: 'Clean Streak', hint: 'Win three deals without banked aids.' },
];

const today = (): number => Math.floor(Date.now() / 86_400_000);
const dailyDeal = (): PuzzleId => ({ level: ((today() % 6) + 1) as Level, number: ((today() * 37) % 500) + 1 });
const weeklyDeal = (): PuzzleId => ({ level: (((Math.floor(today() / 7) + 2) % 6) + 1) as Level, number: ((today() * 11) % 500) + 1 });

function collection(history: History, level: Level): number {
  let won = 0;
  for (let n = 1; n <= 10; n++) if (history[`${level}-${n}`]?.finished) won++;
  return won;
}

function records(history: History): string {
  let score = 0;
  let fastest: number | null = null;
  let flushes = 0;
  let aids: number | null = null;
  for (const rec of Object.values(history)) {
    score = Math.max(score, rec.bestScore ?? 0);
    if (rec.bestTimeMs !== undefined && (fastest === null || rec.bestTimeMs < fastest)) fastest = rec.bestTimeMs;
    flushes = Math.max(flushes, rec.mostFlushes ?? 0);
    if (rec.fewestAids !== undefined && (aids === null || rec.fewestAids < aids)) aids = rec.fewestAids;
  }
  const time = fastest === null ? '—' : `${Math.floor(fastest / 60_000)}:${String(Math.floor((fastest % 60_000) / 1000)).padStart(2, '0')}`;
  return `Best score ${score || '—'} · fastest ${time} · most flushes ${flushes || '—'} · fewest aids ${aids ?? '—'}`;
}

export function openProgress(ctx: AppContext): void {
  openOverlay((close) => {
    const p = progression();
    const challenge = (label: string, id: PuzzleId): HTMLButtonElement => {
      const target = 120 + id.level * 20;
      const b = el('button', { class: 'btn' }, `${label}: ${LEVEL_NAMES[id.level]} ${id.number} · ${target}+`);
      b.addEventListener('click', () => {
        close();
        ctx.playPuzzle(id);
      });
      return b;
    };
    const badges = el('div', { class: 'progress-list' });
    for (const a of ACHIEVEMENTS) {
      badges.append(el('div', { class: `progress-row ${p.achievements.includes(a.id) ? 'done' : ''}` }, el('b', {}, a.label), el('small', {}, a.hint)));
    }
    const mastery = el('div', { class: 'progress-list' });
    for (const level of LEVELS) {
      const tier = p.mastery[level] ?? 0;
      const best = levelStats(ctx.history, level).bestScore;
      const target = SCORE_TROPHY_TARGETS[level];
      const nextTier = (tier + 1) as 1 | 2 | 3 | 4;
      const next = tier >= 4 ? 'Diamond complete' : `next ${TROPHY_NAMES[nextTier]} ${target[nextTier]}`;
      mastery.append(
        el(
          'div',
          { class: 'progress-row' },
          el('b', {}, `${tier > 0 ? '🏆 ' : ''}${LEVEL_NAMES[level]}`),
          el('small', {}, `${TROPHY_NAMES[tier]} trophy · best ${best ?? '—'} · ${next} · collection ${collection(ctx.history, level)}/10`),
        ),
      );
    }
    const highScores = el('div', { class: 'highscore-groups' });
    for (const level of LEVELS) {
      const scores = levelHighScores(ctx.history, level);
      const rows = el('div', { class: 'highscore-rows' });
      if (scores.length === 0) {
        rows.append(el('small', { class: 'highscore-empty' }, 'No completed deals yet'));
      } else {
        for (const [index, entry] of scores.entries()) {
          rows.append(
            el(
              'div',
              { class: 'highscore-row' },
              el('span', { class: 'highscore-rank' }, `#${index + 1}`),
              el('span', { class: 'highscore-deal' }, formatPuzzleId(entry.id)),
              el('b', {}, String(entry.score)),
            ),
          );
        }
      }
      highScores.append(
        el(
          'section',
          { class: 'highscore-group' },
          el('h4', {}, LEVEL_NAMES[level]),
          rows,
        ),
      );
    }
    const closeButton = el('button', { class: 'btn wide' }, 'Close');
    closeButton.addEventListener('click', close);
    return el(
      'div',
      { class: 'panel' },
      el('h2', {}, 'Progress'),
      el('p', { class: 'summary' }, `${p.successfulGames} first-time wins · clean streak ${p.cleanStreak} · best ${p.bestCleanStreak}`),
      el('p', { class: 'summary' }, `${freeSlotBank()} bonus free slots banked · card backs: ${unlockedCardBacks().join(', ')}`),
      el('p', { class: 'summary' }, records(ctx.history)),
      el('h3', {}, 'Challenges'),
      el('div', { class: 'actions' }, challenge('Daily', dailyDeal()), challenge('Weekly', weeklyDeal())),
      el('h3', {}, 'High scores'), highScores,
      el('h3', {}, 'Score trophies & collections'), mastery,
      el('h3', {}, 'Achievements'), badges,
      el('div', { class: 'panel-footer' }, closeButton),
    );
  });
}
