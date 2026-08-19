import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, LEVEL_CONFIG, LEVELS } from '../src/core/classic.ts';
import { dealTarget, trophyBands, trophyForTarget, SUPERSTAR_TIER } from '../src/core/scoring.ts';
import { Game } from '../src/game/state.ts';

const targetOf = (level, number) => {
  const p = generatePuzzle(level, number);
  return dealTarget(p, LEVEL_CONFIG[level].jokers, p.seed % 4);
};

test('every trophy band is reachable, and none is free', () => {
  for (const level of LEVELS) {
    for (const number of [1, 7]) {
      const t = targetOf(level, number);
      const bands = trophyBands(t);
      const floor = t.cards + t.units;
      assert.ok(bands[1] > floor, `${level}-${number}: Bronze costs no more than finishing`);
      assert.ok(bands[4] < t.total, `${level}-${number}: Diamond is beyond what the deal pays`);
      for (let tier = 2; tier <= 4; tier++) {
        assert.ok(bands[tier] > bands[tier - 1], `${level}-${number}: bands are out of order`);
      }
    }
  }
});

test('Superstar needs a score past the grid target, not merely equal to it', () => {
  const t = targetOf(3, 2);
  assert.notEqual(trophyForTarget(t, t.total), SUPERSTAR_TIER);
  assert.equal(trophyForTarget(t, t.total + 1), SUPERSTAR_TIER);
});

test('the target ignores aid jokers, so help is headroom rather than a higher bar', () => {
  const level = 3;
  const p = generatePuzzle(level, 9);
  const base = LEVEL_CONFIG[level].jokers;
  const plain = new Game({ level, number: 9 }, { ...p, jokerCount: base });
  const aided = new Game({ level, number: 9 }, { ...p, jokerCount: base + 3 });
  assert.equal(aided.target().total, plain.target().total, 'a dealt aid moved the target');
  assert.equal(aided.jokerPile, base + 3, 'the aid did not reach the table');

  plain.addBankedJokerToPile();
  assert.equal(plain.target().total, aided.target().total, 'a mid-deal joker moved the target');
});
