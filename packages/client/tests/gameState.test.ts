import { test } from "node:test";
import assert from "node:assert/strict";
import { reducer, type GameState } from "../src/hooks/useGameSocket.js";
import type { GameMessage, ServerMessage } from "@dnd/shared";

test("an expired session returns to the landing screen instead of keeping a stale playable snapshot", () => {
  const state = empty();
  state.snapshot = {
    sessionId: "expired",
    joinCode: "ABC123",
    scene: { location: "A road", summary: "", flags: {} },
    players: [],
    characters: [],
    messages: [],
    combat: null,
    youPlayerId: "player",
    youCharacterId: null,
    awaitingPlayerIds: [],
  };
  const expired = push(state, {
    type: "error",
    message: "That session has expired. Start a new adventure.",
  });
  assert.equal(expired.snapshot, null);
  assert.equal(expired.pending, false);
  assert.equal(expired.dmThinking, false);
  assert.match(expired.error!, /expired/);
});

const empty = (): GameState => ({
  connection: "open",
  snapshot: null,
  feed: [],
  streaming: "",
  streamId: null,
  streamChunks: [],
  pending: false,
  partySession: false,
  dmThinking: false,
  error: null,
});
const push = (state: GameState, message: ServerMessage) =>
  reducer(state, { type: "server", message });
const narration = (content: string): GameMessage => ({
  id: "persisted-message-id",
  sessionId: "session",
  authorType: "dm",
  authorName: "DM",
  content,
  createdAt: 1,
});

test("committing a streamed narration preserves its DOM identity and token boundaries", () => {
  let state = push(empty(), { type: "narration_start", messageId: "live-id" });
  state = push(state, {
    type: "narration_delta",
    messageId: "live-id",
    text: "The lan",
  });
  state = push(state, {
    type: "narration_delta",
    messageId: "live-id",
    text: "tern glows. ",
  });
  state = push(state, {
    type: "narration_end",
    message: narration("The lantern glows."),
  });
  assert.equal(state.feed[0]?.id, "live-id");
  assert.equal(state.feed[0]?.kind, "message");
  if (state.feed[0]?.kind === "message")
    assert.deepEqual(state.feed[0].chunks, ["The lan", "tern glows. "]);
  assert.equal(state.streaming, "");
  assert.equal(state.streamId, null);
});

test("a reconnect mid-stream shows incoming words, locks input, and commits the full server prose", () => {
  let state = push(empty(), {
    type: "narration_delta",
    messageId: "already-running",
    text: "the trees.",
  });
  assert.equal(state.dmThinking, true);
  assert.equal(state.streamId, "already-running");
  assert.equal(state.streaming, "the trees.");
  state = push(state, {
    type: "narration_end",
    message: narration("A lantern waits among the trees."),
  });
  const entry = state.feed[0];
  assert.equal(entry?.kind, "message");
  if (entry?.kind === "message") {
    assert.equal(entry.message.content, "A lantern waits among the trees.");
    assert.equal(entry.chunks, undefined);
  }
});

test("an interrupted narration releases pending input without leaving phantom prose", () => {
  let state = push(empty(), {
    type: "narration_delta",
    messageId: "interrupted",
    text: "The unfinished",
  });
  state = reducer(state, { type: "sending" });
  state = push(state, { type: "dm_thinking", thinking: false });
  assert.equal(state.dmThinking, false);
  assert.equal(state.pending, false);
  assert.equal(state.streaming, "");
  assert.equal(state.streamId, null);
  assert.deepEqual(state.streamChunks, []);
});
