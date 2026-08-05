import './style.css';
import type { Level, PuzzleId } from './core/types.ts';
import { formatPuzzleId } from './core/types.ts';
import { getPuzzle, prefetch } from './game/generate.ts';
import { deckWithJokers, JOKER_AID_COUNTS, LEVEL_CONFIG } from './core/classic.ts';
import { registerServiceWorker, setThemeColour } from './game/pwa.ts';
import { keepScreenAwake } from './game/wakelock.ts';
import { Game } from './game/state.ts';
import {
  clearPuzzleLink,
  jokerBank,
  linkedPuzzle,
  loadHistory,
  loadSaveFor,
  loadSettings,
  markStarted,
  saveHistory,
  saveSettings,
  spendJokers,
  unplayedNumbers,
} from './game/storage.ts';
import type { History, SavedGame, Settings } from './game/storage.ts';
import { themeAttribute } from './game/storage.ts';
import { clear, el } from './ui/dom.ts';
import { buildMenu } from './ui/menu.ts';
import { openHelp } from './ui/help.ts';
import { openIntro } from './ui/intro.ts';
import { openScoring } from './ui/scoring.ts';
import { closeTopOverlay, onOverlayOpen, openOverlay, toast } from './ui/overlay.ts';
import { PlayScreen } from './ui/play.ts';
import { openSettings } from './ui/settings.ts';
import { openProgress } from './ui/progress.ts';
import type { AppContext } from './ui/app-context.ts';

/**
 * The browser chrome colour, for the PWA title bar. Read from the page once
 * the theme is on the root element, so it can never drift from the stylesheet
 * the way a hand-copied hex does.
 */
function chromeColour(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return bg === '' ? '#14161a' : bg;
}

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
    else if (!this.settings.introSeen) this.openIntro();
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
    document.documentElement.dataset.theme = themeAttribute(this.settings.theme, this.settings.palette);
    document.documentElement.dataset.cardBack = this.settings.cardBack;
    setThemeColour(chromeColour());
  }

  /** Only worth holding while a deal is open. */
  applyWakeLock(): void {
    keepScreenAwake(this.settings.keepAwake && this.play !== null && !this.play.isPaused && !document.hidden);
  }

  refreshBoard(): void {
    this.play?.render();
  }

  reload(): void {
    this.settings = loadSettings();
    this.history = loadHistory();
    this.applyTheme();
    this.goMenu();
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
    this.mount(buildMenu(this));
  }

  openHelp(): void {
    openHelp();
  }

  openIntro(): void {
    openIntro(() => {
      this.settings.introSeen = true;
      saveSettings(this.settings);
    });
  }

  openSettings(): void {
    openSettings(this);
  }

  openProgress(): void {
    openProgress(this);
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
        const aid = this.settings.jokerAid;
        const spend = Math.min(this.settings.jokerSpend, jokerBank());
        if (spend > 0) spendJokers(spend);
        if (this.settings.jokerSpend !== 0) {
          this.settings.jokerSpend = 0;
          saveSettings(this.settings);
        }
        const aidJokers =
          aid === 'off' ? 0 : JOKER_AID_COUNTS[aid][id.level] - LEVEL_CONFIG[id.level].jokers;
        const adjusted = {
          ...puzzle,
          // Normal number cards always stay in the deck. Jokers are drawn
          // from their own visible pile, including any selected aids.
          deck: deckWithJokers(puzzle, 0),
          jokerCount: LEVEL_CONFIG[id.level].jokers + aidJokers + spend,
        };
        this.startGame(new Game(id, adjusted));
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
