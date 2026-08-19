import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, LEVEL_CONFIG, JOKER_AID_EXTRA, LEVELS } from '../src/core/classic.ts';
import { Game } from '../src/game/state.ts';

const deal = (level, number, jokerCount) => {
  const p = generatePuzzle(level, number);
  return new Game({ level, number }, jokerCount === undefined ? p : { ...p, jokerCount });
};

test('undo rewinds a deal to the fresh board', () => {
  const g = deal(1, 21);
  let placed = 0;
  while (placed < 4) {
    let moved = false;
    for (let h = 0; h < g.hand.length && !moved; h++) {
      const cells = g.legalCells(g.hand[h]);
      if (cells.length) {
        g.place({ kind: 'hand', index: h }, cells[0]);
        placed++;
        moved = true;
      }
    }
    if (!moved && g.draw() === 0) break;
  }
  while (g.canUndo()) assert.ok(g.undo(), 'canUndo promised an undo that undo refused');
  assert.equal(g.score, 0);
  assert.ok(g.placed.every((c) => c === null), 'board should be clear again');
});

test('canUndo never promises an undo that undo refuses', () => {
  for (const [level, number] of [[1, 5], [2, 9], [4, 3], [6, 7]]) {
    const g = deal(level, number);
    for (let step = 0; step < 80; step++) {
      const roll = (step * 7 + level) % 10;
      if (roll < 6 && g.hand.length > 0) {
        const h = step % g.hand.length;
        const cells = g.legalCells(g.hand[h]);
        if (cells.length) g.place({ kind: 'hand', index: h }, cells[step % cells.length]);
        else g.draw();
      } else if (roll < 8) {
        if (g.draw() === 0 && g.hand.length > 0) {
          const free = g.free.findIndex((f) => f === null);
          if (free >= 0) g.stash(0, free);
        }
      } else {
        const promised = g.canUndo();
        assert.equal(g.undo(), promised, 'canUndo disagreed with what undo did');
      }
      if (g.completed || g.dead) break;
    }
    while (g.canUndo()) assert.ok(g.undo(), `${level}-${number}: refused an undo it offered`);
  }
});

test('restart keeps bank tokens already spent into the deal', () => {
  const g = deal(3, 12);
  const jokers = g.jokerPile;
  const slots = g.free.length;
  g.addBankedJokerToPile();
  g.addBankedJokerToPile();
  g.addBonusFreeSlot();
  g.place({ kind: 'hand', index: 0 }, g.legalCells(g.hand[0])[0]);
  g.restart();
  assert.equal(g.jokerPile, jokers + 2, 'spent jokers should survive a restart');
  assert.equal(g.free.length, slots + 1, 'bonus slots should survive a restart');
  assert.equal(g.score, 0);
});

test('every aid is counted, from all three sources', () => {
  const level = 1;
  const base = LEVEL_CONFIG[level].jokers;
  assert.equal(deal(level, 5, base).aidCount, 0);
  assert.equal(deal(level, 5, base + JOKER_AID_EXTRA.assist[level]).aidCount, 1, 'a dealt aid must register');

  const g = deal(level, 5, base);
  g.addBankedJokerToPile();
  g.addBonusFreeSlot();
  assert.equal(g.aidCount, 2, 'mid-deal spends count individually');
});

test('every aid setting actually adds jokers on every level', () => {
  for (const level of LEVELS) {
    assert.ok(JOKER_AID_EXTRA.assist[level] >= 1, `assist does nothing at level ${level}`);
    assert.ok(
      JOKER_AID_EXTRA.generous[level] >= JOKER_AID_EXTRA.assist[level],
      `generous is weaker than assist at level ${level}`,
    );
  }
});

test('a hint is available on the opening board of every level', () => {
  for (const level of LEVELS) {
    for (const number of [1, 2, 3]) {
      const step = deal(level, number).hintStep();
      assert.ok(step, `no hint on the opening board of ${level}-${number}`);
    }
  }
});
