import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle } from '../src/core/classic.ts';
import { Game } from '../src/game/state.ts';

/**
 * Play every card to the cell the unique solution gives it. Such a run can
 * always be finished, so any game-over along the way is a false alarm.
 */
const solutionWalk = (level, number, jokersToPlay = 0) => {
  const p = generatePuzzle(level, number);
  const g = new Game({ level, number }, p);
  let jokersPlayed = 0;
  let falseAlarm = false;
  for (let guard = 0; guard < 500 && !g.completed; guard++) {
    if (jokersPlayed < jokersToPlay && g.jokerPile > 0 && g.hand.length < g.handSize && g.drawJoker()) {
      const idx = g.hand.findIndex((c) => c.digit === 0);
      const cell = p.solution.findIndex((_, i) => p.givens[i] === 0 && g.cardAt(i) === null);
      if (cell >= 0 && g.place({ kind: 'hand', index: idx }, cell)) {
        jokersPlayed++;
        if (!g.completable) falseAlarm = true;
      }
      continue;
    }
    let moved = false;
    for (let h = 0; h < g.hand.length && !moved; h++) {
      const card = g.hand[h];
      if (card.digit === 0) continue;
      const cell = p.solution.findIndex((d, i) => d === card.digit && p.givens[i] === 0 && g.cardAt(i) === null);
      if (cell < 0) continue;
      const r = g.place({ kind: 'hand', index: h }, cell);
      if (r) {
        if (r.killedGrid) falseAlarm = true;
        moved = true;
      }
    }
    if (!moved && g.draw() > 0) continue;
    if (!moved) break;
  }
  return { g, falseAlarm };
};

test('playing to the solution always wins, and is never called doomed', () => {
  for (const [level, number] of [[1, 3], [2, 5], [4, 2], [6, 3]]) {
    const { g, falseAlarm } = solutionWalk(level, number);
    assert.ok(g.completed, `${level}-${number}: a solution-true walk did not finish`);
    assert.ok(!falseAlarm, `${level}-${number}: a correct move was flagged as fatal`);
  }
});

test('a played joker does not make the deal look lost', () => {
  for (const [level, number] of [[1, 3], [4, 2]]) {
    for (const jokers of [1, 2]) {
      const { g, falseAlarm } = solutionWalk(level, number, jokers);
      assert.ok(!falseAlarm, `${level}-${number}: playing ${jokers} joker(s) raised a false game-over`);
      assert.ok(g.completed, `${level}-${number}: could not finish after ${jokers} joker(s)`);
    }
  }
});

test('a legal move that contradicts the solution is caught, and undo revives it', () => {
  const level = 1;
  const number = 8;
  const p = generatePuzzle(level, number);
  const g = new Game({ level, number }, p);
  let caught = false;
  outer: for (let h = 0; h < g.hand.length; h++) {
    const card = g.hand[h];
    if (card.digit === 0) continue;
    for (const cell of g.legalCells(card)) {
      if (p.solution[cell] === card.digit) continue;
      const r = g.place({ kind: 'hand', index: h }, cell);
      if (!r) continue;
      if (r.killedGrid) {
        assert.equal(g.completable, false);
        g.undo();
        assert.equal(g.completable, true, 'undo did not revive the grid');
        caught = true;
      }
      break outer;
    }
  }
  assert.ok(caught, 'no off-solution move was flagged on this deal');
});
