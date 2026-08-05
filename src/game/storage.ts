import type { Card, Level, Puzzle, PuzzleId } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import type { TrophyTier } from '../core/scoring.ts';
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

/** Time of day at the table, or the accessible set which overrides both. */
export type Theme = 'night' | 'day' | 'contrast';

/**
 * Which table you are playing on. Kept separate from the time of day so each
 * one keeps its own daylight and lamplight, rather than doubling the list.
 */
export type Palette = 'newsprint' | 'baize' | 'claret' | 'midnight';

export const PALETTES: { value: Palette; label: string; note: string }[] = [
  { value: 'newsprint', label: 'Newsprint', note: 'A printed puzzle page' },
  { value: 'baize', label: 'Baize', note: 'Green cloth and brass' },
  { value: 'claret', label: 'Claret', note: 'Burgundy and gold' },
  { value: 'midnight', label: 'Midnight', note: 'Cool cloth, warm accent' },
];

/** The value the stylesheet keys off: one attribute, so no theme outranks
 *  another and the accessible set can always have the last word. */
export const themeAttribute = (theme: Theme, palette: Palette): string =>
  theme === 'contrast' ? 'contrast' : `${palette}-${theme}`;
export type JokerAid = 'off' | 'assist' | 'generous';
export type CardBack = 'classic' | 'royal' | 'aurora';
export type { TrophyTier };
/** The legacy table only ever graded four tiers. */
type LegacyTier = 1 | 2 | 3 | 4;

/**
 * The old fixed bands, kept only to grade deals finished before trophies were
 * measured against the deal itself. Nothing new is scored against them.
 */
const LEGACY_TROPHY_TARGETS: Record<Level, Record<LegacyTier, number>> = {
  1: { 1: 320, 2: 400, 3: 475, 4: 550 },
  2: { 1: 335, 2: 415, 3: 500, 4: 600 },
  3: { 1: 340, 2: 430, 3: 525, 4: 625 },
  4: { 1: 340, 2: 440, 3: 525, 4: 610 },
  5: { 1: 340, 2: 440, 3: 475, 4: 550 },
  6: { 1: 340, 2: 440, 3: 460, 4: 525 },
};

export const TROPHY_NAMES = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Superstar'] as const;

/** Grades a score from before per-deal bands existed. */
export function legacyTrophyForScore(level: Level, score: number): TrophyTier {
  const target = LEGACY_TROPHY_TARGETS[level];
  if (score >= target[4]) return 4;
  if (score >= target[3]) return 3;
  if (score >= target[2]) return 2;
  if (score >= target[1]) return 1;
  return 0;
}

export interface Settings {
  /** Time of day. 'contrast' is the accessible high-contrast set. */
  theme: Theme;
  /** Which table the game is played on. */
  palette: Palette;
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
  palette: 'newsprint',
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
  /** Trophy earned on this deal, graded against the deal's own bands. Absent
   *  on records written before trophies were measured that way. */
  bestTrophy?: TrophyTier;
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
  /** Bank tokens spent into this deal, so a restart can keep them. */
  bankedJokers?: number;
  bonusSlots?: number;
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
export function awardScoreTrophy(level: Level, earned: TrophyTier): TrophyAward {
  const rewards = loadRewards();
  const previous = rewards.mastery[level] ?? 0;
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

export interface TotalStats {
  played: number;
  finished: number;
  totalBestScore: number;
  bestScore: number | null;
  averageTimeMs: number | null;
  mostFlushes: number | null;
  fewestAids: number | null;
}

/** Lifetime records, calculated from the best result for each deal. */
export function totalStats(history: History): TotalStats {
  let played = 0;
  let finished = 0;
  let totalBestScore = 0;
  let bestScore: number | null = null;
  let totalTime = 0;
  let timed = 0;
  let mostFlushes: number | null = null;
  let fewestAids: number | null = null;
  for (const rec of Object.values(history)) {
    played++;
    if (rec.finished) finished++;
    if (rec.bestScore !== undefined) {
      totalBestScore += rec.bestScore;
      bestScore = Math.max(bestScore ?? rec.bestScore, rec.bestScore);
    }
    if (rec.bestTimeMs !== undefined) {
      totalTime += rec.bestTimeMs;
      timed++;
    }
    if (rec.mostFlushes !== undefined) mostFlushes = Math.max(mostFlushes ?? rec.mostFlushes, rec.mostFlushes);
    if (rec.fewestAids !== undefined) fewestAids = Math.min(fewestAids ?? rec.fewestAids, rec.fewestAids);
  }
  return {
    played,
    finished,
    totalBestScore,
    bestScore,
    averageTimeMs: timed === 0 ? null : Math.round(totalTime / timed),
    mostFlushes,
    fewestAids,
  };
}

export interface Backup {
  app: 'solduku';
  version: 1;
  exportedAt: string;
  settings: Settings;
  history: History;
  rewards: Rewards;
  saves: SavedGame[];
}

/** A complete, portable copy of local progress and every parked deal. */
export function exportBackup(): Backup {
  return {
    app: 'solduku',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    history: loadHistory(),
    rewards: loadRewards(),
    saves: allSaves(),
  };
}

/** Replace local progress with a validated backup. */
export function importBackup(raw: unknown): { history: number; saves: number } {
  if (typeof raw !== 'object' || raw === null) throw new Error('That is not a Solduku backup');
  const backup = raw as Partial<Backup>;
  if (backup.app !== 'solduku' || backup.version !== 1 || typeof backup.history !== 'object' || backup.history === null || !Array.isArray(backup.saves)) {
    throw new Error('That is not a Solduku backup');
  }
  if (!backup.saves.every((save) => save && typeof save === 'object' && 'id' in save && 'puzzle' in save)) {
    throw new Error('That backup contains a damaged saved deal');
  }
  for (const key of saveKeys()) localStorage.removeItem(key);
  write(KEY.settings, { ...DEFAULT_SETTINGS, ...(backup.settings ?? {}) });
  write(KEY.history, backup.history);
  write(KEY.rewards, { ...loadRewards(), ...(backup.rewards ?? {}) });
  for (const save of backup.saves.slice(0, MAX_SAVES)) write(saveKeyFor(save.id), save);
  return { history: Object.keys(backup.history).length, saves: Math.min(backup.saves.length, MAX_SAVES) };
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
  /** Graded against this deal's own bands at the moment it was won. */
  trophy: TrophyTier;
}

/**
 * The trophy shown for a completed deal. Records written before trophies were
 * graded per deal have none stored, so those fall back to the fixed bands
 * they were actually earned under.
 */
export function trophyForRecord(level: Level, record: PuzzleRecord | undefined): TrophyTier {
  if (record === undefined) return 0;
  if (record.bestTrophy !== undefined) return record.bestTrophy;
  return record.bestScore === undefined ? 0 : legacyTrophyForScore(level, record.bestScore);
}

/** The best trophy earned anywhere in a level, for the menu and progress. */
export function levelTrophy(history: History, level: Level, poolSize = POOL_SIZE): TrophyTier {
  let best: TrophyTier = 0;
  for (let n = 1; n <= poolSize; n++) {
    const tier = trophyForRecord(level, history[formatPuzzleId({ level, number: n })]);
    if (tier > best) best = tier;
  }
  return best;
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
    ...(details && (rec.bestTrophy === undefined || details.trophy > rec.bestTrophy)
      ? { bestTrophy: details.trophy }
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
