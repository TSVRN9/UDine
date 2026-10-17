// Runs shared/vectors/dish-topic.json against the Deno dishTopic copy.
//
// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/_shared/dishTopic.vectors.test.ts
import { dishTopic } from "./dishTopic.ts";
import { defineVectorTests } from "./testing/vectors.ts";

defineVectorTests("dishTopic", "dish-topic.json", ["topic"], (c) => {
  const got = dishTopic(c.input.name);
  return got === c.expected ? null : `${got} != ${c.expected}`;
}, {});
