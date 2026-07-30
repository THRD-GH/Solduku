/**
 * Service worker registration. Only in a built site: in dev there is no sw.js,
 * and a stale worker caching dev assets is a good way to lose an afternoon.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // An unregistrable worker costs offline play, nothing else.
    });
  });
}

/** Colour the browser and OS chrome to match the current theme. */
export function setThemeColour(colour: string): void {
  let tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'theme-color';
    document.head.append(tag);
  }
  tag.content = colour;
}
