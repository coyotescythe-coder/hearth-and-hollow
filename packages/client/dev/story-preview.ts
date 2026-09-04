/**
 * Isolated UI rehearsal. Run the normal `npm run dev` first, then
 * `npm run dev:story --workspace @dnd/client` and open localhost:5180.
 * Real router, engine, tools, shared rules and socket; only the DM is scripted.
 * Uses in-memory SQLite. Never reads or changes saved adventures.
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../../server/src/config.js";
import { getDb, openMemoryDb } from "../../server/src/db/index.js";
import { setStreamTurn } from "../../server/src/game/engine.js";
import { rollD20, outcomeFor } from "../../server/src/dice/roll.js";
import { broadcast } from "../../server/src/ws/hub.js";
import type { ApiResult } from "../../server/src/dm/orchestrator.js";

openMemoryDb();
config.port = 8788;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tool = (name: string, input: Record<string, unknown>) => ({
  type: "tool_use",
  id: `preview-${name}`,
  name,
  input,
});
const result = (...content: Array<Record<string, unknown>>): ApiResult => ({
  content,
  stop_reason: content.some((b) => b.type === "tool_use")
    ? "tool_use"
    : "end_turn",
});

setStreamTurn(async (params, onText) => {
  const prompt =
    ([...params.messages]
      .reverse()
      .find(
        (m) =>
          typeof m.content === "string" &&
          m.content.includes("<campaign_state>"),
      )?.content as string) ?? "";
  const trigger = prompt.split("</campaign_state>").at(-1) ?? "";
  const actor = prompt.match(/CHARACTERS\n  - (.+?), level/)?.[1] ?? "Wrenn";
  const narrate = async (text: string) => {
    await delay(600);
    for (const token of text.match(/\S+\s*/g) ?? []) {
      onText(token);
      await delay(42);
    }
    return result({ type: "text", text });
  };
  const last = params.messages.at(-1);
  if (Array.isArray(last?.content)) {
    if (/Open the adventure/.test(trigger))
      return narrate(
        "The last light catches on the old stones of Briarwatch. Beyond the gate, the pines stand close together, as though keeping a secret.\n\nYou find the lantern where the letter said it would be: hanging from a crooked branch, still warm. There is no wind, but the flame leans toward the forest.\n\nThen, somewhere between the trees, a bell rings once.\n\nThe road behind you is familiar. The path ahead is not.",
      );
    if (/start_combat/.test(JSON.stringify(params.messages.at(-2)?.content)))
      return narrate(
        "A shape steps out of the trees. Then another. Their blades catch the lantern light.\n\nThe taller one smiles without warmth. “You should have stayed on the road.”",
      );
    if (
      /update_character/.test(JSON.stringify(params.messages.at(-2)?.content))
    )
      return narrate(
        "The blow knocks the breath from your chest. You find your footing on the wet stones and raise your guard. The lantern is still burning.",
      );
    if (/end_combat/.test(JSON.stringify(params.messages.at(-2)?.content)))
      return narrate(
        "The last blade lowers. Slowly, the ordinary sounds of the forest return. You have earned this silence.",
      );
    return narrate(
      "You draw a steady breath and commit. For a moment, everything rests on the smallest movement. The forest seems to lean closer.",
    );
  }
  if (/Open the adventure/.test(trigger))
    return result(
      tool("update_scene", {
        location: "The gates of Briarwatch",
        summary:
          "An abandoned watchtower at the edge of the old forest. A warm lantern. A bell that should not be ringing.",
        flags: [
          {
            key: "the_letter",
            value: "Meet me where the road forgets its name.",
          },
          {
            key: "the_lantern",
            value: "Its flame points into the forest, even without wind.",
          },
        ],
      }),
    );
  if (/It is .+'s turn/.test(trigger)) {
    await delay(1600);
    return narrate(
      "The brigand circles to your left, boots grinding against the stone. A blade darts out of the mist, testing your guard, then withdraws. Your opening will come.",
    );
  }
  if (/\bend\b|\bflee\b/i.test(trigger))
    return result(
      tool("end_combat", { outcome: "The brigands retreat into the trees." }),
    );
  if (/\bfight\b/i.test(trigger))
    return result(
      tool("start_combat", {
        enemies: [
          { name: "Briar brigand", hp: 16, ac: 12, dex_mod: 1 },
          { name: "Hollow archer", hp: 10, ac: 11, dex_mod: 2 },
        ],
      }),
    );
  if (/\bhit\b|\bheal\b/i.test(trigger))
    return result(
      tool("update_character", {
        character: actor,
        hp_delta: /\bheal\b/i.test(trigger) ? 4 : -3,
        add_conditions: [],
        remove_conditions: [],
      }),
    );
  if (/\bnat20\b|\bnat1\b/i.test(trigger)) {
    // Deterministic visual fixture uses the SERVER's injectable RNG and outcome helper.
    const natural = /\bnat20\b/i.test(trigger) ? 20 : 1;
    const raw = rollD20(
      2,
      natural === 20 ? "advantage" : "disadvantage",
      (() => {
        let first = true;
        return () => {
          if (first) {
            first = false;
            return 8;
          }
          return natural;
        };
      })(),
    );
    const row = getDb()
      .prepare(
        "SELECT session_id FROM characters WHERE name = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(actor) as { session_id: string };
    broadcast(row.session_id, {
      type: "dice_result",
      roll: {
        ...raw,
        actor,
        purpose:
          natural === 20
            ? "Find an impossible opening"
            : "Keep your footing on the stones",
        dc: 15,
        advantage: natural === 20 ? "advantage" : "disadvantage",
        outcome: outcomeFor(raw, 15, true),
      },
    });
    return narrate(
      natural === 20
        ? "For one perfect heartbeat, you see the opening. Not luck, exactly. Something closer to being in the right place in a story that wants to be told.\n\nYou move. The impossible becomes inevitable."
        : "Your boot finds the one loose stone. The world tilts. For a heartbeat there is only the cold certainty that this is going to hurt.\n\nSomewhere in the dark, someone laughs.",
    );
  }
  return result(
    tool("roll_check", {
      character: actor,
      ability: "dex",
      purpose: "Follow the light into the hollow",
      dc: 13,
      advantage: "advantage",
      proficient: true,
    }),
  );
});

