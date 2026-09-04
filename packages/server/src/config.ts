import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..");

dotenv.config({ path: join(repoRoot, ".env") });

/**
 * Model defaults follow Anthropic's current guidance: Opus 5 unless the
 * operator explicitly chooses otherwise in .env. Effort is dialled down to
 * "medium" because a DM turn is latency-sensitive in a way a chatbot isn't.
 */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  dmModel: process.env.DM_MODEL || "claude-opus-5",
  dmEffort: (process.env.DM_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max",
  summaryModel: process.env.DM_SUMMARY_MODEL || process.env.DM_MODEL || "claude-opus-5",
  dbPath: join(repoRoot, "data", "game.db"),
  /** Raw messages kept verbatim in the DM prompt; older ones get summarised. */
  liveHistoryWindow: 24,
  summariseBatchSize: 16,
};

export function hasApiKey(): boolean {
  return config.apiKey.trim().length > 0;
}
