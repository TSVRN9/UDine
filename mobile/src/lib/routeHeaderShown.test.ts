// #281 (third instance of the #151 class): add-friends, add-friend-qr, export, and qr-confirm
// each drew their own back-chevron/title chrome but were never added to _layout.tsx's
// <Stack.Screen> list, so they silently inherited the root `screenOptions` -- headerShown
// defaulted true, so a native maroon header (titled with the raw route name) rendered ABOVE
// each screen's own header. #151 (friend/[id]) and #219 (cafe/[name]) were the first two
// instances; nobody wired a guard after either one.
//
// The fix (see _layout.tsx) flips the default: root `screenOptions.headerShown` is now `false`,
// so a route that's absent from the <Stack.Screen> list -- or present without an explicit
// `headerShown` -- is safe by construction. Only NATIVE_HEADER_ROUTES below opt back in to the
// native header; every other real route file must resolve to `headerShown: false`.
//
// This is a static-analysis guard, not a rendered-navigator test: it parses _layout.tsx's JSX
// as text (the file is simple and regular enough for this) rather than mounting the whole
// expo-router stack, which would need a much heavier test harness for no extra safety here.
import fs from "node:fs";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "app");
const LAYOUT_PATH = path.join(APP_DIR, "_layout.tsx");

// The only routes that intentionally show the native header instead of their own chrome --
// verified by reading each one: none of them use useSafeAreaInsets or draw a back button, they
// rely entirely on the native header for title, back affordance, and top inset.
const NATIVE_HEADER_ROUTES = new Set(["filters", "favorites", "event-detail", "press", "newsletter"]);

function parseLayout(source: string): {
  rootHeaderShown: boolean | undefined;
  rootHeaderBackButtonDisplayMode: string | undefined;
  perRoute: Map<string, boolean | undefined>;
  perRouteTitle: Map<string, string | undefined>;
} {
  const screenOptionsMatch = source.match(/<Stack\s+screenOptions=\{\{([\s\S]*?)\}\}\s*>/);
  if (!screenOptionsMatch) throw new Error("Could not find <Stack screenOptions={{...}}> in _layout.tsx -- guard's parser is stale");
  const rootBlock = screenOptionsMatch[1];
  const rootMatch = rootBlock.match(/headerShown:\s*(true|false)/);
  const rootHeaderShown = rootMatch ? rootMatch[1] === "true" : undefined;
  const backButtonDisplayModeMatch = rootBlock.match(/headerBackButtonDisplayMode:\s*"([^"]*)"/);
  const rootHeaderBackButtonDisplayMode = backButtonDisplayModeMatch ? backButtonDisplayModeMatch[1] : undefined;

  const perRoute = new Map<string, boolean | undefined>();
  // PR #488 review finding: options={{ title: "..." }} was renamed with no assertion anywhere
  // that the rendered header title actually matches -- same regex pass as headerShown above,
  // just pulling a second field out of the same options block.
  const perRouteTitle = new Map<string, string | undefined>();
  const screenRegex = /<Stack\.Screen\s+name="([^"]+)"(?:\s+options=\{\{([\s\S]*?)\}\}\s*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = screenRegex.exec(source))) {
    const [, name, optionsBlock] = m;
    const headerShownMatch = optionsBlock?.match(/headerShown:\s*(true|false)/);
    perRoute.set(name, headerShownMatch ? headerShownMatch[1] === "true" : undefined);
    const titleMatch = optionsBlock?.match(/title:\s*"([^"]*)"/);
    perRouteTitle.set(name, titleMatch ? titleMatch[1] : undefined);
  }
  return { rootHeaderShown, rootHeaderBackButtonDisplayMode, perRoute, perRouteTitle };
}

function effectiveHeaderShown(routeName: string, parsed: ReturnType<typeof parseLayout>): boolean {
  const explicit = parsed.perRoute.get(routeName);
  if (explicit !== undefined) return explicit;
  // Route absent from the Stack.Screen list entirely, or present with no explicit headerShown:
  // both fall through to the root default, then RN's own true default.
  return parsed.rootHeaderShown ?? true;
}

// Excludes _layout.tsx itself and expo-router's special +not-found/+html files, per the issue.
function discoverRouteNames(dir: string, prefix = ""): string[] {
  const names: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      names.push(...discoverRouteNames(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith(".tsx") && entry.name !== "_layout.tsx" && !entry.name.startsWith("+")) {
      names.push(`${prefix}${entry.name.slice(0, -4)}`);
    }
  }
  return names;
}

describe("every route resolves headerShown correctly (guards the #151/#219/#281 class)", () => {
  const source = fs.readFileSync(LAYOUT_PATH, "utf8");
  const parsed = parseLayout(source);
  const routes = discoverRouteNames(APP_DIR);

  it("actually discovered route files (fails closed if the app/ layout ever changes)", () => {
    expect(routes.length).toBeGreaterThan(0);
    // MVP cut (temporary, see archive/full-features): add-friends, add-friend-qr, qr-confirm,
    // privacy, friend/[id] are shelved along with friends/account.
    for (const expected of ["export", "cafe/[name]", "halls/[slug]"]) {
      expect(routes).toContain(expected);
    }
  });

  it.each(discoverRouteNames(APP_DIR).sort())("%s resolves headerShown as intended", (routeName) => {
    const wantsNativeHeader = NATIVE_HEADER_ROUTES.has(routeName);
    expect(effectiveHeaderShown(routeName, parsed)).toBe(wantsNativeHeader);
  });

  // PR #488: the /favorites route's native header title was renamed "Favorites" -> "Notifications"
  // with no test anywhere asserting the rendered title string itself.
  it("favorites route's native header title is 'Notifications'", () => {
    expect(parsed.perRouteTitle.get("favorites")).toBe("Notifications");
  });
});

// Bug: "the iOS back button sometimes says 'index'". Root cause (confirmed by reading
// expo-router's vendored native-stack, node_modules/expo-router/build/react-navigation/
// native-stack/views/NativeStackView.native.js): the back button's label falls back to
// `getHeaderTitle(previousDescriptor.options, previousDescriptor.route.name)` -- i.e. the
// PREVIOUS screen's own `title`/`headerTitle`, and if neither is set, the previous screen's raw
// route NAME. `index` (the 3-pane shell) has headerShown: false and no title, so every push from
// it into a native-header screen (favorites/press/newsletter/event-detail, all reached via
// EventsPane.tsx/YouPane.tsx/openEventTap.ts while `index` is the current route) inherited the
// literal string "index" as the back button's fallback label. Not actually flaky -- deterministic
// every time from those entry points -- but it reads as "sometimes" because most navigation (into
// halls/[slug], cafe/[name], logs) draws its own chrome and never shows a native back button at
// all.
//
// Fix (see _layout.tsx's root `screenOptions`): `headerBackButtonDisplayMode: "minimal"` forces
// every native-header back button to render chevron-only, independent of whatever the previous
// screen's title happens to resolve to -- covers `index` today and any future headerShown:false
// route that becomes a predecessor, without needing to invent a truthful label for a 3-pane shell
// that has none (back can land on any of Home/Events/You).
describe("native-header back buttons never show a route-name fallback (guards the 'back button says index' bug)", () => {
  const source = fs.readFileSync(LAYOUT_PATH, "utf8");
  const parsed = parseLayout(source);

  it("root screenOptions forces chevron-only back buttons", () => {
    expect(parsed.rootHeaderBackButtonDisplayMode).toBe("minimal");
  });
});
