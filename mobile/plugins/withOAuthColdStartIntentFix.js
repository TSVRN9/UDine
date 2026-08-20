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
  if (contents.includes("fun onNewIntent(")) {
    return mainActivity;
  }

  if (!contents.includes(IMPORT_LINE)) {
    contents = contents.replace(/^(package [^\n]+\n)/, `$1${IMPORT_LINE}\n`);
  }

  // The class's closing brace is the last non-whitespace character in the generated file.
  contents = contents.replace(/\}\s*$/, `${ON_NEW_INTENT_OVERRIDE}}\n`);

  return { ...mainActivity, contents };
}

module.exports = function withOAuthColdStartIntentFix(config) {
  return withMainActivity(config, (config) => {
    config.modResults = addOAuthColdStartIntentFix(config.modResults);
    return config;
  });
};
