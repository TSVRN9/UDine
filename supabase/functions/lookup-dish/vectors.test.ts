// Runs shared/vectors/match-query.json (all kind=match cases) against lookup-dish's matchesQueryTokens.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/lookup-dish/vectors.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { matchesQueryTokens } = await import("./index.ts");
import { defineVectorTests } from "../_shared/testing/vectors.ts";

const KNOWN_DIVERGENT: Record<string, string> = {};

defineVectorTests("matchesQueryTokens", "match-query.json", ["match"], (c) => {
  const got = matchesQueryTokens(c.input.name, c.input.query);
  return got === c.expected ? null : `expected ${c.expected}, got ${got}`;
}, KNOWN_DIVERGENT);
