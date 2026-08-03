import type { Card, Level, Puzzle, PuzzleId } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import type { Move } from './state.ts';

const KEY = {
  settings: 'sd:v1:settings',
  history: 'sd:v1:history',
  rewards: 'sd:v1:rewards',
  cache: 'sd:v1:cache',
} as const;

/** How many deals each level offers. Generation is unlimited; this just
 *  bounds the picker list so "unplayed deals" stays a meaningful set. */
export const POOL_SIZE = 500;

export type Theme = 'night' | 'day' | 'contrast';
export type JokerAid = 'off' | 'assist' | 'generous';
export type CardBack = 'classic' | 'royal' | 'aurora';
export type TrophyTier = 0 | 1 | 2 | 3 | 4;
type EarnedTrophyTier = Exclude<TrophyTier, 0>;

/** Score bands are tuned to each level's dealt-card distribution. Bronze
 * sits just above a plain completion, so it rewards a little bonus play. */
export const SCORE_TROPHY_TARGETS: Record<Level, Record<EarnedTrophyTier, number>> = {
  1: { 1: 320, 2: 400, 3: 475, 4: 550 },
  2: { 1: 335, 2: 415, 3: 500, 4: 600 },
  3: { 1: 340, 2: 430, 3: 525, 4: 625 },
  4: { 1: 340, 2: 440, 3: 525, 4: 610 },
  5: { 1: 340, 2: 440, 3: 475, 4: 550 },
  6: { 1: 340, 2: 440, 3: 460, 4: 525 },
};

export const TROPHY_NAMES = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Diamond'] as const;

export function trophyForScore(level: Level, score: number): TrophyTier {
  const target = SCORE_TROPHY_TARGETS[level];
  if (score >= target[4]) return 4;
  if (score >= target[3]) return 3;
  if (score >= target[2]) return 2;
  if (score >= target[1]) return 1;
  return 0;
}

export interface Settings {
  /** Which palette to draw. 'contrast' is the accessible high-contrast one. */
  theme: Theme;
  /** Tint every cell the selected card could legally go — the training wheels. */
  highlightLegal: boolean;
  /** Mark legal moves that have no winning continuation. */
  showSafeMoves: boolean;
  /** Extra wild cards for new deals; the amount scales with the level. */
  jokerAid: JokerAid;
  /** Banked jokers to add to the next newly dealt puzzle. */
  jokerSpend: number;
  cardBack: CardBack;
  /** Hold a wake lock while a deal is open, so the screen stops dimming. */
  keepAwake: boolean;
  showTimer: boolean;
  /** Flag the placement that makes completing the sudoku impossible. */
  warnDeadGrid: boolean;
  /** Whether the first-time Quick Start has been shown. */
  introSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'night',
  highlightLegal: true,
  showSafeMoves: false,
  jokerAid: 'off',
  jokerSpend: 0,
  cardBack: 'classic',
  keepAwake: true,
  showTimer: true,
  warnDeadGrid: true,
  introSeen: false,
};

export interface PuzzleRecord {
  /** Won at least once. */
  finished: boolean;
  /** Playable again even though it has been started. */
  released: boolean;
  /** When it was first opened, so unfinished deals can be listed newest first. */
  startedAt?: number;
  bestScore?: number;
  bestAt?: number;
  bestTimeMs?: number;
  mostFlushes?: number;
  fewestAids?: number;
}

export type History = Record<string, PuzzleRecord>;

export interface SavedGame {
  id: PuzzleId;
  puzzle: Puzzle;
  /** Card placed per cell, null where empty or given. */
  placed: (Card | null)[];
  hand: Card[];
  free: (Card | null)[];
  /** Jokers still waiting in the separate joker pile. */
  jokerPile?: number;
  /** The pile size at the deal's start, used when restarting. */
  initialJokers?: number;
  questComplete?: boolean;
  riskBonuses?: number;
  usedBankedAid?: boolean;
  rescuedWithJoker?: boolean;
  /** Cards drawn so far — the deck itself lives in the puzzle. */
  deckPos: number;
  score: number;
  scoredUnits: number[];
  flushUnits: number[];
  elapsedMs: number;
  /** Undo stack, so a refresh or a parked deal keeps its history.
   *  Absent in saves written before it was persisted. */
  moves?: Move[];
  /** When it was last written, so the newest can be resumed. */
  savedAt?: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota — the game still plays, it just forgets.
  }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read(KEY.settings, {}) });
