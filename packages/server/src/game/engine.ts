import type { SessionSnapshot } from "@dnd/shared";
import * as repo from "../db/repositories.js";
import * as hub from "../ws/hub.js";
import { runDmTurn, type DmHooks, type StreamTurn } from "../dm/orchestrator.js";
import { advanceTurn, combatIsOver, currentParticipant } from "./combat.js";

/**
 * Owns the flow of play: collects player actions, decides when the DM should
 * take a turn, and walks the initiative order during combat.
 *
 * Solo and multiplayer are the same path — a session simply has 1..N players,
 * and "wait for everyone to act" resolves instantly when N is 1.
 */

interface Runtime {
  /** Actions submitted this beat, keyed by player id. */
  pending: Map<string, string>;
  /** True while a DM turn is in flight; guards against overlapping turns. */
  busy: boolean;
}

const runtimes = new Map<string, Runtime>();

function runtime(sessionId: string): Runtime {
  let rt = runtimes.get(sessionId);
  if (!rt) {
    rt = { pending: new Map(), busy: false };
    runtimes.set(sessionId, rt);
  }
  return rt;
}

/** Test seam so the integration test can drive turns without an API key. */
let streamTurn: StreamTurn | undefined;
export function setStreamTurn(fn: StreamTurn | undefined): void {
  streamTurn = fn;
}

export function buildSnapshot(sessionId: string, playerId: string): SessionSnapshot | null {
  const session = repo.getSession(sessionId);
  if (!session) return null;
  const character = repo.getCharacterByPlayer(playerId);

  return {
    sessionId,
    joinCode: session.joinCode,
    scene: session.scene,
    players: repo.getPlayers(sessionId),
    characters: repo.getCharacters(sessionId),
    messages: repo.getMessages(sessionId),
    combat: repo.getCombat(sessionId),
    youPlayerId: playerId,
    youCharacterId: character?.id ?? null,
    awaitingPlayerIds: awaitingPlayerIds(sessionId),
  };
}

/** Connected players who have a character but haven't acted this beat. */
function awaitingPlayerIds(sessionId: string): string[] {
  const combat = repo.getCombat(sessionId);
  const players = repo.getPlayers(sessionId);
  const connected = new Set(hub.connectedPlayerIds(sessionId));

  if (combat?.active) {
    const actor = currentParticipant(combat);
    if (!actor || actor.isNpc || !actor.characterId) return [];
    const owner = players.find((p) => p.characterId === actor.characterId);
    return owner ? [owner.id] : [];
  }

  const rt = runtime(sessionId);
  return players
    .filter((p) => connected.has(p.id) && p.characterId && !rt.pending.has(p.id))
    .map((p) => p.id);
}

function broadcastAwaiting(sessionId: string): void {
  hub.broadcast(sessionId, { type: "awaiting", playerIds: awaitingPlayerIds(sessionId) });
}

function hooksFor(sessionId: string): DmHooks {
  return {
    onNarrationStart: (streamId) => hub.broadcast(sessionId, { type: "narration_start", messageId: streamId }),
    onNarrationDelta: (streamId, text) =>
      hub.broadcast(sessionId, { type: "narration_delta", messageId: streamId, text }),
    onNarrationEnd: (streamId, message) => {
      if (message) hub.broadcast(sessionId, { type: "narration_end", message });
      else hub.broadcast(sessionId, { type: "narration_delta", messageId: streamId, text: "" });
    },
    onRoll: (roll) => hub.broadcast(sessionId, { type: "dice_result", roll }),
    onCharacter: (character) => hub.broadcast(sessionId, { type: "character_update", character }),
    onCombat: (combat) => hub.broadcast(sessionId, { type: "combat_state", combat }),
    onScene: (scene) => hub.broadcast(sessionId, { type: "scene_update", scene }),
    onSystem: (message) => hub.broadcast(sessionId, { type: "message_added", message }),
  };
}

/**
 * Runs a DM turn, then keeps combat moving: resolve NPC turns automatically
 * until it is a player's turn again (or the fight ends).
 */
