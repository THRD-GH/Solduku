import './style.css';
import type { Level, PuzzleId } from './core/types.ts';
import { formatPuzzleId } from './core/types.ts';
import { getPuzzle, prefetch } from './game/generate.ts';
import { registerServiceWorker, setThemeColour } from './game/pwa.ts';
import { keepScreenAwake } from './game/wakelock.ts';
import { Game } from './game/state.ts';
import {
  clearPuzzleLink,
  latestSave,
  linkedPuzzle,
  loadHistory,
  loadSaveFor,
  loadSettings,
  markStarted,
  saveHistory,
  unplayedNumbers,
} from './game/storage.ts';
import type { History, SavedGame, Settings, Theme } from './game/storage.ts';
import { clear, el } from './ui/dom.ts';
import { buildMenu } from './ui/menu.ts';
import { openHelp } from './ui/help.ts';
import { openScoring } from './ui/scoring.ts';
import { closeTopOverlay, onOverlayOpen, openOverlay, toast } from './ui/overlay.ts';
import { PlayScreen } from './ui/play.ts';
import { openSettings } from './ui/settings.ts';
import type { AppContext } from './ui/app-context.ts';

/** The browser chrome colour that matches each board, for the PWA title bar. */
const THEME_COLOUR: Record<Theme, string> = {
  night: '#0a0d10',
  day: '#dfe4e9',
  contrast: '#000000',
};

class App implements AppContext {
  settings: Settings = loadSettings();
  history: History = loadHistory();

  private root: HTMLElement;
  private play: PlayScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.applyTheme();

    this.guardBackButton();
    document.addEventListener('keydown', (e) => this.play?.handleKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.play?.pause();
      this.applyWakeLock();
    });

    // A shared link names a deal outright; honour it instead of the menu.
    const linked = linkedPuzzle();
    clearPuzzleLink();

    this.goMenu();
    if (linked !== null) this.playPuzzle(linked);
  }

  /**
   * Installed as a PWA there is no browser chrome, so the phone's back gesture
   * is the only back there is — and by default it leaves the app entirely,
   * mid-deal. One history entry is kept while anything other than the menu is
   * on screen, and going back spends it: the top panel closes, or the menu
   * comes back. Only from the bare menu does back leave.
   */
  private guarded = false;

  private guardBackButton(): void {
    onOverlayOpen(() => this.armBack());
    window.addEventListener('popstate', () => {
      if (closeTopOverlay()) {
        // The panel took the press; arm another for what is underneath.
        this.guarded = false;
        this.armBack();
        return;
      }
      if (!this.guarded) return;
      this.guarded = false;
      this.goMenu(true);
    });
  }

  private armBack(): void {
    if (this.guarded) return;
    history.pushState({ sd: 'back' }, '');
    this.guarded = true;
  }

  applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    setThemeColour(THEME_COLOUR[this.settings.theme]);
  }

  /** Only worth holding while a deal is open. */
  applyWakeLock(): void {
    keepScreenAwake(this.settings.keepAwake && this.play !== null && !document.hidden);
  }

  refreshBoard(): void {
    this.play?.render();
  }

  private mount(node: HTMLElement): void {
    this.play?.destroy();
    this.play = null;
    this.applyWakeLock();
    clear(this.root);
    this.root.append(node);
  }

  goMenu(fromBack = false): void {
    // Leaving by a button rather than the back gesture: spend the held entry
    // instead of stacking another — the popstate that follows mounts the menu.
    if (!fromBack && this.guarded) {
      history.back();
      return;
    }
    const saved = latestSave();
    const resume =
      saved === null
        ? undefined
        : {
            label: `Resume ${formatPuzzleId(saved.id)}`,
            run: () => this.resume(saved),
          };
    this.mount(buildMenu(this, resume));
  }

  openHelp(): void {
    openHelp();
  }

  openSettings(): void {
    openSettings(this);
  }

  openScoring(): void {
    openScoring(this.play?.game ?? null);
  }

  playRandom(level: Level): void {
    const pool = unplayedNumbers(this.history, level);
    if (pool.length === 0) {
      toast('Every deal in this level has been played');
      return;
    }
    const number = pool[Math.floor(Math.random() * pool.length)];
    this.playPuzzle({ level, number });
  }

  playPuzzle(id: PuzzleId): void {
    // Every deal keeps its own save, so opening one you have started carries
    // on from where you left it. Restart is there for starting over.
    const saved = loadSaveFor(id);
    if (saved) {
      this.resume(saved);
      return;
    }

    const close = openOverlay(
      () =>
        el(
          'div',
          { class: 'panel won' },
          el('div', { class: 'spinner' }),
          el('h2', {}, `Dealing ${formatPuzzleId(id)}`),
          el('p', { class: 'summary' }, 'Digging the givens and proving one solution.'),
        ),
      { dismissable: false },
    );

    void getPuzzle(id)
      .then((puzzle) => {
        close();
        markStarted(this.history, id);
        saveHistory(this.history);
        this.startGame(new Game(id, puzzle));
        const pool = unplayedNumbers(this.history, id.level).filter((n) => n !== id.number);
        if (pool.length > 0) prefetch({ level: id.level, number: pool[0] });
      })
      .catch((err: unknown) => {
        close();
        toast(err instanceof Error ? err.message : 'Could not deal that puzzle');
      });
  }

  private resume(saved: SavedGame): void {
    this.startGame(new Game(saved.id, saved.puzzle, saved));
  }

  private startGame(game: Game): void {
    this.armBack();
    this.play?.destroy();
    clear(this.root);
    const screen = new PlayScreen(this, game);
    this.play = screen;
    this.root.append(screen.root);
    this.applyWakeLock();
  }
}

const host = document.querySelector<HTMLElement>('#app');
if (host) new App(host);

registerServiceWorker();
