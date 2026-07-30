import { generatePuzzle } from '../core/classic.ts';
import type { Level } from '../core/types.ts';

interface Request {
  token: number;
  level: Level;
  number: number;
}

// Typed by hand rather than pulling the WebWorker lib in alongside DOM.
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

ctx.onmessage = (e: MessageEvent) => {
  const { token, level, number } = e.data as Request;
  try {
    ctx.postMessage({ token, puzzle: generatePuzzle(level, number) });
  } catch (err) {
    ctx.postMessage({ token, error: err instanceof Error ? err.message : String(err) });
  }
};
