import type { Card, Level, Puzzle, PuzzleId } from '../core/types.ts';
import { formatPuzzleId } from '../core/types.ts';
import type { Move } from './state.ts';

const KEY = {
  settings: 'sd:v1:settings',
  history: 'sd:v1:history',
  cache: 'sd:v1:cache',
} as const;

/** How many deals each level offers. Generation is unlimited; this just
 *  bounds the picker list so "unplayed deals" stays a meaningful set. */
export const POOL_SIZE = 500;

export type Theme = 'night' | 'day' | 'contrast';

export interface Settings {
  /** Which palette to draw. 'contrast' is the accessible high-contrast one. */
  theme: Theme;
  /** Tint every cell the selected card could legally go — the training wheels. */
  highlightLegal: boolean;
  /** Mark legal moves that have no winning continuation. */
  showSafeMoves: boolean;
  /** Hold a wake lock while a deal is open, so the screen stops dimming. */
  keepAwake: boolean;
  showTimer: boolean;
  /** Flag the placement that makes completing the sudoku impossible. */
  warnDeadGrid: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'night',
  highlightLegal: true,
  showSafeMoves: true,
  keepAwake: true,
  showTimer: true,
  warnDeadGrid: true,
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
}

export type History = Record<string, PuzzleRecord>;

export interface SavedGame {
  id: PuzzleId;
  puzzle: Puzzle;
  /** Card placed per cell, null where empty or given. */
  placed: (Card | null)[];
  hand: Card[];
  free: (Card | null)[];
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
export function markFinished(history: History, id: PuzzleId, score: number, now: number): History {
  const key = formatPuzzleId(id);
  const rec = history[key] ?? { finished: false, released: false };
  if (rec.bestScore === undefined || score > rec.bestScore) {
    history[key] = { ...rec, finished: true, released: false, bestScore: score, bestAt: now };
  } else {
    history[key] = { ...rec, finished: true, released: false };
  }
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