export const saveSettings = (s: Settings): void => write(KEY.settings, s);

interface Rewards {
  jokers: number;
  successfulGames: number;
  freeSlots: number;
  earnedFreeSlots: number;
  cleanStreak: number;
  bestCleanStreak: number;
  achievements: string[];
  mastery: Partial<Record<Level, number>>;
}

const loadRewards = (): Rewards => {
  const saved = read<Partial<Rewards>>(KEY.rewards, {});
  return {
    jokers: saved.jokers ?? 0,
    successfulGames: saved.successfulGames ?? 0,
    freeSlots: saved.freeSlots ?? 0,
    earnedFreeSlots: saved.earnedFreeSlots ?? 0,
    cleanStreak: saved.cleanStreak ?? 0,
    bestCleanStreak: saved.bestCleanStreak ?? 0,
    achievements: saved.achievements ?? [],
    mastery: saved.mastery ?? {},
  };
};
export const jokerBank = (): number => loadRewards().jokers;
export const freeSlotBank = (): number => loadRewards().freeSlots;
export const progression = (): Pick<Rewards, 'successfulGames' | 'cleanStreak' | 'bestCleanStreak' | 'achievements' | 'mastery' | 'earnedFreeSlots'> => {
  const rewards = loadRewards();
  return rewards;
};
export const unlockedCardBacks = (): CardBack[] => {
  const progress = progression();
  const backs: CardBack[] = ['classic'];
  if (progress.successfulGames >= 5) backs.push('royal');
  if (Object.values(progress.mastery).some((tier) => tier >= 3)) backs.push('aurora');
  return backs;
};
export const winsToNextFreeSlot = (): number => {
  const progress = loadRewards().successfulGames % 10;
  return progress === 0 ? 10 : 10 - progress;
};

export interface WinReward {
  jokers: number;
  freeSlots: number;
  earnedFreeSlot: boolean;
  newAchievements: string[];
  mastery: number;
  cleanStreak: number;
}

export interface TrophyAward {
  tier: TrophyTier;
  newlyEarned: boolean;
}

/** Store the highest score trophy for a level. Replays can always improve it. */
export function awardScoreTrophy(level: Level, score: number): TrophyAward {
  const rewards = loadRewards();
  const previous = rewards.mastery[level] ?? 0;
  const earned = trophyForScore(level, score);
  const tier = Math.max(previous, earned) as TrophyTier;
  rewards.mastery[level] = tier;
  write(KEY.rewards, rewards);
  return { tier, newlyEarned: earned > previous };
}

/** A first-time deal win earns a joker; every tenth earns a bonus free slot. */
export function earnWinReward(details?: {
  level: Level;
  score: number;
  flushes: number;
  usedAid: boolean;
  riskBonuses: number;
  questComplete: boolean;
  rescuedWithJoker: boolean;
}): WinReward {
  const rewards = loadRewards();
  rewards.jokers++;
  rewards.successfulGames++;
  const earnedFreeSlot = rewards.successfulGames % 10 === 0;
  if (earnedFreeSlot) rewards.freeSlots++;
  if (earnedFreeSlot) rewards.earnedFreeSlots++;
  if (details) {
    rewards.cleanStreak = details.usedAid ? 0 : rewards.cleanStreak + 1;
    rewards.bestCleanStreak = Math.max(rewards.bestCleanStreak, rewards.cleanStreak);
    const earned = new Set(rewards.achievements);
    const unlock = (id: string, when: boolean): void => {
      if (when) earned.add(id);
    };
    unlock('first-deal', rewards.successfulGames === 1);
    unlock('flush-finder', details.flushes > 0);
    unlock('risk-taker', details.riskBonuses > 0);
    unlock('quest-chaser', details.questComplete);
    unlock('last-laugh', details.rescuedWithJoker);
    unlock('clean-streak-3', rewards.bestCleanStreak >= 3);
    const newAchievements = [...earned].filter((id) => !rewards.achievements.includes(id));
    rewards.achievements = [...earned];
    write(KEY.rewards, rewards);
    return {
      jokers: rewards.jokers,
      freeSlots: rewards.freeSlots,
      earnedFreeSlot,
      newAchievements,
      mastery: rewards.mastery[details.level] ?? 0,
      cleanStreak: rewards.cleanStreak,
    };
  }
  write(KEY.rewards, rewards);
  return { jokers: rewards.jokers, freeSlots: rewards.freeSlots, earnedFreeSlot, newAchievements: [], mastery: 0, cleanStreak: rewards.cleanStreak };
}

