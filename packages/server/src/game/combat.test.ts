import { test } from "node:test";
import assert from "node:assert/strict";
import type { CombatParticipant, CombatState } from "@dnd/shared";
import { advanceTurn, combatIsOver, rollInitiative, type CombatantSeed } from "./combat.js";
import type { Rng } from "../dice/roll.js";

function scriptedRng(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function seed(name: string, isNpc: boolean, dexMod = 0): CombatantSeed {
  return { name, isNpc, characterId: isNpc ? null : `char-${name}`, dexMod, hpMax: 10, hpCurrent: 10, ac: 12 };
}

function participant(name: string, isNpc: boolean, hpCurrent: number, idx: number): CombatParticipant {
  return {
    id: `p-${name}`,
    characterId: isNpc ? null : `char-${name}`,
    name,
    isNpc,
    initiative: 10,
    hpCurrent,
    hpMax: 10,
    ac: 12,
    turnOrderIdx: idx,
  };
}

function combatWith(participants: CombatParticipant[], currentTurnIdx = 0): CombatState {
  return { active: true, round: 1, currentTurnIdx, participants };
}

test("initiative sorts highest first and indexes the order", () => {
  const order = rollInitiative([seed("Rogue", false, 3), seed("Goblin", true, 1)], scriptedRng(5, 19));
  // Rogue rolled 5+3=8, Goblin rolled 19+1=20.
  assert.deepEqual(
    order.map((p) => p.name),
    ["Goblin", "Rogue"],
  );
  assert.deepEqual(
    order.map((p) => p.turnOrderIdx),
    [0, 1],
  );
});

test("initiative ties break on dex modifier", () => {
  // Both roll 10; Rogue's higher DEX wins the tie.
  const order = rollInitiative([seed("Brute", true, 0), seed("Rogue", false, 4)], scriptedRng(14, 10));
  assert.equal(order[0]!.name, "Rogue");
});

test("advanceTurn wraps and increments the round", () => {
  const combat = combatWith([participant("A", false, 10, 0), participant("B", true, 10, 1)], 1);
  const next = advanceTurn(combat);
  assert.equal(next.currentTurnIdx, 0);
  assert.equal(next.round, 2);
});

test("advanceTurn skips downed combatants", () => {
  const combat = combatWith(
    [participant("A", false, 10, 0), participant("Downed", true, 0, 1), participant("C", true, 4, 2)],
    0,
  );
  assert.equal(advanceTurn(combat).currentTurnIdx, 2);
});

test("advanceTurn leaves combat untouched when nobody is standing", () => {
  const combat = combatWith([participant("A", false, 0, 0), participant("B", true, 0, 1)], 0);
  assert.deepEqual(advanceTurn(combat), combat);
});

test("combat ends when one side is wiped out", () => {
  assert.equal(combatIsOver(combatWith([participant("Hero", false, 5, 0), participant("Orc", true, 3, 1)])), false);
  assert.equal(combatIsOver(combatWith([participant("Hero", false, 5, 0), participant("Orc", true, 0, 1)])), true);
  assert.equal(combatIsOver(combatWith([participant("Hero", false, 0, 0), participant("Orc", true, 3, 1)])), true);
});
