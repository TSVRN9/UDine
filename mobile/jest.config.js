// Pin TZ here too, not just in package.json's "test" script (`TZ=America/New_York jest`) — a bare
// `npx jest` (skipping the npm script) otherwise runs in the host's TZ, and date-sensitive tests can
// silently pass by coincidence on other US zones or fail outright on UTC hosts/CI (#195). Playwright
// pins the equivalent `timezoneId: "America/New_York"` in web/playwright.config.ts; this mirrors it.
// Must run before jest-expo/RN internals read process.env.TZ at require time.
process.env.TZ = "America/New_York";

// Moved out of package.json's "jest" key so this timeout can carry its justification (#131).
//
// testTimeout: 30000 exists for exactly one measured reason — on a cold jest cache
// (`npx jest --clearCache`, fresh checkout, clean CI container), the FIRST test in any suite that
// renders a real screen through react-test-renderer pays the babel transform of the entire
// lazily-required react-native/expo component graph (SectionList → VirtualizedList → …)
// synchronously inside its own test body, because babel-preset-expo enables inline requires.
// Measured on hallMenu.test.tsx's first test: 4875ms on one idle core; 7.9s/11.5s/20.2s across
// three runs on one 50%-contended core (each organically failing jest's 5000ms default with the
// exact flake both reviewers reported in #131) — versus 360ms for the identical cold test once ANY
// other suite's run has populated the shared on-disk transform cache, and 13–74ms for every other
// test in the file. So the cost is one-time, environment-level transform work, not product logic
// or a hang; a per-test timeout is the wrong classifier for it, and 30s (clear of the 20.2s worst
// case observed under deliberate CPU starvation) keeps a real hang detectable without misfiling
// legitimate first-run work. Do NOT "fix" a cold-cache timeout in a render-heavy suite by
// restructuring the suite — it will just move which test pays the transform.
module.exports = {
  preset: "jest-expo",
  testTimeout: 30000,
  // #325: `.txt` is metro.config.js's project-specific asset extension (the vendored pdf.js
  // files, shipped as expo-asset bundled assets instead of base64 JS constants) -- jest-expo's own
  // preset only wires its asset transform up for its own hardcoded default extension list, so this
  // repo's `.txt` extension needs adding here too. jest-config merges a local `transform` key with
  // the preset's own rather than replacing it (see jest-config/build/normalize.js's
  // mergeOptionWithPreset), so this only adds a rule, it doesn't drop the preset's babel/asset
  // transforms for every other extension.
  transform: {
    "\\.txt$": require.resolve("jest-expo/src/preset/assetFileTransformer.js"),
  },
  // react-native-gesture-handler's own jestSetup mocks its native module (RNGestureHandlerModule)
  // so Gesture.Pan()/GestureDetector can run under jest without a real native runtime, and expose
  // fireGestureHandler for driving gesture callbacks in tests (see MealTabPager.test.tsx /
  // paneStack.test.tsx). Same array-merge-with-preset behavior as `transform` above -- this adds a
  // setup file, it doesn't drop jest-expo's own.
  setupFiles: [require.resolve("react-native-gesture-handler/jestSetup")],
  // react-native-reanimated ships a same-shape JS-only mock (synchronous shared values, withTiming/
  // withSpring resolving immediately, runOnJS as identity) that's REQUIRED under jest -- the real
  // package reaches for a native TurboModule that doesn't exist in this environment. Same
  // moduleNameMapper the library's own docs recommend for any RN project's Jest config.
  moduleNameMapper: {
    "^react-native-reanimated$": "react-native-reanimated/mock",
  },
  // react-native-reanimated's own mock still pulls in a few real (non-mocked) helpers from its own
  // index, which in turn reach into react-native-worklets' `.native.ts` files -- those touch a
  // native TurboModule that doesn't exist under jest ("Cannot read properties of undefined
  // (reading 'loadUnpackersWithCode')" without this). react-native-worklets ships a resolver at a
  // stable public path for exactly that (steers its own imports away from the `.native` extension
  // under jest) -- but its guard is a raw substring check on `basedir` that false-positives under
  // pnpm's isolated node_modules layout (see ./jest.worklets-resolver.js's own doc for the specific
  // collision this caused: expo-modules-core's pnpm-hashed directory name happens to embed
  // "react-native-worklets" as one of ITS OWN peer-dependency qualifiers, tripping the same
  // extension-stripping meant only for worklets' own files and breaking jest-expo's native-view-
  // manager mocking for unrelated packages like expo-linear-gradient). This local wrapper applies
  // the same fix, scoped to an actual `node_modules/react-native-worklets/` path segment.
  resolver: require.resolve("./jest.worklets-resolver.js"),
};
