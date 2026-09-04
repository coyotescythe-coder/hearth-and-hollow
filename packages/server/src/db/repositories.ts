import { randomUUID } from "node:crypto";
import {
  abilityModifier,
  baseArmorClass,
  maxHpFor,
  type AbilityScores,
  type Character,
  type CharacterClass,
  type CombatParticipant,
  type CombatState,
  type GameMessage,
  type MessageAuthor,
  type Player,
  type Scene,
} from "@dnd/shared";
import { bool, getDb } from "./index.js";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(str(value)) as T;
  } catch {
    return fallback;
  }
}

// --- Sessions ---------------------------------------------------------------

export interface SessionRecord {
  id: string;
  joinCode: string;
  status: string;
  scene: Scene;
}

function toSession(row: Row): SessionRecord {
  return {
    id: str(row.id),
    joinCode: str(row.join_code),
    status: str(row.status),
    scene: {
      location: str(row.scene_location),
      summary: str(row.scene_summary),
      flags: parseJson<Record<string, string>>(row.scene_flags, {}),
    },
  };
}

/** Unambiguous alphabet — no O/0/I/1 to mistype when reading a code aloud. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateJoinCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function createSession(): SessionRecord {
  const db = getDb();
  const id = randomUUID();

  let joinCode = generateJoinCode();
  while (db.prepare("SELECT 1 FROM sessions WHERE join_code = ?").get(joinCode)) {
    joinCode = generateJoinCode();
  }

  db.prepare(
    `INSERT INTO sessions (id, join_code, status, created_at, scene_location, scene_summary, scene_flags)
     VALUES (?, ?, 'active', ?, '', '', '{}')`,
  ).run(id, joinCode, Date.now());

  return { id, joinCode, status: "active", scene: { location: "", summary: "", flags: {} } };
}

export function getSession(id: string): SessionRecord | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
  return row ? toSession(row) : null;
}

export function getSessionByCode(joinCode: string): SessionRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM sessions WHERE join_code = ?")
    .get(joinCode.toUpperCase()) as Row | undefined;
  return row ? toSession(row) : null;
}

export function updateScene(sessionId: string, patch: Partial<Scene>): Scene {
  const current = getSession(sessionId)?.scene ?? { location: "", summary: "", flags: {} };
  const next: Scene = {
    location: patch.location ?? current.location,
    summary: patch.summary ?? current.summary,
    flags: { ...current.flags, ...(patch.flags ?? {}) },
  };
  getDb()
    .prepare("UPDATE sessions SET scene_location = ?, scene_summary = ?, scene_flags = ? WHERE id = ?")
    .run(next.location, next.summary, JSON.stringify(next.flags), sessionId);
  return next;
}

// --- Players ----------------------------------------------------------------

function toPlayer(row: Row, characterId: string | null): Player {
  return {
    id: str(row.id),
    sessionId: str(row.session_id),
    name: str(row.name),
    isHost: num(row.is_host) === 1,
    connected: num(row.connected) === 1,
    characterId,
  };
}

export function createPlayer(sessionId: string, name: string, isHost: boolean): Player {
  const id = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO players (id, session_id, name, is_host, connected, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(id, sessionId, name, bool(isHost), Date.now());
  return { id, sessionId, name, isHost, connected: true, characterId: null };
}

export function getPlayer(id: string): Player | null {
  const row = getDb().prepare("SELECT * FROM players WHERE id = ?").get(id) as Row | undefined;
  if (!row) return null;
  const charRow = getDb()
    .prepare("SELECT id FROM characters WHERE player_id = ?")
    .get(id) as Row | undefined;
  return toPlayer(row, charRow ? str(charRow.id) : null);
}

export function getPlayers(sessionId: string): Player[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM players WHERE session_id = ? ORDER BY created_at")
    .all(sessionId) as Row[];
  return rows.map((row) => {
    const charRow = db
      .prepare("SELECT id FROM characters WHERE player_id = ?")
      .get(str(row.id)) as Row | undefined;
    return toPlayer(row, charRow ? str(charRow.id) : null);
  });
}

export function setPlayerConnected(playerId: string, connected: boolean): void {
  getDb().prepare("UPDATE players SET connected = ? WHERE id = ?").run(bool(connected), playerId);
}

// --- Characters -------------------------------------------------------------

function toCharacter(row: Row): Character {
  return {
    id: str(row.id),
    playerId: str(row.player_id),
    sessionId: str(row.session_id),
    name: str(row.name),
    cls: str(row.cls) as CharacterClass,
    level: num(row.level),
    abilities: {
      str: num(row.score_str),
      dex: num(row.score_dex),
      con: num(row.score_con),
      int: num(row.score_int),
      wis: num(row.score_wis),
      cha: num(row.score_cha),
    },
    hpCurrent: num(row.hp_current),
    hpMax: num(row.hp_max),
    ac: num(row.ac),
    conditions: parseJson<string[]>(row.conditions, []),
    inventory: parseJson<string[]>(row.inventory, []),
    spellSlots: parseJson<Record<string, number>>(row.spell_slots, {}),
    notes: str(row.notes),
  };
}

export function createCharacter(input: {
  playerId: string;
  sessionId: string;
  name: string;
  cls: CharacterClass;
  abilities: AbilityScores;
  notes: string;
}): Character {
  const level = 1;
  const hpMax = maxHpFor(input.cls, level, abilityModifier(input.abilities.con));
  const ac = baseArmorClass(abilityModifier(input.abilities.dex));
  const id = randomUUID();

  getDb()
    .prepare(
      `INSERT INTO characters
        (id, player_id, session_id, name, cls, level,
         score_str, score_dex, score_con, score_int, score_wis, score_cha,
         hp_current, hp_max, ac, conditions, inventory, spell_slots, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '{}', ?)`,
    )
    .run(
      id,
      input.playerId,
      input.sessionId,
      input.name,
      input.cls,
      level,
      input.abilities.str,
      input.abilities.dex,
      input.abilities.con,
      input.abilities.int,
      input.abilities.wis,
      input.abilities.cha,
      hpMax,
      hpMax,
      ac,
      input.notes,
    );

  return getCharacter(id)!;
}

export function getCharacter(id: string): Character | null {
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined;
  return row ? toCharacter(row) : null;
}

export function getCharacters(sessionId: string): Character[] {
  const rows = getDb()
    .prepare("SELECT * FROM characters WHERE session_id = ?")
    .all(sessionId) as Row[];
  return rows.map(toCharacter);
}

export function getCharacterByPlayer(playerId: string): Character | null {
  const row = getDb()
    .prepare("SELECT * FROM characters WHERE player_id = ?")
    .get(playerId) as Row | undefined;
  return row ? toCharacter(row) : null;
}

/** Case-insensitive name lookup — the DM refers to characters by name. */
export function findCharacterByName(sessionId: string, name: string): Character | null {
  const target = name.trim().toLowerCase();
  return getCharacters(sessionId).find((c) => c.name.toLowerCase() === target) ?? null;
}

