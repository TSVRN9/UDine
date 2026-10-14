// Runs shared/vectors/match-query.json (all kind=match cases) against lookup-dish's matchesQueryTokens.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/lookup-dish/vectors.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { matchesQueryTokens } = await import("./index.ts");
import { defineVectorTests } from "../_shared/testing/vectors.ts";

// Cases where matchesQueryTokens disagrees with the vector. Not fixed here: owner decides which side is right.
const KNOWN_DIVERGENT: Record<string, string> = {
  "\"Anything\" / \"\"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
  "\"Anything\" / \"   \"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
  "\"Anything\" / \"!!!\"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
  "\"Anything\" / \"???\"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
  "\"\" / \"\"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
  "\"\u65e5\u672c Ramen\" / \"\u65e5\u672c\"": "expected false for a query with no alphanumeric token (empty, blank, punctuation-only, or only non-ASCII letters); Deno's [].every() is vacuously true, TS requires at least one token",
};

defineVectorTests("matchesQueryTokens", "match-query.json", ["match"], (c) => {
  const got = matchesQueryTokens(c.input.name, c.input.query);
  return got === c.expected ? null : `expected ${c.expected}, got ${got}`;
}, KNOWN_DIVERGENT);
