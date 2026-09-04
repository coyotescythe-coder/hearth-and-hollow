import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDice } from "@dnd/shared";
import { outcomeFor, rollD20, rollExpression, type Rng } from "./roll.js";

/** Feeds a fixed sequence of die faces so assertions are exact. */
function scriptedRng(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

test("parseDice reads counts, sides and modifiers", () => {
  assert.deepEqual(parseDice("2d6+3"), { count: 2, sides: 6, modifier: 3 });
  assert.deepEqual(parseDice("d20"), { count: 1, sides: 20, modifier: 0 });
  assert.deepEqual(parseDice("1d8-1"), { count: 1, sides: 8, modifier: -1 });
  assert.throws(() => parseDice("banana"));
  assert.throws(() => parseDice("0d6"));
});

test("rollExpression sums every die plus the modifier", () => {
  const raw = rollExpression("3d6+2", scriptedRng(4, 5, 6));
  assert.deepEqual(raw.rolls, [4, 5, 6]);
  assert.equal(raw.total, 17);
});

test("rollExpression stays inside the die's range", () => {
  for (let i = 0; i < 200; i += 1) {
    const raw = rollExpression("1d20");
    assert.ok(raw.rolls[0]! >= 1 && raw.rolls[0]! <= 20, `out of range: ${raw.rolls[0]}`);
  }
});

test("advantage keeps the higher die, disadvantage the lower", () => {
  const adv = rollD20(3, "advantage", scriptedRng(7, 18));
  assert.deepEqual(adv.rolls, [7, 18]);
  assert.deepEqual(adv.kept, [18]);
  assert.equal(adv.total, 21);

  const dis = rollD20(3, "disadvantage", scriptedRng(7, 18));
  assert.deepEqual(dis.kept, [7]);
  assert.equal(dis.total, 10);
});

test("natural 20 and 1 are crits regardless of DC", () => {
  const nat20 = rollD20(0, "none", scriptedRng(20));
  assert.equal(outcomeFor(nat20, 30, true), "critical-success");

  const nat1 = rollD20(10, "none", scriptedRng(1));
  assert.equal(outcomeFor(nat1, 5, true), "critical-failure");
});

test("ordinary rolls compare the total against the DC", () => {
  const hit = rollD20(5, "none", scriptedRng(10));
  assert.equal(outcomeFor(hit, 15, true), "success");
  assert.equal(outcomeFor(hit, 16, true), "failure");
  // Damage rolls have no pass/fail.
  assert.equal(outcomeFor(rollExpression("2d6"), null, false), null);
});
