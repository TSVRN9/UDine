import { createHash } from "node:crypto";

/** The FCM topic a favourited dish is followed under: `dish-` + 16 hex of SHA-256 of the normalized name. Same rule as app/lib/core/dish_topic.dart (vectors: shared/vectors/dish-topic.json). Not re-exported from index.ts: node:crypto has no place in the RN bundle. */
export function dishTopic(name: string): string {
  const key = name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return "dish-" + createHash("sha256").update(key).digest("hex").slice(0, 16);
}
