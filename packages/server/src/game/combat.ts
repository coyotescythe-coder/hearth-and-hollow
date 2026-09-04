import { randomUUID } from "node:crypto";
import type { CombatParticipant, CombatState } from "@dnd/shared";
import { cryptoRng, rollD20, type Rng } from "../dice/roll.js";

/**
 * Turn order is server-owned. The DM decides *that* a fight starts and who is
 * in it; it never decides who acts when — that keeps the model from quietly
 * losing track of initiative halfway through a brawl.
 */

export interface CombatantSeed {
  name: string;
  isNpc: boolean;
  characterId: string | null;
  dexMod: number;
  hpMax: number;
  hpCurrent: number;
  ac: number;
}

export function rollInitiative(seeds: CombatantSeed[], rng: Rng = cryptoRng): CombatParticipant[] {
  const rolled = seeds.map((seed) => ({
    seed,
    initiative: rollD20(seed.dexMod, "none", rng).total,
  }));

  // Highest initiative first; ties broken by DEX, then name for determinism.
  rolled.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.seed.dexMod !== a.seed.dexMod) return b.seed.dexMod - a.seed.dexMod;
    return a.seed.name.localeCompare(b.seed.name);
  });

  return rolled.map(({ seed, initiative }, idx) => ({
    id: randomUUID(),
    characterId: seed.characterId,
    name: seed.name,
    isNpc: seed.isNpc,
    initiative,
    hpCurrent: seed.hpCurrent,
    hpMax: seed.hpMax,
    ac: seed.ac,
    turnOrderIdx: idx,
  }));
}

export function currentParticipant(combat: CombatState): CombatParticipant | null {
  return combat.participants[combat.currentTurnIdx] ?? null;
}

export function isConscious(p: CombatParticipant): boolean {
  return p.hpCurrent > 0;
}

/**
 * Advances to the next conscious combatant, incrementing the round on wrap.
 * Returns the combat unchanged if nobody is left standing — the caller ends
 * the fight in that case.
 */
export function advanceTurn(combat: CombatState): CombatState {
  const count = combat.participants.length;
  if (count === 0 || !combat.participants.some(isConscious)) return combat;

  let idx = combat.currentTurnIdx;
  let round = combat.round;

  for (let step = 0; step < count; step += 1) {
    idx += 1;
    if (idx >= count) {
      idx = 0;
      round += 1;
    }
    if (isConscious(combat.participants[idx]!)) {
      return { ...combat, currentTurnIdx: idx, round };
    }
  }

  return combat;
}

/** True once one side has no conscious members left. */
export function combatIsOver(combat: CombatState): boolean {
  const heroesUp = combat.participants.some((p) => !p.isNpc && isConscious(p));
  const foesUp = combat.participants.some((p) => p.isNpc && isConscious(p));
  return !heroesUp || !foesUp;
}
