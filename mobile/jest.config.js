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
};
