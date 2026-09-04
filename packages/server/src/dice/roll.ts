import { randomInt } from "node:crypto";
import { parseDice, type AdvantageMode, type RollOutcome } from "@dnd/shared";

/**
 * Every random number in this game comes from here — never from the model.
 * `Rng` is injectable so tests can be deterministic.
 */
export type Rng = (sides: number) => number;

export const cryptoRng: Rng = (sides) => randomInt(1, sides + 1);

export interface RawRoll {
  expression: string;
  rolls: number[];
  kept: number[];
  modifier: number;
  total: number;
}

export function rollExpression(expression: string, rng: Rng = cryptoRng): RawRoll {
  const { count, sides, modifier } = parseDice(expression);
  const rolls = Array.from({ length: count }, () => rng(sides));
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  return { expression, rolls, kept: rolls, modifier, total };
}

/**
 * A d20 check. Advantage/disadvantage rolls twice and keeps the better/worse
 * die — both dice are reported so the UI can show what was discarded.
 */
export function rollD20(
  modifier: number,
  advantage: AdvantageMode = "none",
  rng: Rng = cryptoRng,
): RawRoll {
  const rolls = advantage === "none" ? [rng(20)] : [rng(20), rng(20)];
  const natural =
    advantage === "advantage"
      ? Math.max(...rolls)
      : advantage === "disadvantage"
        ? Math.min(...rolls)
        : rolls[0]!;

  const sign = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  return {
    expression: `1d20${modifier === 0 ? "" : sign}`,
    rolls,
    kept: [natural],
    modifier,
    total: natural + modifier,
  };
}

/**
 * Natural 20/1 on a d20 are crits regardless of DC; everything else compares
 * the total against the DC. Non-d20 rolls (damage) have no outcome.
 */
export function outcomeFor(
  raw: RawRoll,
  dc: number | null,
  isD20: boolean,
): RollOutcome | null {
  if (!isD20) return null;
  const natural = raw.kept[0]!;
  if (natural === 20) return "critical-success";
  if (natural === 1) return "critical-failure";
  if (dc === null) return null;
  return raw.total >= dc ? "success" : "failure";
}