await import("../../server/src/index.js");
// Same-origin proxy to the existing Vite server. The preview owns only its own ports.
const vitePort = Number(process.env.UI_VITE_PORT ?? 5173);
const proxy = createServer(async (req, res) => {
  try {
    const upstream = await fetch(
      `http://localhost:${req.url === "/health" ? 8788 : vitePort}${req.url}`,
      { headers: { accept: req.headers.accept ?? "*/*" } },
    );
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "text/plain",
      "cache-control": "no-store",
    });
    if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res);
    else res.end();
  } catch {
    res
      .writeHead(502)
      .end("Start the normal dev server on localhost:5173 first.");
  }
});
const bridge = new WebSocketServer({ noServer: true });
proxy.on("upgrade", (req, socket, head) =>
  bridge.handleUpgrade(req, socket, head, (client) => {
    const remote = new WebSocket(
      `ws://localhost:${req.url?.startsWith("/ws") ? 8788 : vitePort}${req.url}`,
      req.headers["sec-websocket-protocol"],
    );
    const queued: Array<{ data: Buffer; binary: boolean }> = [];
    client.on("message", (data, binary) => {
      if (remote.readyState === WebSocket.OPEN) remote.send(data, { binary });
      else queued.push({ data: data as Buffer, binary });
    });
    remote.on("open", () =>
      queued
        .splice(0)
        .forEach(({ data, binary }) => remote.send(data, { binary })),
    );
    remote.on("message", (data, binary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
    });
    client.on("close", () => remote.close());
    remote.on("close", () => client.close());
    client.on("error", () => remote.close());
    remote.on("error", () => client.close());
  }),
);
proxy.listen(5180, "127.0.0.1", () =>
  console.log(
    "[UI rehearsal] http://localhost:5180 — actions: fight, nat20, nat1, hit, heal, end. In combat, put the command in the action description. All data is temporary.",
  ),
);
