import {
  abilityModifier,
  proficiencyBonus,
  type Ability,
  type Character,
  type CombatState,
  type DiceRoll,
  type Scene,
} from "@dnd/shared";
import { outcomeFor, rollD20, rollExpression } from "../dice/roll.js";
import { combatIsOver, rollInitiative, type CombatantSeed } from "../game/combat.js";
import * as repo from "../db/repositories.js";

/**
 * The DM's hands. Every one of these runs on the server: the model decides
 * *whether* to roll and against what DC, but the number itself is ours.
 */

export interface ToolContext {
  sessionId: string;
  emitRoll(roll: DiceRoll): void;
  emitCharacter(character: Character): void;
  emitCombat(combat: CombatState | null): void;
  emitScene(scene: Scene): void;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
}

const ABILITY_ENUM: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Strict tool schemas: every property is listed in `required` and optional
 * values are expressed as nullable, which is what `strict: true` demands.
 */
export const DM_TOOLS = [
  {
    name: "roll_check",
    description:
      "Roll a d20 ability check, saving throw, or attack for a PLAYER CHARACTER. The server applies the character's ability modifier and reports the result. Use this whenever a player character attempts something whose outcome is uncertain.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        character: { type: "string", description: "Exact name of the player character rolling." },
        ability: { type: "string", enum: ABILITY_ENUM, description: "Ability the check is based on." },
        purpose: {
          type: "string",
          description: "Short description of what they are attempting, e.g. 'pick the rusted lock'.",
        },
        dc: {
          type: ["integer", "null"],
          description: "Difficulty class to beat: 10 routine, 15 moderate, 20 hard, 25 near-impossible. Use the target's AC for an attack roll.",
        },
        advantage: {
          type: "string",
          enum: ["none", "advantage", "disadvantage"],
          description: "Roll two dice and keep the better/worse one when circumstances warrant.",
        },
        proficient: {
          type: "boolean",
          description: "True if the character's training clearly applies; adds their proficiency bonus.",
        },
      },
      required: ["character", "ability", "purpose", "dc", "advantage", "proficient"],
      additionalProperties: false,
    },
  },
  {
    name: "roll_dice",
    description:
      "Roll arbitrary dice: damage, monster attack rolls, or any roll not tied to a player character's ability score. Include the modifier in the expression.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        dice: { type: "string", description: "Dice expression such as '2d6+3', '1d20+5', 'd8'." },
        purpose: { type: "string", description: "What this roll is for, e.g. 'goblin scimitar damage'." },
        actor: { type: "string", description: "Who is rolling, e.g. 'Goblin Scout' or 'DM'." },
        dc: {
          type: ["integer", "null"],
          description: "If this is an attack roll, the target's AC; otherwise null.",
        },
      },
      required: ["dice", "purpose", "actor", "dc"],
      additionalProperties: false,
    },
  },
  {
    name: "update_character",
    description:
      "Apply HP changes and conditions to any combatant — player character or NPC/monster. Damage or healing that is not applied here did not happen.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        character: { type: "string", description: "Exact name of the player character or NPC." },
        hp_delta: {
          type: ["integer", "null"],
          description: "Negative for damage, positive for healing. Null to leave HP unchanged.",
        },
        add_conditions: {
          type: "array",
          items: { type: "string" },
          description: "Conditions to add, e.g. ['poisoned']. Empty array if none.",
        },
        remove_conditions: {
          type: "array",
          items: { type: "string" },
          description: "Conditions to clear. Empty array if none.",
        },
      },
      required: ["character", "hp_delta", "add_conditions", "remove_conditions"],
      additionalProperties: false,
    },
  },
  {
    name: "start_combat",
    description:
      "Begin structured combat. List every enemy; all player characters are added automatically. The server rolls initiative and owns turn order from here on.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        enemies: {
          type: "array",
          description: "The hostile combatants.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Distinct name, e.g. 'Goblin Scout' or 'Goblin Scout B'." },
              hp: { type: "integer", description: "Max hit points. A weak minion is 5-10, a tough brute 25-40." },
              ac: { type: "integer", description: "Armour class, usually 10-18." },
              dex_mod: { type: "integer", description: "Dexterity modifier for initiative, usually -1 to +4." },
            },
            required: ["name", "hp", "ac", "dex_mod"],
            additionalProperties: false,
          },
        },
      },
      required: ["enemies"],
      additionalProperties: false,
    },
  },
  {
    name: "end_combat",
    description: "End the current fight once one side is defeated, surrenders, or flees.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        outcome: { type: "string", description: "One line on how the fight ended." },
      },
      required: ["outcome"],
      additionalProperties: false,
    },
  },
  {
    name: "update_scene",
    description:
      "Record durable world state: where the party is, the current situation, and established facts. This is your long-term memory — anything not recorded here may be lost once older narration is compacted.",
    strict: true,
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: ["string", "null"], description: "Where the party is now." },
        summary: { type: ["string", "null"], description: "One or two sentences on the current situation." },
        flags: {
          type: "array",
          description: "Durable facts as key/value pairs, e.g. {key:'quest', value:'find the missing miller'}.",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: "string" },
            },
            required: ["key", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["location", "summary", "flags"],
      additionalProperties: false,
    },
  },
];

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim()) : [];

