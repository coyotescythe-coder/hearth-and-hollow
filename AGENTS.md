# AGENTS.md — handoff & working notes

Context file for AI coding agents on this repo. **Codex reads this file
automatically**; Claude Code reads `CLAUDE.md`, which points here. Keep this
file current — it is the shared source of truth so neither tool has to be
re-briefed from scratch.

Last updated: 2026-09-04, frontend design pass (Codex).

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

**You have a free hand on the design.** Everything in `packages/client` that is
visual is yours: art direction, typography, colour, layout, spacing, motion,
iconography, custom assets, component structure, and any UI-only dependencies
you want to pull in. What exists today is a deliberately plain scaffold that
proves the wiring — it is a starting point to replace, not a design to respect.
Delete `styles.css` and start over if that serves you. Restructure or rename
components freely.

### The bar

This should look like someone designed it on purpose. A competent dark theme
over default form controls is not the goal — the goal is a game that feels like
a place. Someone should be able to screenshot the play screen and have it read
as a real product, not a demo.

The one thing worth optimising for: **this app is mostly text**, and text is
the entire experience. Narration is what the player is here for. Typography,
measure, rhythm, and how prose enters the screen matter more here than in a
typical dashboard.

### Moments that deserve real attention

These are where the game either feels alive or feels like a chat log:

- **Narration streaming in.** Text arrives token by token (`narration_delta`).
  How it lands sets the pace of the whole game.
- **A die hitting the table.** `dice_result` carries the expression, every face
  rolled, which die was kept on advantage, the DC, and the outcome. A natural
  20 and a natural 1 are already flagged (`critical-success` /
  `critical-failure`) and should feel completely different from each other.
- **Combat starting.** The initiative order appears and the whole screen should
  change character — the game just shifted mode.
- **Your turn arriving** in a fight, versus watching someone else's.
- **Taking damage.** HP changes push down from the server; the sheet should
  register the hit.
- **Waiting on the party** in multiplayer, versus playing solo where there is
  nobody to wait for.

### Screens (what they must let a player do — not how they must look)

1. **Landing** — choose a name; start solo, create a party session, or join by
   six-character code.
2. **Character creation** — name, class, assign the standard array across six
   abilities with live modifiers, see derived HP/AC, optional background text.
3. **Play** — read narration, act (free-form, or pick an action and target on
   your turn in combat), see your character, see the initiative order during a
   fight, see the party when there is one, know the connection state, and find
   the invite code in a party session.

### Inviolable — the parts that are not design decisions

- **No game logic on the client.** It renders server-pushed state; it never
  computes outcomes, HP, or whose turn it is. The shared helpers
  (`abilityModifier`, `maxHpFor`) exist so both sides agree — use them, don't
  reimplement rules.
- **`packages/shared/src/protocol.ts` is a contract with the server.** If the
  UI genuinely needs a field the protocol doesn't carry, that's a server change
  to coordinate, not something to work around client-side.
- **`useGameSocket.ts` owns the socket**, reconnect, and state merging. Reshape
  its return value if that helps, but don't scatter socket handling into
  components.
- Behaviours that are easy to break and will be noticed: autoscroll as
  narration streams; inputs disabled while the DM is mid-turn; the party panel
  hidden entirely in solo; out-of-turn combat actions blocked; the reconnect
  state visible when the socket drops.
- Keep it usable on a laptop and a phone, keyboard-navigable, and readable —
  contrast and focus states are part of the design, not a lint pass afterwards.

### Practical

`npm run dev` runs server and client together. The server can run without an
API key — you'll get a system message instead of narration, which is fine for
building most screens. For live narration you need a key in `.env`.

To design combat without playing into a fight, seed one directly in
`data/game.db`, or temporarily script the DM: `setStreamTurn` in
`game/engine.ts` is the seam the tests use to drive scripted tool calls
(`start_combat`, `roll_check`) with no API involved — see
`src/game/engine.test.ts` for working examples.

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

**Frontend design pass complete — Hearth & Hollow.** The scaffold has been
replaced with a pine/brass/paper visual system, self-hosted Fraunces and Literata,
original forest engraving and SVG icons, and responsive landing, character
creation, and play screens. Narration keeps its DOM identity when committed;
autoscroll pauses when reading earlier prose. Critical rolls, combat mode, turn
arrival, and HP loss have distinct motion with reduced-motion alternatives.
Mobile has Story, World/Battle, and Character tabs. Party creation keeps its
invite visible even before another player joins. Shared/server files are unchanged.

`packages/client/DESIGN.md` documents the design and rehearsal workflow.
With normal dev running, `npm run dev:story --workspace @dnd/client` opens an
isolated, in-memory scripted game at **localhost:5180** (server **:8788**).
It uses `setStreamTurn`, real engine tool calls, and server dice helpers; actions
`fight`, `nat20`, `nat1`, `hit`, `heal`, and `end` exercise the important moments.
`UI_VITE_PORT` can override the Vite port used by the rehearsal proxy.

Verified in a browser at desktop and 390px phone widths: solo creation, array
swapping and derived stats, joining by code, party waiting, narration/input
locking, reader-controlled autoscroll, natural 20/1, targeted combat actions,
other-player turn locking, HP loss, combat ending, and reload/resume. Production
build and both package typechecks pass. Four new client regression tests cover
stream identity, reconnecting mid-narration, interrupted-stream cleanup, and
returning to the landing screen when a resumed session has expired:
`npm run test --workspace @dnd/client`.

**Server test note for the engine owner:** the unchanged 15-test suite produced
14 passes and one randomized failure in `starting combat does not skip the first
combatant`. It inspects the current participant *after* auto-resolving NPC turns,
then expects index 0 whenever that participant is a player. If an NPC won
initiative, the correct player can be at index 1. Make that test deterministic
or assert against the original initiative order; no server changes were made here.

The desktop sandbox used for this pass could not enumerate an ancestor directory
required by esbuild's dependency optimizer. Validation used Vite's runner loader
for the production build and a temporary filesystem alias for live development;
those machine-specific accommodations are outside the repository.

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
2. Fix the randomized combat-start test assertion noted above.
3. Inventory/equipment and spell slots (columns already exist).
4. Prompt caching: add `cache_control` breakpoints — the prompt is already
   structured for it (static system, volatile state in the trailing message).
5. Death/dying rules — HP floors at 0 and the character is "unconscious"; there
   are no death saves yet.
6. Maps/tokens, accounts, multiple characters per player.