/** Spend banked jokers atomically when starting a new deal. */
export function spendJokers(amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 0) return false;
  const rewards = loadRewards();
  if (amount > rewards.jokers) return false;
  rewards.jokers -= amount;
  write(KEY.rewards, rewards);
  return true;
}

/** Spend one earned bonus free-slot token. */
export function spendFreeSlot(): boolean {
  const rewards = loadRewards();
  if (rewards.freeSlots < 1) return false;
  rewards.freeSlots--;
  write(KEY.rewards, rewards);
  return true;
}

export const loadHistory = (): History => read<History>(KEY.history, {});
export const saveHistory = (h: History): void => write(KEY.history, h);

/** Deals are saved one key per puzzle, so every unfinished deal keeps its own
 *  table state and can be picked up where it was left. */
const savePrefix = 'sd:v1:save:';
const saveKeyFor = (id: PuzzleId): string => savePrefix + formatPuzzleId(id);

/** Parked deals kept before the oldest is dropped. */
const MAX_SAVES = 30;

function saveKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(savePrefix)) keys.push(key);
  }
  return keys;
}

export function loadSaveFor(id: PuzzleId): SavedGame | null {
  return read<SavedGame | null>(saveKeyFor(id), null);
}

/** The most recently played deal, for the menu's Resume button. */
export function latestSave(): SavedGame | null {
  let best: SavedGame | null = null;
  for (const key of saveKeys()) {
    const saved = read<SavedGame | null>(key, null);
    if (saved === null) continue;
    if (best === null || (saved.savedAt ?? 0) > (best.savedAt ?? 0)) best = saved;
  }
  return best;
}

