# CLAUDE.md

**Read [AGENTS.md](./AGENTS.md) first — it is the source of truth for this
repo** (architecture, data model, WebSocket protocol, conventions, current
status, and next steps). This file exists only so Claude Code picks up the same
context Codex does; do not duplicate content here, update `AGENTS.md` instead.

## Division of labour on this project

- **Claude** owns `packages/server` and `packages/shared` — game engine, DM
  orchestration, persistence, protocol.
- **Codex** owns `packages/client` — the UI build against the brief in
  `AGENTS.md` §8.

`packages/shared/src/protocol.ts` is the contract between them. Changing it
affects both workstreams, so treat it as a coordination point rather than
something to reshape unilaterally.

## Before writing DM/API code

Load the `claude-api` skill. This project pins `@anthropic-ai/sdk` ^0.123.0 and
targets `claude-opus-5` with adaptive thinking and `output_config.effort` — the
parameter surface has changed enough recently that writing from memory produces
400s. See `AGENTS.md` §9 for the specific traps already hit.

## Keep this true

When you finish a chunk of work, update `AGENTS.md` §10 (Status / Next up) so
the other tool starts from reality rather than from this session's assumptions.
