# AGENTS.md — handoff & working notes

Context file for AI coding agents on this repo. **Codex reads this file
automatically**; Claude Code reads `CLAUDE.md`, which points here. Keep this
file current — it is the shared source of truth so neither tool has to be
re-briefed from scratch.

Last updated: 2026-09-04, end of the initial build session (Claude, Opus 5).

---

## 1. What this is

A D&D-style tabletop RPG where **an AI plays the Dungeon Master**. It narrates,
plays every NPC, and adjudicates rules. It supports **solo and multiplayer with
no separate code paths** — a session simply has 1..N players, and "wait for
everyone to declare an action" resolves instantly when N is 1.

The design commitment that shapes everything: **the model never rolls dice and
never owns turn order.** It decides *whether* a roll is needed and against what
DC, then calls a tool; the server rolls with a real CSPRNG and hands back the
number. Same for combat: the DM declares a fight starts, the server owns
initiative and whose turn it is. This is what keeps the game honest instead of
being a chatbot that says "you rolled a 17".

## 2. Run it

```bash
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY
npm run dev               # server :8787 + client :5173
```

Open http://localhost:5173. Vite proxies `/ws` and `/health` to the server, so
the client always talks to same-origin.

Without a key the app still runs — the DM turn fails gracefully and posts a
system message into the transcript saying the key is missing.

```bash
npm test        # server unit + integration tests (no API key needed)
npm run typecheck
```

## 3. Layout

```
packages/
  shared/   Types + zod schemas. THE CONTRACT between server and client.
  server/   Game engine, DM orchestration, SQLite, WebSocket. (Claude's scope)
  client/   Vite + React UI. (Codex's scope — see §8)
```

Key server files:

| File | Role |
|---|---|
| `src/index.ts` | HTTP + WS bootstrap |
| `src/ws/router.ts` | Validates and dispatches client messages |
| `src/ws/hub.ts` | Socket registry + per-session broadcast |
| `src/game/engine.ts` | **Turn flow.** Action queue, when the DM acts, combat driving |
| `src/game/combat.ts` | Initiative, turn advance, end-of-fight detection (pure) |
| `src/dice/roll.ts` | The only source of randomness in the game (pure) |
| `src/dm/orchestrator.ts` | Streaming tool-use loop against the Claude API |
| `src/dm/tools.ts` | The six DM tools + their server-side implementations |
| `src/dm/prompt.ts` | System prompt + per-turn state block |
| `src/dm/summarizer.ts` | History compaction |
| `src/db/repositories.ts` | All SQL lives here |

## 4. How a turn actually works

1. Player submits an action → stored, broadcast to the table.
2. Engine waits until every *connected player with a character* has declared
   (instant in solo). In combat it instead accepts only the current combatant.
3. `runDmTurn` builds the prompt and streams from Claude.
4. If the model calls tools, the server executes them — rolling dice, applying
   damage, starting combat — broadcasting each effect live, then feeds the
   results back and continues the same turn. Max 8 iterations.
5. Narration is streamed to clients as deltas, then persisted as one DM message.
6. If combat is active, the engine advances the initiative order and
   auto-resolves NPC turns until it is a player's turn again.

**Subtle rule worth preserving:** after a DM turn that *started* combat, the
engine must NOT advance the turn — nobody has acted yet, so advancing would
skip whoever won initiative. `engine.ts` handles this by comparing combat state
before/after the turn. There is a regression test for it.

## 5. The DM's tools

| Tool | What the server does |
|---|---|
| `roll_check` | d20 + the character's real ability mod (+ proficiency), vs DC |
| `roll_dice` | Arbitrary expression (`2d6+3`) for damage and NPC attacks |
| `update_character` | HP/conditions for **PCs and NPCs alike**; mirrors into combat state |
| `start_combat` | Adds all PCs + the listed enemies, rolls initiative, owns turn order |
| `end_combat` | Clears the fight |
| `update_scene` | Persists location / situation / durable facts |

All are `strict: true`, so every optional field is nullable-and-required.

## 6. Data model (SQLite via `node:sqlite`)

`sessions` (with scene columns) · `players` · `characters` · `messages` ·
`combats` · `combat_participants`. DB file: `data/game.db` (gitignored).

`characters.inventory` and `characters.spell_slots` exist but are **unused** —
they are there so v2 equipment/spellcasting is not a migration.