function knownCombatantNames(sessionId: string): string {
  const names = repo.getCharacters(sessionId).map((c) => c.name);
  const combat = repo.getCombat(sessionId);
  if (combat) names.push(...combat.participants.filter((p) => p.isNpc).map((p) => p.name));
  return names.join(", ") || "(none)";
}

/** Mirrors a character's HP into the live combat row so both views agree. */
function syncCharacterIntoCombat(ctx: ToolContext, character: Character): CombatState | null {
  const combat = repo.getCombat(ctx.sessionId);
  if (!combat) return null;
  const idx = combat.participants.findIndex((p) => p.characterId === character.id);
  if (idx === -1) return combat;

  const participants = combat.participants.map((p, i) =>
    i === idx ? { ...p, hpCurrent: character.hpCurrent, hpMax: character.hpMax } : p,
  );
  const next = { ...combat, participants };
  repo.saveCombat(ctx.sessionId, next);
  return next;
}

export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const input = (rawInput ?? {}) as Record<string, unknown>;

  switch (name) {
    case "roll_check":
      return rollCheck(input, ctx);
    case "roll_dice":
      return rollArbitrary(input, ctx);
    case "update_character":
      return updateCombatant(input, ctx);
    case "start_combat":
      return startCombat(input, ctx);
    case "end_combat":
      return endCombat(input, ctx);
    case "update_scene":
      return updateSceneTool(input, ctx);
    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}

function rollCheck(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const name = asString(input.character);
  const character = repo.findCharacterByName(ctx.sessionId, name);
  if (!character) {
    return {
      content: `No player character named "${name}". Known combatants: ${knownCombatantNames(ctx.sessionId)}. Use roll_dice for NPCs.`,
      isError: true,
    };
  }

  const ability = (ABILITY_ENUM.includes(input.ability as Ability) ? input.ability : "dex") as Ability;
  const advantage =
    input.advantage === "advantage" || input.advantage === "disadvantage" ? input.advantage : "none";
  const proficient = input.proficient === true;

  const modifier =
    abilityModifier(character.abilities[ability]) +
    (proficient ? proficiencyBonus(character.level) : 0);

  const raw = rollD20(modifier, advantage);
  const dc = asInt(input.dc);
  const outcome = outcomeFor(raw, dc, true);

  const roll: DiceRoll = {
    expression: raw.expression,
    rolls: raw.rolls,
    kept: raw.kept,
    modifier: raw.modifier,
    total: raw.total,
    advantage,
    purpose: asString(input.purpose) || `${ability.toUpperCase()} check`,
    actor: character.name,
    dc,
    outcome,
  };
  ctx.emitRoll(roll);

  return {
    content: JSON.stringify({
      actor: character.name,
      natural_die: raw.kept[0],
      modifier,
      total: raw.total,
      dc,
      outcome: outcome ?? "no DC set — you decide what this total accomplishes",
    }),
  };
}

function rollArbitrary(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const expression = asString(input.dice);
  try {
    const raw = rollExpression(expression);
    const dc = asInt(input.dc);
    const isD20 = /d20/i.test(expression);
    const outcome = outcomeFor(raw, dc, isD20);

    const roll: DiceRoll = {
      expression: raw.expression,
      rolls: raw.rolls,
      kept: raw.kept,
      modifier: raw.modifier,
      total: raw.total,
      advantage: "none",
      purpose: asString(input.purpose) || "roll",
      actor: asString(input.actor) || "DM",
      dc,
      outcome,
    };
    ctx.emitRoll(roll);

    return {
      content: JSON.stringify({
        actor: roll.actor,
        dice: raw.expression,
        rolls: raw.rolls,
        total: raw.total,
        dc,
        outcome,
      }),
    };
  } catch (error) {
    return {
      content: `Could not roll "${expression}": ${(error as Error).message}. Use a form like "2d6+3".`,
      isError: true,
    };
  }
}

