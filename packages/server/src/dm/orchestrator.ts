import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import type { Character, CombatState, DiceRoll, GameMessage, Scene } from "@dnd/shared";
import { config } from "../config.js";
import * as repo from "../db/repositories.js";
import { getClient } from "./client.js";
import { buildStateBlock, DM_SYSTEM_PROMPT, historyToTurns } from "./prompt.js";
import { compactIfNeeded } from "./summarizer.js";
import { DM_TOOLS, executeTool, type ToolContext } from "./tools.js";

/**
 * Runs one DM turn: stream narration, execute any tools the model calls
 * (rolling real dice server-side), feed the results back, and keep going until
 * the model stops asking for tools.
 */

export interface DmHooks {
  onNarrationStart(streamId: string): void;
  onNarrationDelta(streamId: string, text: string): void;
  onNarrationEnd(streamId: string, message: GameMessage | null): void;
  onRoll(roll: DiceRoll): void;
  onCharacter(character: Character): void;
  onCombat(combat: CombatState | null): void;
  onScene(scene: Scene): void;
  onSystem(message: GameMessage): void;
}

/** One assistant/user turn as the API sees it. Content stays opaque so
 *  thinking and tool_use blocks round-trip untouched. */
export interface ApiTurn {
  role: "user" | "assistant";
  content: unknown;
}

export interface ApiResult {
  content: Array<Record<string, unknown>>;
  stop_reason: string | null;
}

/** The single point where this module touches the Anthropic SDK. */
export type StreamTurn = (
  params: { system: string; messages: ApiTurn[] },
  onText: (delta: string) => void,
) => Promise<ApiResult>;

const MAX_TOOL_ITERATIONS = 8;

export const streamViaAnthropic: StreamTurn = async (params, onText) => {
  const stream = getClient().beta.messages.stream({
    model: config.dmModel,
    max_tokens: 4000,
    system: params.system,
    thinking: { type: "adaptive" },
    output_config: { effort: config.dmEffort },
    // Opus 5 can decline a request outright; server-side fallbacks keep the
    // game moving instead of dropping the turn on the floor.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: DM_TOOLS,
    // Content blocks (thinking, tool_use) round-trip opaquely through ApiTurn.
    messages: params.messages as Anthropic.Beta.BetaMessageParam[],
  });

  stream.on("text", (delta: string) => onText(delta));

  const message = await stream.finalMessage();
  return {
    content: message.content as unknown as Array<Record<string, unknown>>,
    stop_reason: message.stop_reason ?? null,
  };
};

export async function runDmTurn(
  sessionId: string,
  trigger: string,
  hooks: DmHooks,
  streamTurn: StreamTurn = streamViaAnthropic,
): Promise<void> {
  try {
    await compactIfNeeded(sessionId);
  } catch (error) {
    // A failed compaction is not worth losing the player's turn over.
    console.warn("[dm] history compaction failed:", (error as Error).message);
  }

  const session = repo.getSession(sessionId);
  if (!session) return;

  const state = buildStateBlock({
    scene: session.scene,
    characters: repo.getCharacters(sessionId),
    players: repo.getPlayers(sessionId),
    combat: repo.getCombat(sessionId),
  });

  const messages: ApiTurn[] = [
    ...historyToTurns(repo.getLiveMessages(sessionId)),
    { role: "user", content: `${state}\n\n${trigger}` },
  ];

  // The very first turn of a campaign has no history; the API needs the
  // conversation to open with a user turn, which the trigger above satisfies.

  const toolCtx: ToolContext = {
    sessionId,
    emitRoll: hooks.onRoll,
    emitCharacter: hooks.onCharacter,
    emitCombat: hooks.onCombat,
    emitScene: hooks.onScene,
  };

  const streamId = randomUUID();
  hooks.onNarrationStart(streamId);

  let narration = "";
  let refused = false;

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const result = await streamTurn({ system: DM_SYSTEM_PROMPT, messages }, (delta) => {
        narration += delta;
        hooks.onNarrationDelta(streamId, delta);
      });

      if (result.stop_reason === "refusal") {
        refused = true;
        break;
      }

      if (result.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: result.content });
        continue;
      }

      const toolUses = result.content.filter((block) => block.type === "tool_use");
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: result.content });

      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of toolUses) {
        const outcome = await executeTool(
          String(block.name),
          block.input,
          toolCtx,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  } catch (error) {
    hooks.onNarrationEnd(streamId, null);
    const note = repo.addMessage(
      sessionId,
      "system",
      "System",
      `The DM stumbled: ${(error as Error).message}`,
    );
    hooks.onSystem(note);
    return;
  }

  if (refused) {
    hooks.onNarrationEnd(streamId, null);
    const note = repo.addMessage(
      sessionId,
      "system",
      "System",
      "The DM declined to narrate that. Try steering the scene a different way.",
    );
    hooks.onSystem(note);
    return;
  }

  const text = narration.trim();
  if (!text) {
    hooks.onNarrationEnd(streamId, null);
    return;
  }

  const message = repo.addMessage(sessionId, "dm", "DM", text);
  hooks.onNarrationEnd(streamId, message);
}
