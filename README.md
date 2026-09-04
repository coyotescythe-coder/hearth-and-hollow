# AI Dungeon Master

A D&D-style tabletop RPG where an AI plays the Dungeon Master — narrating the
world, playing every NPC, and adjudicating the rules. Play **solo** or with a
**party** sharing one story; both use the same code path.

The AI never rolls the dice. It decides when a roll is needed and how hard the
task is, then the server rolls for real and hands back the number. Initiative
and turn order are the server's too. The model tells the story; the table
enforces the rules.

## Quick start

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev
```

Then open <http://localhost:5173>.

- Solo: enter a name, hit **Start solo adventure**, build a character, play.
- Party: **Create party session**, share the six-character invite code, and
  everyone else joins with it. The DM waits until all players have declared an
  action before narrating the next beat.

Sessions persist to SQLite (`data/game.db`) and survive a page reload or a
server restart — reconnecting drops you back into the same adventure.

## What's in the box

- Character creation (class, standard-array abilities, derived HP/AC)
- Free-form narrative play with streamed DM narration
- Server-rolled ability checks, saving throws, and attacks with advantage
- Structured combat: real initiative, turn order, HP tracking, NPC turns
- Automatic history compaction so a long campaign doesn't degrade

## Configuration

`.env` accepts `ANTHROPIC_API_KEY`, `DM_MODEL` (default `claude-opus-5`),
`DM_EFFORT`, `DM_SUMMARY_MODEL`, and `PORT`.

## Development

```bash
npm test          # unit + integration tests, no API key required
npm run typecheck
```

Architecture, protocol, and contributor notes live in [AGENTS.md](./AGENTS.md).
