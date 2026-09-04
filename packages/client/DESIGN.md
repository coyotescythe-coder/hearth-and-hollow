# Hearth & Hollow

The interface is a field journal at the edge of an unfamiliar forest. Pine and
brass frame warm paper; the chronicle has the widest column and the calmest
surface. Fraunces supplies the titles and numerals. Literata supplies the story.
Both fonts are self-hosted, with their OFL licenses in `public/fonts`. The forest
engraving, d20 mark, and line icons are original SVG assets. There are no external
image or font requests and no new production dependencies.

## Moments

- Incoming narration settles into ink over 380 ms. The live entry retains its
  React key and word spans when committed, avoiding a paragraph-wide replay.
- Autoscroll follows the latest words. Scrolling back pauses it; a “New words
  below” control returns to the live edge without stealing your reading position.
- Dice show the kept face, all rolls, discarded faces, modifier, total, DC, and
  the outcome supplied by the server. A natural 20 rises into a gold flourish;
  a natural 1 strikes sideways with a brief red jolt.
- Combat changes the whole palette and reveals initiative and structured actions.
  The current combatant comes directly from the server. Your playable turn gets
  a brass strip and an illuminated composer; other turns remain disabled.
- A server HP decrease animates the bar, jolts the character seal, and briefly
  shows the lost HP and a screen-edge vignette. A live-region announcement also
  works when the character panel is hidden on a phone.
- Party waiting comes from `awaitingPlayerIds`. Solo hides the party panel and
  invite. Creating a party remembers that presentation choice locally, since
  the protocol has no persistent solo/party field.
- Phone layouts use Story, World/Battle, and Character tabs. Initiative precedes
  scene details in the mobile Battle view. The composer remains within reach.
- `prefers-reduced-motion` removes movement and fades. Outcomes, turn labels,
  and HP changes remain readable. The `Aa` control increases story text size.

## Rehearse without an API key

From the repository root, leave `npm run dev` running. In a second terminal:

```sh
npm run dev:story --workspace @dnd/client
```

Open `http://localhost:5180`. Create a character normally. The rehearsal runs the
real socket/router, engine, tools, and shared rules against in-memory SQLite,
with a scripted DM installed through `setStreamTurn`. It never changes saved
adventures. It owns ports 5180 (UI proxy) and 8788 (scripted server). To use a
different Vite port, set `UI_VITE_PORT` before starting it.

Submit these words as actions, or put them in the description of a combat action:

| Action | Rehearsal |
| --- | --- |
| Any ordinary action | A real server-rolled check with advantage, then narration |
| `fight` | Start combat through the real tool; server rolls initiative |
| `nat20` / `nat1` | Deterministic critical fixture, using server dice/outcome helpers |
| `hit` / `heal` | Update the character through the real tool |
| `end` | End combat through the real tool |

For multiplayer, open a second browser profile (or use `127.0.0.1:5180` for the
second player), join with the code, and create another character. Declare an
action in each window to exercise party waiting. Reload to exercise session
resume. Rehearsal sessions expire when its process exits.

## Boundaries

`useGameSocket` still owns every client socket, reconnect, and state merge.
The local additions hold only presentation state and submission pending state.
The server protocol and game engine are unchanged. HP/AC previews use the shared
helpers; the UI never rolls dice, changes HP, or advances initiative.
