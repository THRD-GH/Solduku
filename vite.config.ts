import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Short commit of the build, or 'dev' outside a git checkout. */
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// `base` is relative so the built site works from any sub-path
// (GitHub Pages project sites, file://, a nested static host, ...).
export default defineConfig({
  base: './',
  define: {
    // Stamped in at build time and shown on the menu, so it is obvious which
    // build a phone is actually running after a deploy.
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
  },
});
