import type { Level, PuzzleId } from '../core/types.ts';
import type { History, Settings } from '../game/storage.ts';

/** What the screens are allowed to ask of the app shell. */
export interface AppContext {
  settings: Settings;
  history: History;
  applyTheme(): void;
  /** Take or drop the screen wake lock, after the setting changes. */
  applyWakeLock(): void;
  /** Repaint the board in place, e.g. after a highlighting setting changes. */
  refreshBoard(): void;
  goMenu(): void;
  openHelp(): void;
  openSettings(): void;
  openProgress(): void;
  /** The scoring table and tips — with live flush prospects mid-deal. */
  openScoring(): void;
  playPuzzle(id: PuzzleId): void;
  playRandom(level: Level): void;
}
