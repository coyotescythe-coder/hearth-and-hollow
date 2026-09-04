import { config } from "../config.js";
import * as repo from "../db/repositories.js";
import { getClient } from "./client.js";

/**
 * Keeps the DM prompt bounded. Once the live transcript grows past
 * `liveHistoryWindow`, the oldest batch is folded into a single "chronicle"
 * entry and the originals stop being sent to the model. Without this, a
 * campaign that runs for an evening slowly degrades and then blows the window.
 */
export async function compactIfNeeded(sessionId: string): Promise<void> {
  const live = repo.getLiveMessages(sessionId);
  if (live.length <= config.liveHistoryWindow) return;

  const batch = live.slice(0, config.summariseBatchSize);
  if (batch.length === 0) return;

  const transcript = batch
    .map((m) => `${m.authorType === "dm" ? "DM" : m.authorName}: ${m.content}`)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: config.summaryModel,
    max_tokens: 1000,
    system:
      "You compress tabletop RPG session logs. Preserve names, places, promises, injuries, loot, unresolved threats, and anything a Dungeon Master would need to stay consistent later. Drop atmosphere and repetition. Write a compact past-tense chronicle of 150 words or less. No preamble.",
    messages: [{ role: "user", content: transcript }],
  });

  const summary = response.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!summary) return;

  // Backdate to the oldest message it replaces so history stays in order.
  repo.addMessage(
    sessionId,
    "system",
    "Chronicle",
    `Earlier in this adventure: ${summary}`,
    batch[0]!.createdAt,
  );
  repo.markSummarized(batch.map((m) => m.id));
}
