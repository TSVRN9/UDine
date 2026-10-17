import { createHash } from "node:crypto";

// Deno copy of shared/src/dishTopic.ts (cannot import @udine/shared; see hours.ts). Vectors: shared/vectors/dish-topic.json.
export function dishTopic(name: string): string {
  const key = name.normalize("NFC").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return "dish-" + createHash("sha256").update(key).digest("hex").slice(0, 16);
}
