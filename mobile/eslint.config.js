// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    // Generated native projects (`expo run:android`/`run:ios` write these when run locally;
    // EAS builds never materialize them in-tree) and Expo/Metro output.
    ignores: ["dist/*", "ios/*", "android/*", ".expo/*"],
  },
  {
    // eslint-plugin-react-hooks v7's "recommended" (pulled in by eslint-config-expo) folds in
    // React Compiler correctness rules. app.json enables experiments.reactCompiler, so these are
    // real, not speculative. #335 downgraded all four to warn pending an audit; #336 did that
    // audit and restores three of them here -- see the per-rule notes below and the file-scoped
    // overrides further down for the specific findings each one still has to live with.
    rules: {
      // #336: the ONE real finding (PaneStack.tsx's activeIndexRef write during render) is fixed
      // (moved into a useLayoutEffect). Every remaining finding is the idiomatic
      // `useRef(new Animated.Value(x)).current` / `useRef(PanResponder.create(...)).current`
      // read-once-for-stable-identity pattern (or SocialPane's equivalent per-key lazy Map
      // cache) -- audited file-by-file, none of them ever reassign `.current`. Restored to
      // error; the known-safe files get a targeted override below instead of leaving the whole
      // rule at warn.
      "react-hooks/refs": "error",
      // #336: NOT restored. The 9 findings left (grab-n-go/[slug].tsx, halls/[slug].tsx,
      // cafe/[name].tsx, PlateSheet.tsx, filters.tsx, redirect.tsx, CafePdfViewer.tsx) are all
      // the standard fetch-in-an-effect-then-setState pattern -- a cascading-render style/perf
      // nit, not a React Compiler correctness issue (the compiler handles this pattern
      // routinely). Deliberately deferred; fix opportunistically, don't lump in with the
      // ref-safety rules above/below.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/globals": "error",
    },
  },
  {
    // #336 tier 2 audit: every react-hooks/refs finding left in these files is a read-once-
    // during-render access for stable identity (`useRef(new Animated.Value(x)).current`,
    // `useRef(PanResponder.create(...)).current`), or SocialPane's per-friend PanResponder cache
    // (a Map held in a ref, populated lazily and idempotently -- same friendId always produces
    // the same responder, so re-running that read on a memoized/skipped render is harmless).
    // None of them reassign `.current` itself; confirmed with
    // `grep -rn '\.current\s*=[^=]' mobile/src` plus a full `react-hooks/refs: error` repo scan
    // (zero "Cannot update ref during render" errors, only "Cannot access" reads).
    //
    // PaneStack.tsx is deliberately NOT in this list, even though its remaining findings are the
    // same safe idiom: that's the file with #336's one actual reassignment (the old
    // activeIndexRef write), fixed above. Blanket-disabling react-hooks/refs there too would
    // remove the only lint-level guard against that exact bug coming back, so its findings get
    // per-site `eslint-disable-next-line` comments in the file itself instead.
    files: [
      "src/components/PaneHeader.tsx",
      "src/components/Press.tsx",
      "src/components/Skeleton.tsx",
      "src/components/ui/Toggle.tsx",
      "src/lib/sheetAnimation.ts",
      "src/panes/SocialPane.tsx",
    ],
    rules: { "react-hooks/refs": "off" },
  },
  {
    // #336: the compiler's own safe bailout (it explicitly skips optimizing this component
    // rather than guessing), not a miscompilation risk -- see the rule's message: the memo's
    // dependency array is deliberately narrower than `loc` itself (#243's fix for a re-render
    // loop from `loc`'s unstable object identity), which the compiler can't verify is safe.
    // Worth tightening for its own sake (perf) by memoizing `loc` upstream first, but that's a
    // separate, non-trivial change -- not required to close #336.
    // Bracket escaped for minimatch -- `[name]` unescaped is a character class, not a literal.
    files: ["src/app/cafe/\\[name\\].tsx"],
    rules: { "react-hooks/preserve-manual-memoization": "off" },
  },
  {
    // #336: test-only hook-probe harness (`let hookRef = null; function Probe() { hookRef =
    // useHook(); return null; }`), not production code -- not actionable.
    files: ["src/lib/favoriteFoodAlerts.test.tsx"],
    rules: { "react-hooks/globals": "off" },
  },
  {
    // TS test files get jest globals for free from @types/jest (tsconfig's "types": ["jest"]),
    // but ESLint's TS parser doesn't consult that for scope analysis, and plain .js tests get no
    // ambient types at all -- so `describe`/`it`/`expect` read as undefined (no-undef) either way.
    files: ["**/*.test.{js,jsx,ts,tsx}", "**/__tests__/**/*.{js,jsx,ts,tsx}"],
    languageOptions: { globals: globals.jest },
    rules: {
      // jest.mock(...) factories run hoisted, synchronously, before any static import -- they
      // can only reach a dep or a local mock module via require(), not `import`. That's the sole
      // use of require() across the test suite (checked every hit below); it's the platform's
      // API shape, not sloppiness.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);
