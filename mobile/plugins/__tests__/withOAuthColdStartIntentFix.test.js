const { transform } = require("../withOAuthColdStartIntentFix");

const NORMAL_TEMPLATE = `package com.udinetogether.udine
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
`;

const TRAILING_CONTENT_AFTER_BRACE = `${NORMAL_TEMPLATE}// @generated end some-future-plugin marker
`;

const OWN_ON_NEW_INTENT_WITH_SET_INTENT = `package com.udinetogether.udine
import android.content.Intent

class MainActivity : ReactActivity() {
  override fun onNewIntent(intent: Intent) {
    setIntent(intent)
    super.onNewIntent(intent)
  }
}
`;

const OWN_ON_NEW_INTENT_WITHOUT_SET_INTENT = `package com.udinetogether.udine
import android.content.Intent

class MainActivity : ReactActivity() {
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
  }
}
`;

describe("withOAuthColdStartIntentFix transform", () => {
  it("injects onNewIntent calling setIntent into a normal template", () => {
    const result = transform({ language: "kt", contents: NORMAL_TEMPLATE });
    expect(result.contents).toContain("override fun onNewIntent(intent: Intent)");
    expect(result.contents).toContain("setIntent(intent)");
  });

  it("throws instead of silently no-op'ing when the closing brace can't be found", () => {
    expect(() =>
      transform({ language: "kt", contents: TRAILING_CONTENT_AFTER_BRACE })
    ).toThrow(/#101/);
  });

  it("leaves an existing onNewIntent that already calls setIntent alone", () => {
    const result = transform({
      language: "kt",
      contents: OWN_ON_NEW_INTENT_WITH_SET_INTENT,
    });
    expect(result.contents).toBe(OWN_ON_NEW_INTENT_WITH_SET_INTENT);
  });

  it("throws when an existing onNewIntent doesn't call setIntent", () => {
    expect(() =>
      transform({ language: "kt", contents: OWN_ON_NEW_INTENT_WITHOUT_SET_INTENT })
    ).toThrow(/#101/);
  });
});