export function updateCharacterVitals(
  id: string,
  patch: { hpCurrent?: number; conditions?: string[]; notes?: string },
): Character | null {
  const current = getCharacter(id);
  if (!current) return null;

  const hpCurrent = Math.max(
    0,
    Math.min(current.hpMax, patch.hpCurrent ?? current.hpCurrent),
  );
  const conditions = patch.conditions ?? current.conditions;
  const notes = patch.notes ?? current.notes;

  getDb()
    .prepare("UPDATE characters SET hp_current = ?, conditions = ?, notes = ? WHERE id = ?")
    .run(hpCurrent, JSON.stringify(conditions), notes, id);

  return getCharacter(id);
}

// --- Messages ---------------------------------------------------------------

function toMessage(row: Row): GameMessage {
  return {
    id: str(row.id),
    sessionId: str(row.session_id),
    authorType: str(row.author_type) as MessageAuthor,
    authorName: str(row.author_name),
    content: str(row.content),
    createdAt: num(row.created_at),
  };
}

export function addMessage(
  sessionId: string,
  authorType: MessageAuthor,
  authorName: string,
  content: string,
  /** Compaction summaries backdate themselves so they sort before recent turns. */
  createdAt: number = Date.now(),
): GameMessage {
  const message: GameMessage = {
    id: randomUUID(),
    sessionId,
    authorType,
    authorName,
    content,
    createdAt,
  };
  getDb()
    .prepare(
      `INSERT INTO messages (id, session_id, author_type, author_name, content, created_at, summarized)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(message.id, sessionId, authorType, authorName, content, message.createdAt);
  return message;
}

/** Full transcript for the UI (summarised messages included, they're history too). */
export function getMessages(sessionId: string, limit = 200): GameMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(sessionId, limit) as Row[];
  return rows.map(toMessage).reverse();
}

/** What the DM actually sees: summaries plus not-yet-compacted messages. */
export function getLiveMessages(sessionId: string): GameMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM messages WHERE session_id = ? AND summarized = 0 ORDER BY created_at",
    )
    .all(sessionId) as Row[];
  return rows.map(toMessage);
}

export function markSummarized(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare("UPDATE messages SET summarized = 1 WHERE id = ?");
  for (const id of ids) stmt.run(id);
}

// --- Combat -----------------------------------------------------------------

function toParticipant(row: Row): CombatParticipant {
  return {
    id: str(row.id),
    characterId: row.character_id === null ? null : str(row.character_id),
    name: str(row.name),
    isNpc: num(row.is_npc) === 1,
    initiative: num(row.initiative),
    hpCurrent: num(row.hp_current),
    hpMax: num(row.hp_max),
    ac: num(row.ac),
    turnOrderIdx: num(row.turn_order_idx),
  };
}

export function getCombat(sessionId: string): CombatState | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM combats WHERE session_id = ?").get(sessionId) as
    | Row
    | undefined;
  if (!row || num(row.active) !== 1) return null;

  const participants = (
    db
      .prepare("SELECT * FROM combat_participants WHERE session_id = ? ORDER BY turn_order_idx")
      .all(sessionId) as Row[]
  ).map(toParticipant);

  return {
    active: true,
    round: num(row.round),
    currentTurnIdx: num(row.current_turn_idx),
    participants,
  };
}

export function saveCombat(sessionId: string, combat: CombatState): void {
  const db = getDb();
  db.prepare("DELETE FROM combat_participants WHERE session_id = ?").run(sessionId);
  db.prepare(
    `INSERT INTO combats (session_id, active, round, current_turn_idx) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET active = excluded.active,
       round = excluded.round, current_turn_idx = excluded.current_turn_idx`,
  ).run(sessionId, bool(combat.active), combat.round, combat.currentTurnIdx);

  const stmt = db.prepare(
    `INSERT INTO combat_participants
       (id, session_id, character_id, name, is_npc, initiative, hp_current, hp_max, ac, turn_order_idx)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of combat.participants) {
    stmt.run(
      p.id,
      sessionId,
      p.characterId,
      p.name,
      bool(p.isNpc),
      p.initiative,
      p.hpCurrent,
      p.hpMax,
      p.ac,
      p.turnOrderIdx,
    );
  }
}

export function endCombat(sessionId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM combat_participants WHERE session_id = ?").run(sessionId);
  db.prepare("UPDATE combats SET active = 0 WHERE session_id = ?").run(sessionId);
}
