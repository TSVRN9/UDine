// Runs shared/vectors/where.json (generated from the Dart implementation) against where.ts.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/_shared/where.vectors.test.ts
import { type Board, whenText, wherePlan } from "./where.ts";
import { defineVectorTests, same } from "./testing/vectors.ts";

defineVectorTests("where.ts", "where.json", ["where"], (c) => {
  const i = c.input;
  const board: Board = { places: i.places, hours: i.hours, grab: i.grab ?? {}, days: i.days };
  const groups = wherePlan(board, i.dish, new Date(i.now), { newton: i.newton });
  const got = { groups, sentences: groups.map((g, k) => whenText(g, k > 0 ? groups[k - 1] : undefined)) };
  return same(got, c.expected) ? null : `expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(got)}`;
}, {});
