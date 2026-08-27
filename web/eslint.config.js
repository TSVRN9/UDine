import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  // Non-type-checked recommended only -- `recommendedTypeChecked` would re-run the same checks
  // `pnpm --filter web check` (svelte-check, backed by tsc) already does, just slower and with a
  // second, ESLint-flavored error format for the same finding.
  tseslint.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      // browser: this is a SvelteKit app's client code; node: universal `load` functions and
      // hooks also run server-side.
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      // Lets svelte-eslint-parser hand `<script lang="ts">` blocks to the TS parser instead of
      // espree -- without this, every TS-flavored `.svelte` file is a parse error.
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // typescript-eslint's own `recommended` config disables core `no-undef` for `.ts`/`.tsx`
      // (svelte-check/tsc already catch real undefined-identifier bugs, more accurately, with
      // type info this rule doesn't have -- e.g. it doesn't know ambient lib.dom types like
      // BufferSource exist). That override is scoped to `.ts` file globs and doesn't reach
      // `.svelte` script blocks, so it needs restating here.
      "no-undef": "off",
    },
  },
  {
    // svelte/no-navigation-without-resolve checks against SvelteKit's typed-routing resolve()
    // (real API, available at this kit version) -- but adopting it means rewriting every
    // href/goto() across ~14 route files (30 call sites) with a route-id + params literal each,
    // which is a real behavior-risk navigation change, not a lint-setup change.
    // TODO: migrate hrefs/goto() calls to resolve() and restore this to 'error'.
    rules: { "svelte/no-navigation-without-resolve": "warn" },
  },
  {
    ignores: [".svelte-kit/**", "build/**"],
  },
);
