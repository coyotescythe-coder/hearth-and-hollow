/** Result of a single resolved roll. Produced only by the server. */
export interface DiceRoll {
  /** e.g. "1d20+3" or "2d6" */
  expression: string;
  /** Every face rolled, in order — including both d20s on advantage. */
  rolls: number[];
  /** The die (or dice) actually counted after advantage/disadvantage. */
  kept: number[];
  modifier: number;
  total: number;
  advantage: AdvantageMode;
  /** Human-readable reason, straight from the DM's tool call. */
  purpose: string;
  /** Who the roll was for — a character/NPC name, or "DM". */
  actor: string;
  dc: number | null;
  outcome: RollOutcome | null;
}

export type AdvantageMode = "none" | "advantage" | "disadvantage";

export type RollOutcome = "critical-success" | "success" | "failure" | "critical-failure";

export interface ParsedDice {
  count: number;
  sides: number;
  modifier: number;
}

const DICE_PATTERN = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i;

/** Parses "2d6+3", "d20", "1d8-1". Throws on anything else. */
export function parseDice(expression: string): ParsedDice {
  const match = DICE_PATTERN.exec(expression);
  if (!match) {
    throw new Error(`Unrecognised dice expression: "${expression}"`);
  }
  const count = match[1] === "" ? 1 : Number.parseInt(match[1]!, 10);
  const sides = Number.parseInt(match[2]!, 10);
  const modifier = match[3] ? Number.parseInt(match[3].replace(/\s+/g, ""), 10) : 0;

  if (count < 1 || count > 100) throw new Error(`Dice count out of range: ${count}`);
  if (sides < 2 || sides > 1000) throw new Error(`Die size out of range: d${sides}`);

  return { count, sides, modifier };
}

export function formatDice({ count, sides, modifier }: ParsedDice): string {
  const mod = modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : `${modifier}`;
  return `${count}d${sides}${mod}`;
}
