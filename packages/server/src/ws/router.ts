import type { WebSocket } from "ws";
import { clientMessageSchema, type ClientMessage } from "@dnd/shared";
import * as repo from "../db/repositories.js";
import * as hub from "./hub.js";
import {
  broadcastAwaiting,
  buildSnapshot,
  forgetPending,
  startAdventure,
  submitPlayerAction,
} from "../game/engine.js";

export interface Connection {
  socket: WebSocket;
  sessionId: string | null;
  playerId: string | null;
}

function fail(conn: Connection, message: string): void {
  hub.send(conn.socket, { type: "error", message });
}

function attach(conn: Connection, sessionId: string, playerId: string): void {
  conn.sessionId = sessionId;
  conn.playerId = playerId;
  hub.register(sessionId, playerId, conn.socket);
  repo.setPlayerConnected(playerId, true);

  const snapshot = buildSnapshot(sessionId, playerId);
  if (snapshot) hub.send(conn.socket, { type: "session_state", snapshot });
  hub.broadcast(sessionId, { type: "players_update", players: repo.getPlayers(sessionId) });
  broadcastAwaiting(sessionId);
}

export async function handleRaw(conn: Connection, raw: string): Promise<void> {
  let parsed: ClientMessage;
  try {
    const json: unknown = JSON.parse(raw);
    const result = clientMessageSchema.safeParse(json);
    if (!result.success) {
      fail(conn, `Malformed message: ${result.error.issues[0]?.message ?? "invalid"}`);
      return;
    }
    parsed = result.data;
  } catch {
    fail(conn, "Message was not valid JSON.");
    return;
  }

  await handleMessage(conn, parsed);
}

export async function handleMessage(conn: Connection, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "create_session": {
      const session = repo.createSession();
      const player = repo.createPlayer(session.id, message.playerName, true);
      attach(conn, session.id, player.id);
      return;
    }

    case "join_session": {
      const session = repo.getSessionByCode(message.joinCode);
      if (!session) {
        fail(conn, `No session with code ${message.joinCode.toUpperCase()}.`);
        return;
      }
      const player = repo.createPlayer(session.id, message.playerName, false);
      attach(conn, session.id, player.id);
      return;
    }

    case "resume_session": {
      const session = repo.getSession(message.sessionId);
      const player = repo.getPlayer(message.playerId);
      if (!session || !player || player.sessionId !== session.id) {
        fail(conn, "That session has expired. Start a new adventure.");
        return;
      }
      attach(conn, session.id, player.id);
      return;
    }

    case "create_character": {
      if (!conn.sessionId || !conn.playerId) {
        fail(conn, "Join a session first.");
        return;
      }
      if (repo.getCharacterByPlayer(conn.playerId)) {
        fail(conn, "You already have a character in this session.");
        return;
      }

      const character = repo.createCharacter({
        playerId: conn.playerId,
        sessionId: conn.sessionId,
        name: message.name,
        cls: message.cls,
        abilities: message.abilities,
        notes: message.notes,
      });

      hub.broadcast(conn.sessionId, { type: "character_update", character });
      hub.broadcast(conn.sessionId, { type: "players_update", players: repo.getPlayers(conn.sessionId) });

      const joined = repo.addMessage(
        conn.sessionId,
        "system",
        "System",
        `${character.name}, level ${character.level} ${character.cls}, joins the party.`,
      );
      hub.broadcast(conn.sessionId, { type: "message_added", message: joined });

      // First character in a fresh session opens the adventure.
      const isFirstCharacter = repo.getCharacters(conn.sessionId).length === 1;
      if (isFirstCharacter) {
        void startAdventure(conn.sessionId);
      } else {
        broadcastAwaiting(conn.sessionId);
      }
      return;
    }

    case "player_action": {
      if (!conn.sessionId || !conn.playerId) {
        fail(conn, "Join a session first.");
        return;
      }
      await submitPlayerAction(conn.sessionId, conn.playerId, message.text);
      return;
    }

    case "combat_action": {
      if (!conn.sessionId || !conn.playerId) {
        fail(conn, "Join a session first.");
        return;
      }
      const combat = repo.getCombat(conn.sessionId);
      const target = combat?.participants.find((p) => p.id === message.targetParticipantId);
      const described = describeCombatAction(message.kind, target?.name ?? null, message.description);
      await submitPlayerAction(conn.sessionId, conn.playerId, described);
      return;
    }
  }
}

function describeCombatAction(
  kind: string,
  targetName: string | null,
  description: string,
): string {
  const target = targetName ? ` ${targetName}` : "";
  const colour = description.trim() ? ` — ${description.trim()}` : "";
  switch (kind) {
    case "attack":
      return `I attack${target}${colour}`;
    case "cast":
      return `I cast a spell${targetName ? ` at${target}` : ""}${colour}`;
    case "item":
      return `I use an item${targetName ? ` on${target}` : ""}${colour}`;
    case "move":
      return `I reposition${colour}`;
    case "pass":
      return `I hold my action${colour}`;
    default:
      return description.trim() || "I hesitate";
  }
}

export function handleClose(conn: Connection): void {
  if (!conn.sessionId || !conn.playerId) return;
  hub.unregister(conn.sessionId, conn.playerId);
  repo.setPlayerConnected(conn.playerId, false);
  forgetPending(conn.sessionId, conn.playerId);
  hub.broadcast(conn.sessionId, { type: "players_update", players: repo.getPlayers(conn.sessionId) });
}