async function runTurnAndContinue(sessionId: string, trigger: string): Promise<void> {
  const rt = runtime(sessionId);
  if (rt.busy) return;
  rt.busy = true;
  hub.broadcast(sessionId, { type: "dm_thinking", thinking: true });

  try {
    const combatBefore = repo.getCombat(sessionId);
    await runDmTurn(sessionId, trigger, hooksFor(sessionId), streamTurn);

    // If we were already in a fight, the turn we just ran resolved the current
    // combatant. If the fight only just started, nobody has acted yet — so the
    // combatant at the top of the order must not be skipped.
    let shouldAdvance = combatBefore !== null;

    for (let guard = 0; guard < 12; guard += 1) {
      const combat = repo.getCombat(sessionId);
      if (!combat) break;

      if (combatIsOver(combat)) {
        await runDmTurn(
          sessionId,
          "The fight is decided — no one on one side is still standing. Narrate the aftermath in a sentence or two and call end_combat.",
          hooksFor(sessionId),
          streamTurn,
        );
        break;
      }

      let current = combat;
      if (shouldAdvance) {
        current = advanceTurn(combat);
        repo.saveCombat(sessionId, current);
        hub.broadcast(sessionId, { type: "combat_state", combat: current });
      }
      shouldAdvance = true;

      const actor = currentParticipant(current);
      if (!actor) break;
      if (!actor.isNpc) break; // A player's turn — hand control back.

      await runDmTurn(
        sessionId,
        `It is ${actor.name}'s turn (round ${current.round}). Decide their tactics, roll their attack with roll_dice against the target's AC, apply the result with update_character, and narrate only this one turn.`,
        hooksFor(sessionId),
        streamTurn,
      );
    }
  } finally {
    rt.busy = false;
    hub.broadcast(sessionId, { type: "dm_thinking", thinking: false });
    broadcastAwaiting(sessionId);
  }
}

/** Kicks off the opening scene once the first character exists. */
export async function startAdventure(sessionId: string): Promise<void> {
  await runTurnAndContinue(
    sessionId,
    "Open the adventure. Establish where the party is and what they can see, introduce a hook that invites action, and call update_scene to record the location and situation. Do not roll anything yet.",
  );
}

export async function submitPlayerAction(
  sessionId: string,
  playerId: string,
  text: string,
): Promise<void> {
  const rt = runtime(sessionId);
  const player = repo.getPlayer(playerId);
  const character = repo.getCharacterByPlayer(playerId);
  if (!player || !character) return;

  if (rt.busy) {
    hub.sendToPlayer(sessionId, playerId, {
      type: "error",
      message: "The DM is still narrating — hold on a moment.",
    });
    return;
  }

  const combat = repo.getCombat(sessionId);
  if (combat?.active) {
    const actor = currentParticipant(combat);
    if (!actor || actor.characterId !== character.id) {
      hub.sendToPlayer(sessionId, playerId, {
        type: "error",
        message: `It is ${actor?.name ?? "someone else"}'s turn.`,
      });
      return;
    }

    const message = repo.addMessage(sessionId, "player", character.name, text);
    hub.broadcast(sessionId, { type: "message_added", message });
    await runTurnAndContinue(
      sessionId,
      `${character.name} takes their turn: "${text}". Resolve this action — call for any roll it needs, apply the result, and narrate only this turn.`,
    );
    return;
  }

  const message = repo.addMessage(sessionId, "player", character.name, text);
  hub.broadcast(sessionId, { type: "message_added", message });
  rt.pending.set(playerId, `${character.name}: ${text}`);

  // Wait until every connected player with a character has declared something.
  const stillWaiting = awaitingPlayerIds(sessionId);
  if (stillWaiting.length > 0) {
    broadcastAwaiting(sessionId);
    return;
  }

  const actions = [...rt.pending.values()];
  rt.pending.clear();
  const header =
    actions.length === 1 ? "The adventurer acts:" : "The party acts, all at once:";
  await runTurnAndContinue(sessionId, `${header}\n${actions.join("\n")}`);
}

/** Called when a socket drops so the table isn't stuck waiting on a ghost. */
export function forgetPending(sessionId: string, playerId: string): void {
  runtime(sessionId).pending.delete(playerId);
  broadcastAwaiting(sessionId);
}

export { awaitingPlayerIds, broadcastAwaiting };
