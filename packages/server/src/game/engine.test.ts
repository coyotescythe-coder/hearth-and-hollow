import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { ServerMessage } from "@dnd/shared";
import { openMemoryDb } from "../db/index.js";
import * as repo from "../db/repositories.js";
import * as hub from "../ws/hub.js";
import { setStreamTurn, submitPlayerAction } from "./engine.js";
import type { ApiResult, ApiTurn, StreamTurn } from "../dm/orchestrator.js";

/**
 * End-to-end through the real engine, DB, and dice — only the model itself is
 * scripted. Proves the loop that matters: player acts → DM asks for a roll →
 * the *server* rolls → the result goes back to the model → narration lands.
 */

interface Harness {
  sessionId: string;
  playerId: string;
  characterName: string;
  sent: ServerMessage[];
}

function setup(): Harness {
  openMemoryDb();
  const session = repo.createSession();
  const player = repo.createPlayer(session.id, "Dre", true);
  const character = repo.createCharacter({
    playerId: player.id,
    sessionId: session.id,
    name: "Wrenn",
    cls: "Rogue",
    abilities: { str: 10, dex: 16, con: 12, int: 13, wis: 11, cha: 14 },
    notes: "",
  });

  const sent: ServerMessage[] = [];
  const fakeSocket = {
    OPEN: 1,
    readyState: 1,
    send: (payload: string) => sent.push(JSON.parse(payload) as ServerMessage),
  };
  hub.register(session.id, player.id, fakeSocket as never);

  return { sessionId: session.id, playerId: player.id, characterName: character.name, sent };
}

/** Returns each scripted API result in turn, recording what it was sent. */
function scriptModel(results: ApiResult[], seen: ApiTurn[][] = []): StreamTurn {
  let call = 0;
  return async (params, onText) => {
    seen.push(params.messages);
    const result = results[Math.min(call, results.length - 1)]!;
    call += 1;
    for (const block of result.content) {
      if (block.type === "text") onText(String(block.text));
    }
    return result;
  };
}

beforeEach(() => setStreamTurn(undefined));

test("a player action triggers a server-rolled check, then narration", async () => {
  const h = setup();
  const seen: ApiTurn[][] = [];

  setStreamTurn(
    scriptModel(
      [
        {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "roll_check",
              input: {
                character: "Wrenn",
                ability: "dex",
                purpose: "pick the rusted lock",
                dc: 15,
                advantage: "none",
                proficient: true,
              },
            },
          ],
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "The tumblers give with a soft click." }],
        },
      ],
      seen,
    ),
  );

  await submitPlayerAction(h.sessionId, h.playerId, "I try to pick the lock");

  // The server rolled real dice and told everyone.
  const rolls = h.sent.filter((m) => m.type === "dice_result");
  assert.equal(rolls.length, 1);
  const roll = (rolls[0] as Extract<ServerMessage, { type: "dice_result" }>).roll;
  assert.equal(roll.actor, "Wrenn");
  assert.equal(roll.dc, 15);
  // DEX 16 (+3) plus proficiency (+2) at level 1.
  assert.equal(roll.modifier, 5);
  assert.ok(roll.kept[0]! >= 1 && roll.kept[0]! <= 20);
  assert.equal(roll.total, roll.kept[0]! + 5);

  // The model was handed the actual number, not left to invent one.
  const secondCall = seen[1]!;
  const toolResultTurn = secondCall[secondCall.length - 1]!;
  const resultBlocks = toolResultTurn.content as Array<Record<string, unknown>>;
  assert.equal(resultBlocks[0]!.type, "tool_result");
  assert.match(String(resultBlocks[0]!.content), /"total":\s*\d+/);

  // Narration was streamed and persisted.
  assert.ok(h.sent.some((m) => m.type === "narration_start"));
  const ended = h.sent.find((m) => m.type === "narration_end");
  assert.ok(ended, "expected narration_end");
  assert.match(
    (ended as Extract<ServerMessage, { type: "narration_end" }>).message.content,
    /tumblers/,
  );

  const stored = repo.getMessages(h.sessionId);
  assert.equal(stored.at(-1)!.authorType, "dm");
});

test("starting combat does not skip the first combatant", async () => {
  const h = setup();

  setStreamTurn(
    scriptModel([
      {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_c",
            name: "start_combat",
            input: { enemies: [{ name: "Goblin", hp: 7, ac: 13, dex_mod: 2 }] },
          },
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Steel rings out." }] },
    ]),
  );

  await submitPlayerAction(h.sessionId, h.playerId, "I kick the door in");

  const combat = repo.getCombat(h.sessionId);
  assert.ok(combat, "combat should be active");
  assert.equal(combat.participants.length, 2);
  assert.equal(combat.round, 1);

  // Initiative uses real dice, so either side may win the roll. The invariant
  // holds either way: control comes to rest on the player, having auto-resolved
  // any NPCs ahead of them and skipped nobody.
  //
  // Player wins initiative  -> idx 0, untouched (combat had only just started).
  // Goblin wins initiative  -> its turn is auto-run, then control lands on idx 1.
  const playerIdx = combat.participants.findIndex((p) => !p.isNpc);
  assert.equal(
    combat.currentTurnIdx,
    playerIdx,
    "combat must advance to the player without skipping whoever won initiative",
  );
  assert.equal(combat.participants[combat.currentTurnIdx]!.isNpc, false);
});

test("out-of-turn actions are rejected during combat", async () => {
  const h = setup();

  // Put a fight on the board with the goblin holding the current turn.
  const combat = {
    active: true,
    round: 1,
    currentTurnIdx: 0,
    participants: [
      {
        id: "p-goblin",
        characterId: null,
        name: "Goblin",
        isNpc: true,
        initiative: 18,
        hpCurrent: 7,
        hpMax: 7,
        ac: 13,
        turnOrderIdx: 0,
      },
      {
        id: "p-wrenn",
        characterId: repo.getCharacterByPlayer(h.playerId)!.id,
        name: "Wrenn",
        isNpc: false,
        initiative: 9,
        hpCurrent: 9,
        hpMax: 9,
        ac: 13,
        turnOrderIdx: 1,
      },
    ],
  };
  repo.saveCombat(h.sessionId, combat);
  h.sent.length = 0;

  let modelCalled = false;
  setStreamTurn(async () => {
    modelCalled = true;
    return { stop_reason: "end_turn", content: [] };
  });

  await submitPlayerAction(h.sessionId, h.playerId, "I stab it");

  assert.equal(modelCalled, false, "the DM should not be asked to act out of turn");
  const errors = h.sent.filter((m) => m.type === "error");
  assert.equal(errors.length, 1);
  assert.match((errors[0] as Extract<ServerMessage, { type: "error" }>).message, /Goblin/);
});
