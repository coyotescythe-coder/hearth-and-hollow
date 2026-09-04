import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

/**
 * Uses Node's built-in SQLite (Node >= 22.5) rather than better-sqlite3 so the
 * project installs on Windows without a native toolchain.
 *
 * Note: node:sqlite binds only null/number/string/bigint/Uint8Array — booleans
 * must be written as 0/1. See the `bool()` helper below.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  join_code      TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     INTEGER NOT NULL,
  scene_location TEXT NOT NULL DEFAULT '',
  scene_summary  TEXT NOT NULL DEFAULT '',
  scene_flags    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS players (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name       TEXT NOT NULL,
  is_host    INTEGER NOT NULL DEFAULT 0,
  connected  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL REFERENCES players(id),
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  name        TEXT NOT NULL,
  cls         TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 1,
  score_str   INTEGER NOT NULL,
  score_dex   INTEGER NOT NULL,
  score_con   INTEGER NOT NULL,
  score_int   INTEGER NOT NULL,
  score_wis   INTEGER NOT NULL,
  score_cha   INTEGER NOT NULL,
  hp_current  INTEGER NOT NULL,
  hp_max      INTEGER NOT NULL,
  ac          INTEGER NOT NULL,
  conditions  TEXT NOT NULL DEFAULT '[]',
  inventory   TEXT NOT NULL DEFAULT '[]',
  spell_slots TEXT NOT NULL DEFAULT '{}',
  notes       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  summarized  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS combats (
  session_id       TEXT PRIMARY KEY REFERENCES sessions(id),
  active           INTEGER NOT NULL DEFAULT 0,
  round            INTEGER NOT NULL DEFAULT 1,
  current_turn_idx INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS combat_participants (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id),
  character_id   TEXT,
  name           TEXT NOT NULL,
  is_npc         INTEGER NOT NULL,
  initiative     INTEGER NOT NULL,
  hp_current     INTEGER NOT NULL,
  hp_max         INTEGER NOT NULL,
  ac             INTEGER NOT NULL,
  turn_order_idx INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
CREATE INDEX IF NOT EXISTS idx_characters_session ON characters(session_id);
CREATE INDEX IF NOT EXISTS idx_combatants_session ON combat_participants(session_id, turn_order_idx);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** Opens a throwaway in-memory database — used by tests. */
export function openMemoryDb(): DatabaseSync {
  const memory = new DatabaseSync(":memory:");
  memory.exec(SCHEMA);
  db = memory;
  return memory;
}

/** node:sqlite has no boolean binding; store flags as integers. */
export const bool = (value: boolean): number => (value ? 1 : 0);
