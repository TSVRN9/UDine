const { withMainActivity } = require("expo/config-plugins");

const IMPORT_LINE = "import android.content.Intent";

// ponytail: cold-start OAuth redirect fix (#101). When Android reuses a dead singleTask (process
// killed while sitting in the OAuth Custom Tab, task survives in Recents), the redirect intent is
// delivered to the fresh process via onNewIntent instead of onCreate. Expo's
// ReactActivityDelegateWrapper.onNewIntent (node_modules/expo/android/.../ReactActivityDelegateWrapper.kt)
// silently drops any onNewIntent Intent that arrives before the JS bundle finishes loading (its
// `loadAppReady.isCompleted` guard returns early with no forwarding to the bridge and no
// setIntent()) — there's no queue/replay, so the intent is gone. setIntent() here runs *before*
// that wrapper ever sees the intent, so getIntent() durably reflects the redirect URL regardless of
// that race. That's what Linking.getInitialURL() reads, and expo-router polls it at boot — so this
// closes the gap even when the live 'url' JS event never fires.
const ON_NEW_INTENT_OVERRIDE = `
  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }
`;

// How far past "fun onNewIntent(" to look for its setIntent() call. Generous for a
// hand-sized override; a real function body blowing past this is a sign something else is
// going on, not a reason to widen the window.
const ON_NEW_INTENT_SCAN_WINDOW = 400;

function addOAuthColdStartIntentFix(mainActivity) {
  if (mainActivity.language !== "kt") {
    throw new Error(
      "withOAuthColdStartIntentFix only supports a Kotlin MainActivity (got: " +
        mainActivity.language +
        ")"
    );
  }

  let { contents } = mainActivity;

  // Idempotent: don't stack a second override if this already ran, or if MainActivity already
  // overrides onNewIntent for some other reason.
  const alreadyOverridden = contents.includes("fun onNewIntent(");

  if (!alreadyOverridden) {
    if (!contents.includes(IMPORT_LINE)) {
      contents = contents.replace(/^(package [^\n]+\n)/, `$1${IMPORT_LINE}\n`);
    }

    // The class's closing brace is the last non-whitespace character in the generated file.
    // (If this doesn't match — e.g. trailing content after the brace — contents comes back
    // unchanged and the post-condition below catches it.)
    contents = contents.replace(/\}\s*$/, `${ON_NEW_INTENT_OVERRIDE}}\n`);
  }

  // Post-condition, checked on every path (freshly injected AND already-overridden): whatever
  // onNewIntent ends up in the file, it must call setIntent(), or #101 (the cold-start OAuth
  // redirect silently dropped) comes back. Catches both the injection silently no-op'ing above
  // and a future template shipping its own onNewIntent that doesn't call setIntent().
  const idx = contents.indexOf("fun onNewIntent(");
  const scanned = idx === -1 ? "" : contents.slice(idx, idx + ON_NEW_INTENT_SCAN_WINDOW);
  if (!scanned.includes("setIntent(")) {
    throw new Error(
      "withOAuthColdStartIntentFix (#101): MainActivity.onNewIntent doesn't call setIntent() — " +
        "the cold-start OAuth redirect fix did not take effect."
    );
  }

  return { ...mainActivity, contents };
}

module.exports = function withOAuthColdStartIntentFix(config) {
  return withMainActivity(config, (config) => {
    config.modResults = addOAuthColdStartIntentFix(config.modResults);
    return config;
  });
};

// Exposed for unit testing the pure transform without running a full prebuild.
module.exports.transform = addOAuthColdStartIntentFix;
