import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    rules: {
      // hours.test.ts destructures `{ location_id, ...withoutLocationId }` to build a fixture
      // missing that one field -- `location_id` itself is deliberately unused.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // Test doubles here cast a partial object `as any` to stand in for the real SupabaseClient
    // (see the "test double, shape doesn't need to match SupabaseClient exactly" comments this
    // predates -- a stale reference to Biome, never actually configured in this repo). Same
    // intent as mobile's jest.mock() require() carve-out: a structural need of the test's mocking
    // approach, not a real type-safety gap in product code.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