Sessions are resumable: the client stores `sessionId`/`playerId` in
localStorage and sends `resume_session` on reconnect. Verified working across a
full page reload.

## 7. Context management

The DM prompt does not grow without bound. Past 24 live messages, the oldest 16
are summarised into one backdated "Chronicle" system message and excluded from
future prompts. Durable facts are additionally pinned in `sessions.scene_*` via
`update_scene`, so they survive compaction. This is what makes an evening-long
campaign viable rather than one that degrades after an hour.

## 8. UI/UX brief — Codex's scope

The client today is a **functional scaffold with placeholder styling**. Every
screen exists and is correctly wired to real server state; none of it is
designed. Turning it into the real UI is the frontend workstream.

Screens: **Landing** (name → solo / create party / join by code) → **Character
creation** (name, class, standard-array assignment with live modifiers, derived
HP/AC, optional background) → **Play screen**.

Play screen regions:
- Top bar: invite code (party sessions only), current location, connection state
- Main column: narration log — DM prose visually distinct from player and
  system lines; dice results rendered as their own inline artifacts
- Bottom: action bar — free-form input, which swaps to a compact
  action/target menu when it is your turn in a fight
- Right sidebar: your character sheet (HP bar, AC, abilities, conditions);
  the initiative tracker while combat is on; the party panel (auto-hidden solo)

Suggested direction (not binding): atmospheric and book-like rather than a
generic SaaS chat — dark ground, serif for DM narration, sans for interface
chrome, so "the world" and "the app" read differently. Get layout and streaming
right before theming.

**Rules for the frontend work:**
- No game logic on the client. It renders server-pushed state; it does not
  compute outcomes. Derived-stat helpers in `@dnd/shared` (`abilityModifier`,
  `maxHpFor`) are shared deliberately so both sides agree.
- Treat `packages/shared/src/protocol.ts` as a contract. Changing it means
  changing the server too — coordinate rather than reshaping it client-side.
- `useGameSocket.ts` owns the socket, reconnect, and state merging. Components
  should stay presentational.

## 9. Gotchas already paid for

- **Anthropic SDK version.** `^0.68.0` resolves to `<0.69.0` for 0.x packages,
  which silently pinned a stale SDK with no adaptive-thinking types. The repo
  is on `^0.123.0`. If thinking/effort/fallback params stop typechecking, check
  the installed version first.
- **Model params.** `claude-opus-5` rejects `temperature`/`top_p` and
  `budget_tokens` with a 400. Use `thinking: {type:"adaptive"}` and
  `output_config: {effort}`. Do not add a temperature "for creativity".
- **Model default.** `claude-opus-5` at `medium` effort — effort is dialled
  down because a DM turn is latency-sensitive. Override via `DM_MODEL` /
  `DM_EFFORT` in `.env`; `DM_SUMMARY_MODEL` can point compaction at a cheaper
  model (e.g. `claude-haiku-4-5`).
- **`node:sqlite` cannot bind booleans.** Write 0/1 (`bool()` in `db/index.ts`).
  Chosen over `better-sqlite3` to avoid a native toolchain on Windows.
- **esbuild postinstall** is blocked by npm's allow-scripts policy here. Vite
  still runs fine; ignore the warning unless Vite actually fails.

## 10. Status

Working and verified: session create/join/resume, character creation, action
queueing, the streaming tool-use loop (integration-tested with a scripted
model), server-side dice, structured combat with initiative, history
compaction, SQLite persistence. 15 tests pass.

**Not yet verified against the live API** — the build environment had no
`ANTHROPIC_API_KEY`, so no real DM turn has run end to end. First task for
whoever has a key: add it to `.env`, play a few turns, and confirm the model
actually reaches for the tools rather than narrating rolls itself. If it
narrates numbers on its own, tighten the DICE section of `DM_SYSTEM_PROMPT`.

### Next up
1. Live playtest with a real key (above).
2. Frontend design pass (§8).
3. Inventory/equipment and spell slots (columns already exist).
4. Prompt caching: add `cache_control` breakpoints — the prompt is already
   structured for it (static system, volatile state in the trailing message).
5. Death/dying rules — HP floors at 0 and the character is "unconscious"; there
   are no death saves yet.
6. Maps/tokens, accounts, multiple characters per player.
