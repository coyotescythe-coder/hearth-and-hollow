/**
 * Core game entities. These shapes are what the server broadcasts and what the
 * client renders — they are the contract between packages/server and
 * packages/client. Treat changes here as breaking for both sides.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const CLASSES = ["Fighter", "Rogue", "Wizard", "Cleric", "Ranger"] as const;
export type CharacterClass = (typeof CLASSES)[number];

/** Classic point-spread players assign across the six abilities. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export type AbilityScores = Record<Ability, number>;

export interface Character {
  id: string;
  playerId: string;
  sessionId: string;
  name: string;
  cls: CharacterClass;
  level: number;
  abilities: AbilityScores;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  conditions: string[];
  /** Reserved for v2 equipment rules; populated but unused in v1. */
  inventory: string[];
  /** Reserved for v2 spellcasting rules; populated but unused in v1. */
  spellSlots: Record<string, number>;
  notes: string;
}

export interface Player {
  id: string;
  sessionId: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  characterId: string | null;
}

/**
 * The DM's structured grounding. Persisted and updated through the
 * `update_scene` tool so a long campaign doesn't depend on re-reading the
 * whole transcript.
 */
export interface Scene {
  location: string;
  summary: string;
  flags: Record<string, string>;
}

export type MessageAuthor = "dm" | "player" | "system";

export interface GameMessage {
  id: string;
  sessionId: string;
  authorType: MessageAuthor;
  authorName: string;
  content: string;
  createdAt: number;
}

export interface CombatParticipant {
  id: string;
  /** null for monsters/NPCs, which exist only for the duration of the fight. */
  characterId: string | null;
  name: string;
  isNpc: boolean;
  initiative: number;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  /** Index into the initiative order; the server owns this, never the model. */
  turnOrderIdx: number;
}

export interface CombatState {
  active: boolean;
  round: number;
  currentTurnIdx: number;
  participants: CombatParticipant[];
}

export interface SessionSnapshot {
  sessionId: string;
  joinCode: string;
  scene: Scene;
  players: Player[];
  characters: Character[];
  messages: GameMessage[];
  combat: CombatState | null;
  /** Which player *you* are, and which character is yours. */
  youPlayerId: string;
  youCharacterId: string | null;
  /** Player ids the server is still waiting on before the DM takes its turn. */
  awaitingPlayerIds: string[];
}

// --- Derived-stat helpers (shared so client and server never disagree) -------

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

const HIT_DIE: Record<CharacterClass, number> = {
  Fighter: 10,
  Rogue: 8,
  Wizard: 6,
  Cleric: 8,
  Ranger: 10,
};

export function hitDie(cls: CharacterClass): number {
  return HIT_DIE[cls];
}

/** Max HP at level 1 is a full hit die; later levels take the average, rounded up. */
export function maxHpFor(cls: CharacterClass, level: number, conMod: number): number {
  const die = hitDie(cls);
  const perLevelAverage = Math.floor(die / 2) + 1;
  const lvl = Math.max(1, level);
  return die + conMod + (lvl - 1) * (perLevelAverage + conMod);
}

/** Unarmoured baseline; equipment is a v2 concern. */
export function baseArmorClass(dexMod: number): number {
  return 10 + dexMod;
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
