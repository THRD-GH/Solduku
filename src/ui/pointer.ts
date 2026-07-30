export interface TapOptions {
  onTap?: (index: number) => void;
  /** Long-press. The reference app treats double-click as the same gesture. */
  onLong?: (index: number) => void;
  /** Fired on double-click when a tap has already been delivered for it. */
  onDouble?: (index: number) => void;
  longMs?: number;
  /**
   * Deliver a tap even when the finger slid between pressing and lifting.
   *
   * Right for the grid, where a hurried tap that drifts a few pixels into the
   * next cell is still plainly a tap and dropping it silently loses the move.
   * Wrong for buttons, where sliding off is how you take an action back.
   */
  forgiveDrift?: boolean;
  /**
   * Fire the tap the moment the finger lands, rather than when it lifts.
   *
   * For the grid, where the tap only moves the cursor: nothing is committed, so
   * there is nothing to want back, and waiting for the lift is where selections
   * get lost. A pointer can be cancelled between down and up — the browser
   * deciding a slight movement was a scroll is enough — and a cancelled pointer
   * sends no pointerup at all, so the tap simply never arrives and the next
   * digit lands in the previous cell. Pressing cannot be taken away.
   *
   * Wrong for the keypad, where a tap enters a digit and lifting elsewhere is
   * the way out of a mistake.
   */
  tapOnDown?: boolean;
}

const DEFAULT_LONG_MS = 450;

/** How stale the first of two taps may be and still count as a double-click. */
const DOUBLE_WINDOW_MS = 900;

/**
 * Two taps this close together are a double-click, whatever the browser thinks.
 *
 * `dblclick` alone is not dependable: it fires on the second, fourth, sixth
 * click of a run, so one stray tap somewhere else mid-flow puts the count out
 * of phase and the next deliberate double-click arrives as two singles — the
 * digit toggles a pencil mark instead of being written in.
 */
const DOUBLE_TAP_MS = 400;

/**
 * Binds the tap / long-press / double-click trio the reference app uses.
 *
 * A tap fires immediately — waiting to see whether a double-click follows would
 * make every digit entry feel laggy. So on a double-click the caller gets
 * `onDouble` *after* having already had `onTap`, and is expected to undo the
 * tap before applying the stronger action.
 */
export function bindTap(target: HTMLElement, opts: TapOptions, indexOf?: (e: Event) => number): void {
  const longMs = opts.longMs ?? DEFAULT_LONG_MS;
  let timer: number | undefined;
  let longFired = false;
  let downIndex = -1;
  /**
   * The last two taps. A double-click only counts when both of them hit the
   * same target: browsers fire dblclick for two quick clicks on *different*
   * elements too, and treating that as a force would swallow one of two digits
   * typed in a hurry.
   */
  const recentTaps: { index: number; at: number }[] = [];

  const index = (e: Event): number => (indexOf ? indexOf(e) : 0);

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  target.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    downIndex = index(e);
    if (downIndex < 0) return;
    longFired = false;
    cancel();
    timer = window.setTimeout(() => {
      longFired = true;
      timer = undefined;
      opts.onLong?.(downIndex);
    }, longMs);
    if (opts.tapOnDown) opts.onTap?.(downIndex);
  });

  target.addEventListener('pointerup', (e) => {
    cancel();
    if (longFired) {
      // Swallow the click that follows a long-press, and the gesture with it.
      e.preventDefault();
      recentTaps.length = 0;
      return;
    }

    const lifted = index(e);
    // Where the finger came up, or where it went down if it came up somewhere
    // that means nothing — off the grid, or on the gap between two keys.
    const i = lifted >= 0 ? lifted : downIndex;
    if (i < 0) return;
    if (i !== downIndex && !opts.forgiveDrift) return;

    // Already delivered on the way down. Landing somewhere else on the way up
    // still counts, so the cursor follows a finger that slid.
    if (opts.tapOnDown) {
      if (i !== downIndex) opts.onTap?.(i);
      return;
    }

    const previous = recentTaps[recentTaps.length - 1];
    const isDouble =
      previous !== undefined &&
      previous.index === i &&
      performance.now() - previous.at < DOUBLE_TAP_MS;

    recentTaps.push({ index: i, at: performance.now() });
    if (recentTaps.length > 2) recentTaps.shift();
    opts.onTap?.(i);

    // The caller has now had both taps, and rolls the pair back before applying
    // the stronger action — see doubleDigit.
    if (isDouble) {
      recentTaps.length = 0;
      (opts.onDouble ?? opts.onLong)?.(i);
    }
  });

  for (const ev of ['pointercancel', 'pointerleave'] as const) {
    target.addEventListener(ev, cancel);
  }

  /*
   * Kept as a second route in, for a double-click slower than DOUBLE_TAP_MS
   * that the browser still counts as one. Firing above clears the tap record,
   * so the two paths can never both act on the same pair.
   */
  target.addEventListener('dblclick', (e) => {
    const i = index(e);
    if (i < 0) return;
    e.preventDefault();

    const sameTargetTwice =
      recentTaps.length === 2 &&
      recentTaps[0].index === i &&
      recentTaps[1].index === i &&
      performance.now() - recentTaps[0].at < DOUBLE_WINDOW_MS;
    if (!sameTargetTwice) return;

    recentTaps.length = 0;
    (opts.onDouble ?? opts.onLong)?.(i);
  });

  // A long-press on touch would otherwise raise the text-selection menu.
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}
