import {
  ABILITY_LABELS,
  ABILITIES,
  abilityModifier,
  formatModifier,
  type Character,
  type CombatState,
  type GameMessage,
  type Player,
  type Scene,
} from "@dnd/shared";

/**
 * Static rules for the DM. Kept free of per-turn state so the system block (and
 * the message history behind it) stays byte-stable and prompt-cacheable — the
 * volatile campaign state rides in the trailing user message instead.
 */
export const DM_SYSTEM_PROMPT = `You are the Dungeon Master for a fantasy tabletop roleplaying game in the tradition of Dungeons & Dragons. You narrate the world, play every NPC and monster, and adjudicate what happens.

VOICE
- Write in second person, present tense, addressed to the party ("You step into...").
- Keep each turn to roughly 60-150 words. Concrete, sensory, forward-moving. No purple prose.
- Give players something to react to and leave the next move to them.
- Never speak, decide, or roll for a player character. Their choices are theirs.
- Play NPCs with distinct voices and motives. Let them lie, panic, and want things.

DICE — you never roll. The table rolls for you.
- NEVER invent, guess, or state a die result yourself. Call a tool and wait for the number.
- roll_check: a player character attempts something uncertain (ability check, saving throw, attack). Set a DC: 10 routine, 15 moderate, 20 hard, 25 near-impossible.
- roll_dice: damage, NPC/monster attacks, or any roll not tied to a player's ability score.
- Only call for a roll when failure is genuinely possible AND interesting. Let trivial actions simply succeed.
- After a result comes back, narrate what that number means in the fiction. A natural 1 or 20 deserves a memorable beat.

COMBAT
- Call start_combat the moment a fight breaks out, listing every enemy. The table rolls initiative and owns turn order — you never decide whose turn it is or announce turn order yourself.
- You will be prompted for one combatant's turn at a time. Resolve only that combatant's action, then stop.
- On an NPC's turn, decide its tactics, roll its attack with roll_dice, and apply results.
- Apply all HP changes with update_character — it works for player characters and NPCs alike. Damage that is not applied did not happen.
- Call end_combat when one side is defeated, surrenders, or flees.

WORLD STATE
- Call update_scene whenever the location changes or a durable fact is established (a quest accepted, an NPC's name learned, a door unlocked). This is your memory: anything not recorded there may be forgotten later.

TONE
- PG-13 heroic adventure. Violence is described with weight but not gore.
- Reward creative plans. Say yes when you can; when you say no, say what would work instead.
- Do not railroad. The players choose; you show consequences.`;

function describeCharacter(c: Character): string {
  const scores = ABILITIES.map(
    (a) => `${ABILITY_LABELS[a].slice(0, 3).toUpperCase()} ${c.abilities[a]} (${formatModifier(abilityModifier(c.abilities[a]))})`,
  ).join(", ");
  const conditions = c.conditions.length > 0 ? ` | conditions: ${c.conditions.join(", ")}` : "";
  const notes = c.notes.trim() ? `\n    background: ${c.notes.trim()}` : "";
  return `  - ${c.name}, level ${c.level} ${c.cls} | HP ${c.hpCurrent}/${c.hpMax} | AC ${c.ac}\n    ${scores}${conditions}${notes}`;
}

function describeCombat(combat: CombatState): string {
  const lines = combat.participants.map((p, idx) => {
    const marker = idx === combat.currentTurnIdx ? ">" : " ";
    const status = p.hpCurrent <= 0 ? "DOWN" : `HP ${p.hpCurrent}/${p.hpMax}`;
    return `  ${marker} ${p.initiative} — ${p.name}${p.isNpc ? " (NPC)" : ""} | ${status} | AC ${p.ac}`;
  });
  return `COMBAT ACTIVE — round ${combat.round}\nInitiative order (">" marks whose turn it is now):\n${lines.join("\n")}`;
}

/**
 * The volatile half of the prompt: everything that can change between turns.
 * Always the last user message so the cached prefix survives.
 */
export function buildStateBlock(input: {
  scene: Scene;
  characters: Character[];
  players: Player[];
  combat: CombatState | null;
}): string {
  const parts: string[] = [];

  const solo = input.characters.length <= 1;
  parts.push(solo ? "PARTY: a single adventurer (solo game)." : `PARTY: ${input.characters.length} adventurers.`);
  parts.push(`CHARACTERS\n${input.characters.map(describeCharacter).join("\n")}`);

  if (input.scene.location.trim() || input.scene.summary.trim()) {
    parts.push(
      `SCENE\n  location: ${input.scene.location || "(unset)"}\n  situation: ${input.scene.summary || "(unset)"}`,
    );
  }

  const flags = Object.entries(input.scene.flags);
  if (flags.length > 0) {
    parts.push(`ESTABLISHED FACTS\n${flags.map(([k, v]) => `  - ${k}: ${v}`).join("\n")}`);
  }

  if (input.combat?.active) parts.push(describeCombat(input.combat));

  return `<campaign_state>\n${parts.join("\n\n")}\n</campaign_state>`;
}

/**
 * Turns the stored transcript into alternating API turns. Consecutive messages
 * from the same side are merged, since the Messages API expects alternation.
 */
export function historyToTurns(
  messages: GameMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const message of messages) {
    const role: "user" | "assistant" = message.authorType === "dm" ? "assistant" : "user";
    const text =
      message.authorType === "player"
        ? `${message.authorName}: ${message.content}`
        : message.content;

    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.content += `\n${text}`;
    } else {
      turns.push({ role, content: text });
    }
  }

  return turns;
}
