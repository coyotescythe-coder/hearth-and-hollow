import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  WS_PATH,
  type ClientMessage,
  type DiceRoll,
  type GameMessage,
  type ServerMessage,
  type SessionSnapshot,
} from "@dnd/shared";

/**
 * Owns the WebSocket, merges server pushes into one state object, and exposes
 * typed senders. Components stay thin renderers over this — no game rules live
 * on the client, so the two sides can never disagree about what is true.
 */

export type FeedItem =
  | { kind: "message"; id: string; message: GameMessage }
  | { kind: "roll"; id: string; roll: DiceRoll };

export interface GameState {
  connection: "connecting" | "open" | "closed";
  snapshot: SessionSnapshot | null;
  feed: FeedItem[];
  /** Narration arriving right now, before it is persisted. */
  streaming: string;
  dmThinking: boolean;
  error: string | null;
}

const initialState: GameState = {
  connection: "connecting",
  snapshot: null,
  feed: [],
  streaming: "",
  dmThinking: false,
  error: null,
};

type Action =
  | { type: "connection"; value: GameState["connection"] }
  | { type: "server"; message: ServerMessage }
  | { type: "clear_error" };

let rollSeq = 0;

function reducer(state: GameState, action: Action): GameState {
  if (action.type === "connection") return { ...state, connection: action.value };
  if (action.type === "clear_error") return { ...state, error: null };

  const message = action.message;
  switch (message.type) {
    case "session_state":
      return {
        ...state,
        snapshot: message.snapshot,
        feed: message.snapshot.messages.map((m) => ({ kind: "message", id: m.id, message: m })),
        streaming: "",
        error: null,
      };

    case "narration_start":
      return { ...state, streaming: "" };

    case "narration_delta":
      return { ...state, streaming: state.streaming + message.text };

    case "narration_end":
      return {
        ...state,
        streaming: "",
        feed: [...state.feed, { kind: "message", id: message.message.id, message: message.message }],
        snapshot: state.snapshot
          ? { ...state.snapshot, messages: [...state.snapshot.messages, message.message] }
          : state.snapshot,
      };

    case "message_added":
      if (state.feed.some((f) => f.id === message.message.id)) return state;
      return {
        ...state,
        feed: [...state.feed, { kind: "message", id: message.message.id, message: message.message }],
        snapshot: state.snapshot
          ? { ...state.snapshot, messages: [...state.snapshot.messages, message.message] }
          : state.snapshot,
      };

    case "dice_result":
      rollSeq += 1;
      return { ...state, feed: [...state.feed, { kind: "roll", id: `roll-${rollSeq}`, roll: message.roll }] };

    case "character_update":
      if (!state.snapshot) return state;
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          characters: state.snapshot.characters.some((c) => c.id === message.character.id)
            ? state.snapshot.characters.map((c) =>
                c.id === message.character.id ? message.character : c,
              )
            : [...state.snapshot.characters, message.character],
          youCharacterId:
            message.character.playerId === state.snapshot.youPlayerId
              ? message.character.id
              : state.snapshot.youCharacterId,
        },
      };

    case "combat_state":
      return state.snapshot
        ? { ...state, snapshot: { ...state.snapshot, combat: message.combat } }
        : state;

    case "scene_update":
      return state.snapshot
        ? { ...state, snapshot: { ...state.snapshot, scene: message.scene } }
        : state;

    case "players_update":
      return state.snapshot
        ? { ...state, snapshot: { ...state.snapshot, players: message.players } }
        : state;

    case "awaiting":
      return state.snapshot
        ? { ...state, snapshot: { ...state.snapshot, awaitingPlayerIds: message.playerIds } }
        : state;

    case "dm_thinking":
      return { ...state, dmThinking: message.thinking };

    case "error":
      return { ...state, error: message.message };

    default:
      return state;
  }
}

const STORAGE_SESSION = "dnd.sessionId";
const STORAGE_PLAYER = "dnd.playerId";

function readStored(): { sessionId: string; playerId: string } | null {
  try {
    const sessionId = localStorage.getItem(STORAGE_SESSION);
    const playerId = localStorage.getItem(STORAGE_PLAYER);
    return sessionId && playerId ? { sessionId, playerId } : null;
  } catch {
    return null;
  }
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const closedByUs = useRef(false);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      queueRef.current.push(message);
    }
  }, []);

  useEffect(() => {
    closedByUs.current = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}${WS_PATH}`);
      socketRef.current = socket;
      dispatch({ type: "connection", value: "connecting" });

      socket.onopen = () => {
        dispatch({ type: "connection", value: "open" });
        const stored = readStored();
        if (stored) {
          socket.send(JSON.stringify({ type: "resume_session", ...stored } satisfies ClientMessage));
        }
        for (const queued of queueRef.current.splice(0)) {
          socket.send(JSON.stringify(queued));
        }
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === "session_state") {
          try {
            localStorage.setItem(STORAGE_SESSION, message.snapshot.sessionId);
            localStorage.setItem(STORAGE_PLAYER, message.snapshot.youPlayerId);
          } catch {
            /* private browsing — the session just won't survive a reload */
          }
        }
        if (message.type === "error" && /expired/i.test(message.message)) {
          try {
            localStorage.removeItem(STORAGE_SESSION);
            localStorage.removeItem(STORAGE_PLAYER);
          } catch {
            /* ignore */
          }
        }
        dispatch({ type: "server", message });
      };

      socket.onclose = () => {
        dispatch({ type: "connection", value: "closed" });
        if (!closedByUs.current) retry = setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  const actions = useMemo(
    () => ({
      createSession: (playerName: string, solo: boolean) =>
        send({ type: "create_session", playerName, solo }),
      joinSession: (playerName: string, joinCode: string) =>
        send({ type: "join_session", playerName, joinCode: joinCode.toUpperCase() }),
      createCharacter: (input: Omit<Extract<ClientMessage, { type: "create_character" }>, "type">) =>
        send({ type: "create_character", ...input }),
      act: (text: string) => send({ type: "player_action", text }),
      combatAct: (
        kind: Extract<ClientMessage, { type: "combat_action" }>["kind"],
        targetParticipantId: string | null,
        description: string,
      ) => send({ type: "combat_action", kind, targetParticipantId, description }),
      clearError: () => dispatch({ type: "clear_error" }),
    }),
    [send],
  );

  return { state, actions };
}
