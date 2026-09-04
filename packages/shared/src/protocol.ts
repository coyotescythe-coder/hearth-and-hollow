import { z } from "zod";
import { ABILITIES, CLASSES } from "./models.js";
import type {
  Character,
  CombatState,
  GameMessage,
  Player,
  Scene,
  SessionSnapshot,
} from "./models.js";
import type { DiceRoll } from "./dice.js";

/**
 * The WebSocket contract. Client→server messages are validated with zod on
 * arrival (never trust the socket); server→client messages are typed only,
 * since the server is their sole author.
 */

// --- Client → server ---------------------------------------------------------

export const abilityScoresSchema = z.object(
  Object.fromEntries(ABILITIES.map((a) => [a, z.number().int().min(3).max(20)])) as Record<
    (typeof ABILITIES)[number],
    z.ZodNumber
  >,
);

export const createSessionSchema = z.object({
  type: z.literal("create_session"),
  playerName: z.string().trim().min(1).max(40),
  /** Solo sessions skip the "share this code" step in the UI; same server path. */
  solo: z.boolean(),
});

export const joinSessionSchema = z.object({
  type: z.literal("join_session"),
  playerName: z.string().trim().min(1).max(40),
  joinCode: z.string().trim().length(6),
});

/** Reconnect to a session this browser already belongs to. */
export const resumeSessionSchema = z.object({
  type: z.literal("resume_session"),
  sessionId: z.string().min(1),
  playerId: z.string().min(1),
});

export const createCharacterSchema = z.object({
  type: z.literal("create_character"),
  name: z.string().trim().min(1).max(40),
  cls: z.enum(CLASSES),
  abilities: abilityScoresSchema,
  notes: z.string().trim().max(600).default(""),
});

export const playerActionSchema = z.object({
  type: z.literal("player_action"),
  text: z.string().trim().min(1).max(1000),
});

export const combatActionKinds = ["attack", "cast", "item", "move", "pass"] as const;
export type CombatActionKind = (typeof combatActionKinds)[number];

export const combatActionSchema = z.object({
  type: z.literal("combat_action"),
  kind: z.enum(combatActionKinds),
  targetParticipantId: z.string().nullable().default(null),
  /** Optional free-text colour, e.g. "I aim for the rope holding the chandelier". */
  description: z.string().trim().max(400).default(""),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  createSessionSchema,
  joinSessionSchema,
  resumeSessionSchema,
  createCharacterSchema,
  playerActionSchema,
  combatActionSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// --- Server → client ---------------------------------------------------------

export type ServerMessage =
  | { type: "session_state"; snapshot: SessionSnapshot }
  /** Streamed DM narration arrives as start → many deltas → end. */
  | { type: "narration_start"; messageId: string }
  | { type: "narration_delta"; messageId: string; text: string }
  | { type: "narration_end"; message: GameMessage }
  | { type: "message_added"; message: GameMessage }
  | { type: "dice_result"; roll: DiceRoll }
  | { type: "character_update"; character: Character }
  | { type: "combat_state"; combat: CombatState | null }
  | { type: "scene_update"; scene: Scene }
  | { type: "players_update"; players: Player[] }
  /** Player ids the server is waiting on before the DM takes its turn. */
  | { type: "awaiting"; playerIds: string[] }
  /** True while the DM is thinking, so the UI can show a spinner. */
  | { type: "dm_thinking"; thinking: boolean }
  | { type: "error"; message: string };

export const WS_PATH = "/ws";
