import Anthropic from "@anthropic-ai/sdk";
import { config, hasApiKey } from "../config.js";

let client: Anthropic | null = null;

/**
 * Lazily constructed so the server can boot (and tests can run) without a key;
 * only an actual DM turn requires one.
 */
export function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.",
    );
  }
  client ??= new Anthropic({ apiKey: config.apiKey });
  return client;
}

/** Test seam: swap in a stub client. */
export function setClient(stub: Anthropic | null): void {
  client = stub;
}