/** Every parked deal, newest first, for the resume picker on the home screen. */
export function allSaves(): SavedGame[] {
  return saveKeys()
    .map((key) => read<SavedGame | null>(key, null))
    .filter((saved): saved is SavedGame => saved !== null)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function saveGame(game: SavedGame): void {
  write(saveKeyFor(game.id), { ...game, savedAt: Date.now() });

  // Drop the oldest once there are more parked deals than we keep.
  const keys = saveKeys();
  if (keys.length <= MAX_SAVES) return;
  const byAge = keys
    .map((key) => ({ key, at: read<SavedGame | null>(key, null)?.savedAt ?? 0 }))
    .sort((a, b) => a.at - b.at);
  for (const stale of byAge.slice(0, keys.length - MAX_SAVES)) localStorage.removeItem(stale.key);
}

export const clearSaveFor = (id: PuzzleId): void => localStorage.removeItem(saveKeyFor(id));

/** True if the deal has been started and not released for replay. */
export function isLocked(history: History, id: PuzzleId): boolean {
  const rec = history[formatPuzzleId(id)];
  return rec !== undefined && !rec.released;
}

export function unplayedNumbers(history: History, level: Level, poolSize = POOL_SIZE): number[] {
  const out: number[] = [];
  for (let n = 1; n <= poolSize; n++) {
    if (!isLocked(history, { level, number: n })) out.push(n);
  }
  return out;
}

export interface LevelStats {
  played: number;
  finished: number;
  bestScore: number | null;
}

export interface LevelHighScore {
  id: PuzzleId;
  score: number;
}

/** The best completed deals for one difficulty, ranked by score. */
export function levelHighScores(
  history: History,
  level: Level,
  limit = 3,
  poolSize = POOL_SIZE,
): LevelHighScore[] {
  const scores: LevelHighScore[] = [];
  for (let number = 1; number <= poolSize; number++) {
    const id = { level, number };
    const score = history[formatPuzzleId(id)]?.bestScore;
    if (score !== undefined) scores.push({ id, score });
  }
  return scores.sort((a, b) => b.score - a.score || a.id.number - b.id.number).slice(0, limit);
}

export function levelStats(history: History, level: Level, poolSize = POOL_SIZE): LevelStats {
  let played = 0;
  let finished = 0;
  let best: number | null = null;
  for (let n = 1; n <= poolSize; n++) {
    const rec = history[formatPuzzleId({ level, number: n })];
    if (!rec) continue;
    played++;
    if (rec.finished) finished++;
    if (rec.bestScore !== undefined && (best === null || rec.bestScore > best)) {
      best = rec.bestScore;
    }
  }
  return { played, finished, bestScore: best };
}

/** Mark a deal as started, so it drops out of the unplayed list. */
export function markStarted(history: History, id: PuzzleId, now = Date.now()): History {
  const key = formatPuzzleId(id);
  if (!history[key]) history[key] = { finished: false, released: false, startedAt: now };
  else history[key] = { ...history[key], released: false, startedAt: history[key].startedAt ?? now };
  return history;
}

/** Record a win, keeping the best score. */
export interface ResultDetails {
  elapsedMs: number;
  flushes: number;
  aids: number;
}

/** Record a win, keeping the best score and separate personal-best splits. */
export function markFinished(
  history: History,
  id: PuzzleId,
  score: number,
  now: number,
  details?: ResultDetails,
): History {
  const key = formatPuzzleId(id);
  const rec = history[key] ?? { finished: false, released: false };
  const improvedScore = rec.bestScore === undefined || score > rec.bestScore;
  history[key] = {
    ...rec,
    finished: true,
    released: false,
    ...(improvedScore ? { bestScore: score, bestAt: now } : {}),
    ...(details && (rec.bestTimeMs === undefined || details.elapsedMs < rec.bestTimeMs)
      ? { bestTimeMs: details.elapsedMs }
      : {}),
    ...(details && (rec.mostFlushes === undefined || details.flushes > rec.mostFlushes)
      ? { mostFlushes: details.flushes }
      : {}),
    ...(details && (rec.fewestAids === undefined || details.aids < rec.fewestAids)
      ? { fewestAids: details.aids }
      : {}),
  };
  return history;
}

export function releasePuzzle(history: History, id: PuzzleId): History {
  const key = formatPuzzleId(id);
  if (history[key]) history[key] = { ...history[key], released: true };
  return history;
}

/**
 * A link to one deal. Deals are fully determined by level and number, so the
 * id is the whole payload — no grid needs encoding.
 */
export function puzzleLink(id: PuzzleId): string {
  const url = new URL(window.location.href);
  url.search = `?p=${formatPuzzleId(id)}`;
  url.hash = '';
  return url.toString();
}

/** The deal named in ?p=, if the address bar carries one. */
export function linkedPuzzle(): PuzzleId | null {
  const asked = new URLSearchParams(window.location.search).get('p');
  return asked === null ? null : parsePuzzleId(asked.trim());
}

/** Drop ?p= once it has been acted on, so a refresh does not reopen it. */
export function clearPuzzleLink(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('p')) return;
  url.search = '';
  window.history.replaceState(null, '', url.toString());
}

/** The inverse of formatPuzzleId: "3-10". */
export function parsePuzzleId(key: string): PuzzleId | null {
  const match = /^([1-6])-(\d+)$/.exec(key);
  if (!match) return null;
  return { level: Number(match[1]) as Level, number: Number(match[2]) };
}

/** Generated deals are deterministic but slow to rebuild, so keep recent ones. */
const CACHE_LIMIT = 20;
type Cache = Record<string, Puzzle>;

export function cachedPuzzle(id: PuzzleId): Puzzle | null {
  return read<Cache>(KEY.cache, {})[formatPuzzleId(id)] ?? null;
}

export function cachePuzzle(id: PuzzleId, puzzle: Puzzle): void {
  const cache = read<Cache>(KEY.cache, {});
  const keys = Object.keys(cache);
  if (keys.length >= CACHE_LIMIT) delete cache[keys[0]];
  cache[formatPuzzleId(id)] = puzzle;
  write(KEY.cache, cache);
}
