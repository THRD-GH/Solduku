/**
 * Phones dim and then lock the screen after a short idle timeout, and a puzzle
 * you are sitting and staring at counts as idle — the app never sees a touch.
 * The Wake Lock API is the only way to say otherwise.
 *
 * Two things make it fiddly. It needs a secure context (https, or localhost),
 * and the browser drops the lock whenever the page is hidden — switching apps,
 * locking the phone by hand — without telling us it will not come back. So the
 * wanted state is held here and the lock is retaken whenever the page returns.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let watching = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel !== null || document.hidden) return;
  if (!('wakeLock' in navigator)) return;
  try {
    const held = await navigator.wakeLock.request('screen');
    // Dropped by the browser rather than by us — clear it so a later return
    // to the page takes a fresh one.
    held.addEventListener('release', () => {
      if (sentinel === held) sentinel = null;
    });
    sentinel = held;
    // Released while the request was in flight.
    if (!wanted) void release();
  } catch {
    // Refused: no secure context, an unsupported browser, or a flat battery.
    // Nothing to tell the player about — the game plays either way.
    sentinel = null;
  }
}

async function release(): Promise<void> {
  const held = sentinel;
  sentinel = null;
  try {
    await held?.release();
  } catch {
    // Already gone.
  }
}

/** Hold the screen awake, or stop holding it. Safe to call repeatedly. */
export function keepScreenAwake(on: boolean): void {
  wanted = on;
  if (!watching) {
    watching = true;
    document.addEventListener('visibilitychange', () => void acquire());
  }
  if (on) void acquire();
  else void release();
}