function updateCombatant(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const name = asString(input.character);
  const delta = asInt(input.hp_delta) ?? 0;
  const add = asStringArray(input.add_conditions);
  const remove = asStringArray(input.remove_conditions).map((c) => c.toLowerCase());

  const character = repo.findCharacterByName(ctx.sessionId, name);

  if (character) {
    const conditions = [
      ...character.conditions.filter((c) => !remove.includes(c.toLowerCase())),
      ...add.filter((c) => !character.conditions.some((e) => e.toLowerCase() === c.toLowerCase())),
    ];
    const updated = repo.updateCharacterVitals(character.id, {
      hpCurrent: character.hpCurrent + delta,
      conditions,
    });
    if (!updated) return { content: `Could not update ${name}.`, isError: true };

    ctx.emitCharacter(updated);
    const combat = syncCharacterIntoCombat(ctx, updated);
    if (combat) ctx.emitCombat(combat);

    return {
      content: JSON.stringify({
        name: updated.name,
        hp: `${updated.hpCurrent}/${updated.hpMax}`,
        conditions: updated.conditions,
        status: updated.hpCurrent <= 0 ? "unconscious and dying" : "still standing",
      }),
    };
  }

  // Not a player character — try the NPC side of the initiative order.
  const combat = repo.getCombat(ctx.sessionId);
  const target = combat?.participants.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!combat || !target) {
    return {
      content: `No combatant named "${name}". Known combatants: ${knownCombatantNames(ctx.sessionId)}.`,
      isError: true,
    };
  }

  const hpCurrent = Math.max(0, Math.min(target.hpMax, target.hpCurrent + delta));
  const next: CombatState = {
    ...combat,
    participants: combat.participants.map((p) => (p.id === target.id ? { ...p, hpCurrent } : p)),
  };
  repo.saveCombat(ctx.sessionId, next);
  ctx.emitCombat(next);

  return {
    content: JSON.stringify({
      name: target.name,
      hp: `${hpCurrent}/${target.hpMax}`,
      status: hpCurrent <= 0 ? "defeated" : "still fighting",
      combat_over: combatIsOver(next),
    }),
  };
}

function startCombat(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const enemiesRaw = Array.isArray(input.enemies) ? input.enemies : [];
  const enemies: CombatantSeed[] = enemiesRaw.flatMap((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = asString(e.name);
    if (!name) return [];
    const hp = Math.max(1, asInt(e.hp) ?? 8);
    return [
      {
        name,
        isNpc: true,
        characterId: null,
        dexMod: asInt(e.dex_mod) ?? 0,
        hpMax: hp,
        hpCurrent: hp,
        ac: Math.max(5, asInt(e.ac) ?? 12),
      },
    ];
  });

  if (enemies.length === 0) {
    return { content: "start_combat needs at least one enemy with a name.", isError: true };
  }

  const heroes: CombatantSeed[] = repo.getCharacters(ctx.sessionId).map((c) => ({
    name: c.name,
    isNpc: false,
    characterId: c.id,
    dexMod: abilityModifier(c.abilities.dex),
    hpMax: c.hpMax,
    hpCurrent: c.hpCurrent,
    ac: c.ac,
  }));

  const participants = rollInitiative([...heroes, ...enemies]);
  const combat: CombatState = { active: true, round: 1, currentTurnIdx: 0, participants };
  repo.saveCombat(ctx.sessionId, combat);
  ctx.emitCombat(combat);

  return {
    content: JSON.stringify({
      order: participants.map((p) => `${p.initiative} ${p.name}${p.isNpc ? " (NPC)" : ""}`),
      up_first: participants[0]?.name,
      note: "The table now owns turn order. Narrate only the current combatant's turn, then stop.",
    }),
  };
}

function endCombat(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  repo.endCombat(ctx.sessionId);
  ctx.emitCombat(null);
  return { content: JSON.stringify({ ended: true, outcome: asString(input.outcome) }) };
}

function updateSceneTool(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  const flagsRaw = Array.isArray(input.flags) ? input.flags : [];
  const flags: Record<string, string> = {};
  for (const entry of flagsRaw) {
    const f = (entry ?? {}) as Record<string, unknown>;
    const key = asString(f.key);
    if (key) flags[key] = asString(f.value);
  }

  const location = typeof input.location === "string" ? input.location.trim() : undefined;
  const summary = typeof input.summary === "string" ? input.summary.trim() : undefined;

  const scene = repo.updateScene(ctx.sessionId, { location, summary, flags });
  ctx.emitScene(scene);
  return { content: JSON.stringify({ recorded: true, scene }) };
}
