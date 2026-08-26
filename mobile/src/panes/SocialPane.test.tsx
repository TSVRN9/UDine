import type { DiningEvent } from "@udine/shared";

// Real @udine/shared's fetchEvents does a live network fetch -- keep everything else (DINING_HALLS
// etc., which SocialPane also imports) real, stub just the network call. Same pattern as
// menuFetchWithSeenTracking.test.ts's @udine/shared partial mock.
const mockFetchEvents = jest.fn<Promise<DiningEvent[]>, []>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchEvents: () => mockFetchEvents(),
}));

// Same rationale as YouPane.test.tsx: explicit factory, not a bare automock -- the real
// ../lib/supabase drags in native/URL validation unavailable outside jest-expo's native harness.
// `from` is a jest.fn() so each test can control what each table query resolves to via
// mockImplementation, keyed on the table name -- SocialPane hits friendships/profiles/pings.
const mockFrom = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock("../lib/auth", () => ({
  signInWithGoogle: jest.fn(),
}));

// #181: sendOrQueuePing/flushQueuedPings touch real SQLite (via ./db -> expo-sqlite), which can't
// run under jest (see seenDishesStorage.test.ts's own comment for the confirmed error). Both are
// fire-and-forget/`.catch`-guarded in SocialPane itself, so an unmocked real throw wouldn't crash
// these tests either way, but mocking keeps the offline/queue tests below deterministic and able to
// assert on calls directly.
const mockSendOrQueuePing = jest.fn().mockResolvedValue("sent");
const mockFlushQueuedPings = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/pingQueue", () => ({
  sendOrQueuePing: (...args: unknown[]) => mockSendOrQueuePing(...args),
  flushQueuedPings: (...args: unknown[]) => mockFlushQueuedPings(...args),
  // isTransientPingError is real, pure logic (not SQLite-backed) -- keep it real so the
  // send-while-offline tests below exercise SocialPane's actual classification, not a stub.
  isTransientPingError: jest.requireActual("../lib/pingQueue").isTransientPingError,
}));

// SocialPane reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// YouPane.test.tsx/hallMenu.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// SocialPane renders a Link for "+ Add" -- stub it flat since there's no navigator in this tree.
//
// useFocusEffect: the real hook fires once per mount (and again each time the screen regains
// focus), not on every unrelated re-render. A naive "call every render" mock (used elsewhere in
// this repo, e.g. YouPane.test.tsx) happens to be safe there because those panes' refresh
// functions settle into referentially-stable state. SocialPane's refresh() always constructs a
// fresh `new Map(...)` for profilesById, so an every-render mock would never let React bail out of
// re-rendering -- it'd spin until Jest's test timeout. Firing once per distinct callback identity
// (i.e. once per `[session]` dependency change: once as a no-op before session loads, once for
// real once it does) is a closer approximation of the real hook and avoids that.
const mockSeenFocusCallbacks = new WeakSet<() => void>();
// router: SocialPane's avatar tap-to-profile (#94) calls the top-level `router.push` singleton
// directly (same import shape as app/index.tsx), not the useRouter() hook -- exported flat here
// too, same treatment as Link/useFocusEffect below. Also the target of #120's card-tap
// classification (pushes /event-detail).
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  Link: require("../lib/mockLink").mockLink,
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

// #120: banner-less event notice rows and event/link classification-driven taps open either the
// in-app pamphlet screen (router.push, mocked above) or expo-web-browser's pop-up in-app browser --
// mocked here so a test can assert which one fired without a real browser/navigator.
const mockOpenBrowserAsync = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

import renderer, { act } from "react-test-renderer";
import { Image, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { DINING_HALLS } from "@udine/shared";
import { SocialPane } from "./SocialPane";
import { supabase } from "../lib/supabase";
import { colors } from "../lib/theme";
import { PING_MESSAGES } from "../lib/pingGesture";

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

// YouPane.test.tsx's own convention: findAllByType(Pressable) doesn't reliably match RN's
// Pressable export under jest-expo's renderer -- accessibilityRole="button" is the reliable
// handle, though it matches every instance layer Pressable renders through (composite + host), not
// just one node per button -- filter down to the ones that actually carry an onPress function. The
// event card is the last such node in the tree (Ping a Friend's sign-in button, when signed out, is
// the only other one, and it always renders first).
function lastButton(root: renderer.ReactTestRenderer) {
  const buttons = root.root.findAllByProps({ accessibilityRole: "button" }).filter((b) => typeof b.props.onPress === "function");
  return buttons[buttons.length - 1];
}

// Merges a RN style prop (object, array, or nested array of either) into one plain object -- same
// helper as YouPane.test.tsx, used here to confirm the gold border actually lands on the first
// avatar, not just that "gold" appears somewhere in styles.
function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) ?? {};
}

function session(userId: string): Session {
  return { user: { id: userId, email: `${userId}@umass.edu` } } as Session;
}

/** Chainable query-builder stub: every method returns `this` except the final `await`, which
 * resolves to `{ data }`. Matches the subset of supabase-js's fluent API SocialPane actually calls
 * (select/eq/or/in/insert). `insert` is a jest.fn() so a test can assert on it directly (e.g. the
 * cancel path must never call it). */
function queryResult(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.or = chain;
  builder.in = chain;
  builder.order = chain;
  builder.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  builder.then = (resolve: (v: { data: unknown[] }) => void) => resolve({ data });
  return builder;
}

/** Minimal fake `GestureResponderEvent` -- just enough shape (a single-touch `touchHistory`) for
 * RN's real `PanResponder` internals (TouchHistoryMath's centroid calc) to compute `moveX`/`moveY`
 * without throwing. SocialPane's own handlers only ever read `gestureState.moveX/moveY`, not the
 * native event itself, so nothing else on this object needs to be real. */
function fakeTouchEvent(pageX: number, pageY: number, timeStamp: number) {
  return {
    nativeEvent: { touches: [{}], changedTouches: [{}], timestamp: timeStamp },
    touchHistory: {
      touchBank: [{ touchActive: true, currentTimeStamp: timeStamp, currentPageX: pageX, currentPageY: pageY, previousPageX: pageX, previousPageY: pageY }],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timeStamp,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchEvents.mockResolvedValue([]);
});

async function renderSocialPane() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<SocialPane />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return root;
}

// expirationDate is always a full ISO instant in real data (shared's mapEvent: `new
// Date(unixSeconds * 1000).toISOString()`), never a bare date -- a mid-afternoon UTC timestamp
// here keeps the rendered "Through <month> <day>" stable across any local test-runner timezone.
const fallFest: DiningEvent = { title: "Fall Fest", featuredImage: "", pdfLink: "", externalLink: "https://example.com", expirationDate: "2026-09-01T16:00:00.000Z", isFeatured: false };
const harvestDinner: DiningEvent = {
  title: "Local Harvest Dinner",
  featuredImage: "https://example.com/banner.jpg",
  pdfLink: "",
  externalLink: "https://example.com/harvest",
  expirationDate: "2026-08-27T16:00:00.000Z",
  isFeatured: true,
};
const pamphletEvent: DiningEvent = {
  title: "Sustainability Big Impact",
  featuredImage: "https://example.com/banner.jpg",
  pdfLink: "https://example.com/poster.jpg",
  externalLink: "",
  expirationDate: "2026-09-01T16:00:00.000Z",
  isFeatured: false,
};

describe("SocialPane", () => {
  it("signed out: shows the sign-in value prop, not a dead end, and still shows events", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([fallFest]);

    const root = await renderSocialPane();
    const body = texts(root);
    expect(body).toMatch(/Sign in required/);
    expect(body).toMatch(/Sign in to add friends and hold-and-release a ping/);
    expect(body).toMatch(/Fall Fest/);
  });

  it("signed in, no friends yet: still shows the +Add slot and the hold/release hint", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "friendships") return queryResult([]);
      return queryResult([]);
    });

    const root = await renderSocialPane();
    const body = texts(root);
    expect(body).toMatch(/Add/);
    expect(body).toMatch(/Hold a friend, then release on a dining hall to ping them/);
    expect(body).not.toMatch(/Sign in required/);
  });

  it("signed in with a friend: renders the friend's name and initials, with a gold border on the first/only avatar", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "friendships") return queryResult([{ user_a: "me", user_b: "friend-1" }]);
      if (table === "profiles") return queryResult([{ user_id: "friend-1", display_name: "Alex" }]);
      return queryResult([]);
    });

    const root = await renderSocialPane();
    const body = texts(root);
    expect(body).toMatch(/Alex/);
    expect(body).toMatch(/A\b/); // initialsOf("Alex")

    const goldBorderedViews = root.root.findAllByType(View).filter((v) => flatStyle(v.props.style).borderColor === colors.gold500);
    expect(goldBorderedViews.length).toBeGreaterThan(0);
  });

  // #238: this is the pings inbox's entry point, not just some other link -- PR #210's review put
  // the ONLY reachability fix behind add-friends.tsx's "Add Friends" screen (a screen about a
  // different task), and #220's later pane-shell rebuild came within one PR of silently dropping it
  // a second time. Anchored in the "Ping a Friend" section (below the avatar card -- see that
  // JSX's own comment on why not the SectionHeader's `right` slot), in the pane a rebuild of the
  // Social tab is least likely to delete outright, and asserting the real router.push target (not
  // just that some label renders) is what actually pins this against a future rebase. Deliberately
  // wired via router.push (SocialPane.tsx's goToPingsInbox), not <Link href="/friends" asChild> --
  // the shared mockLink stub (#251) doesn't simulate asChild's onPress delegation, so there would
  // be nothing left to assert *on*.
  it("#238: PING A FRIEND section links to /friends, so a received ping stays reachable", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation(() => queryResult([]));

    const root = await renderSocialPane();
    const pingsLink = root.root.findByProps({ accessibilityLabel: "Pings you've received" });
    // Fails here, with a real assertion message, if a future refactor swaps this to a Link asChild
    // (which this test suite's Link mock can't preserve an onPress/href through) rather than as a
    // confusing "onPress is not a function" TypeError from the raw call below.
    expect(typeof pingsLink.props.onPress).toBe("function");

    act(() => {
      pingsLink.props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith("/friends");
  });

  it("#238: signed out, the PING A FRIEND section has no pings-inbox link (there's nothing to receive without an account)", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });

    const root = await renderSocialPane();
    expect(root.root.findAllByProps({ accessibilityLabel: "Pings you've received" }).length).toBe(0);
  });

  it("events v2.1 (#120): a banner event drops the title/star row entirely (footer is subtitle + icon only, no duplicate of the banner's own title art); a banner-less event keeps title+subtitle; DETAILS is gone from both", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([harvestDinner, fallFest]);

    const root = await renderSocialPane();
    const allTexts = root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));

    // harvestDinner has a featuredImage -- per the #120 canvas its title is never rendered as text
    // (the banner image already carries the title art), and neither is its ★ isFeatured marker.
    expect(allTexts.some((t) => /Local Harvest Dinner/.test(t))).toBe(false);
    // fallFest has no featuredImage -- the banner-less notice row keeps its title.
    expect(allTexts.some((t) => /Fall Fest/.test(t))).toBe(true);
    expect(allTexts.some((t) => /DETAILS/.test(t))).toBe(false);
    // The banner event's subtitle ("Through Aug 27") still renders exactly once, in the footer.
    expect(allTexts.filter((t) => /Through Aug 27/.test(t)).length).toBe(1);

    // The banner event actually renders its image (clean, no overlay).
    const images = root.root.findAllByType(Image);
    expect(images.some((img) => img.props.source?.uri === harvestDinner.featuredImage)).toBe(true);
  });

  it("events v2.1 (#120): tapping a card whose payload resolves to an http(s) link opens the pop-up in-app browser (expo-web-browser), not a bare Linking.openURL", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([fallFest]); // externalLink: "https://example.com", no featuredImage -- the only Pressable is the event card.

    const root = await renderSocialPane();
    const eventPressable = lastButton(root);
    act(() => {
      eventPressable.props.onPress();
    });
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith("https://example.com");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("events v2.1 (#120): tapping a card whose payload is in-feed content (no external link, a usable pdf_link poster) pushes the in-app pamphlet screen with the full, exact param set", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([pamphletEvent]);

    const root = await renderSocialPane();
    const eventPressable = lastButton(root);
    act(() => {
      eventPressable.props.onPress();
    });
    // Exact object, not objectContaining -- PR #129 review finding 2: a renamed/dropped param key
    // (e.g. featuredImage) must fail this, since that's exactly how the pamphlet's banner silently
    // went blank under mutation.
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        title: "Sustainability Big Impact",
        featuredImage: "https://example.com/banner.jpg",
        pamphletImage: "https://example.com/poster.jpg",
        expirationDate: "2026-09-01T16:00:00.000Z",
        isFeatured: "",
      },
    });
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it("events v2.1 (#120): trailing icon is derived from the tap destination -- an external link (fallFest) gets the external-link glyph, never the chevron", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([fallFest]); // link-classified: externalLink set, no pdfLink

    const root = await renderSocialPane();
    const allTexts = root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));
    // Rendering only a link-classified event: seeing "›" here (and not "↗") would mean the glyphs
    // got swapped/inverted, since there is no in-app-content card in this render to legitimately
    // produce a "›". This is what a glyph-swap mutation flips -- see openEventTap.test.ts's own
    // exact-match test for the tap-destination side of the same spec.
    expect(allTexts).toContain("↗");
    expect(allTexts).not.toContain("›");
  });

  it("events v2.1 (#120): trailing icon is derived from the tap destination -- in-app content (pamphletEvent) gets the chevron, never the external-link glyph", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([pamphletEvent]); // content-classified: no externalLink, a usable pdfLink

    const root = await renderSocialPane();
    const allTexts = root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));
    expect(allTexts).toContain("›");
    expect(allTexts).not.toContain("↗");
  });

  it("events v2.1 (#120): a banner event card's accessible name is its title, not just the date-line footer text left after the title row was dropped", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([harvestDinner]); // banner event -- title row is not rendered as visible Text

    const root = await renderSocialPane();
    const labeled = root.root.findAllByProps({ accessibilityLabel: "Local Harvest Dinner" });
    expect(labeled.length).toBeGreaterThan(0);
  });

  it("events v2.1 (#120): a card with neither a link nor usable content (malformed/missing payload) still renders, but tapping it safely no-ops", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    const brokenEvent: DiningEvent = {
      title: "Mystery Event",
      featuredImage: "",
      pdfLink: "",
      externalLink: "",
      expirationDate: "2026-09-01T16:00:00.000Z",
      isFeatured: false,
    };
    mockFetchEvents.mockResolvedValue([brokenEvent]);

    const root = await renderSocialPane();
    expect(texts(root)).toMatch(/Mystery Event/);
    const eventPressable = lastButton(root);
    act(() => {
      eventPressable.props.onPress();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  // #181: offline is NOT an error state (owner decision) -- a fetchEvents failure now surfaces as
  // the offline line, not the old "Couldn't load events" error text. Same underlying fetch, new
  // treatment; this test is the conscious update of the pre-#181 "events load error" test (renamed,
  // not silently dropped -- see the describe block below for its full replacement coverage).
  it("events load error is treated as offline, not shown as an error line", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderSocialPane();
    expect(texts(root)).not.toMatch(/Couldn.t load events/);
    expect(texts(root)).toMatch(/offline · pings will send when you're back/);
  });

  it("hold-and-release gesture: holding past LONG_PRESS_MS opens the bubble with a shuffled message and all 4 halls; releasing without ever hovering one cancels (no ping sent)", async () => {
    jest.useFakeTimers();
    try {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
      mockFrom.mockImplementation((table: string) => {
        if (table === "friendships") return queryResult([{ user_a: "me", user_b: "friend-1" }]);
        if (table === "profiles") return queryResult([{ user_id: "friend-1", display_name: "Alex" }]);
        return queryResult([]);
      });

      const root = await renderSocialPane();

      // The avatar row's each friend View spreads a PanResponder's panHandlers -- find it by the
      // handler prop RN's real PanResponder attaches (onResponderGrant), not by style/testID.
      const avatarViews = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
      expect(avatarViews.length).toBeGreaterThan(0);
      const { onResponderGrant, onResponderRelease } = avatarViews[0].props;

      act(() => {
        onResponderGrant(fakeTouchEvent(10, 10, 1));
      });
      // Before LONG_PRESS_MS elapses, it's still just a touch-down -- no bubble yet.
      expect(texts(root)).not.toMatch(new RegExp(PING_MESSAGES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")));

      act(() => {
        jest.advanceTimersByTime(400);
      });
      const body = texts(root);
      expect(PING_MESSAGES.some((m) => body.includes(m))).toBe(true);
      for (const hall of DINING_HALLS) {
        expect(body).toMatch(hall.name);
      }

      // Release without ever calling onResponderMove -- gesture never hovered a hall, so this is
      // the "drag away"/no-hover cancel path the issue calls out explicitly. Must not send a ping.
      act(() => {
        onResponderRelease(fakeTouchEvent(10, 10, 2));
      });
      expect(mockFrom).not.toHaveBeenCalledWith("pings");
      // Bubble closes back to idle.
      expect(texts(root)).not.toMatch(new RegExp(PING_MESSAGES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")));
    } finally {
      jest.useRealTimers();
    }
  });

  it("#94: a quick tap (release before LONG_PRESS_MS, no movement) navigates to that friend's profile instead of sending a ping", async () => {
    jest.useFakeTimers();
    try {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
      mockFrom.mockImplementation((table: string) => {
        if (table === "friendships") return queryResult([{ user_a: "me", user_b: "friend-1" }]);
        if (table === "profiles") return queryResult([{ user_id: "friend-1", display_name: "Alex" }]);
        return queryResult([]);
      });

      const root = await renderSocialPane();
      const avatarViews = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
      const { onResponderGrant, onResponderRelease } = avatarViews[0].props;

      act(() => {
        onResponderGrant(fakeTouchEvent(10, 10, 1));
      });
      // Release immediately -- well under LONG_PRESS_MS, so HOLD_START never fired and the gesture
      // never entered "holding". Same page coordinates as the grant, so dx/dy is 0 (a tap, not a
      // drag that happened to release quickly).
      act(() => {
        onResponderRelease(fakeTouchEvent(10, 10, 2));
      });

      expect(mockRouterPush).toHaveBeenCalledWith("/friend/friend-1");
      expect(mockFrom).not.toHaveBeenCalledWith("pings");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("SocialPane offline (#181 — owner decision: offline is not an error state)", () => {
  it("dims the ping card (opacity 0.55) while offline, and back to normal once fetchEvents succeeds again", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation(() => queryResult([]));
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderSocialPane();
    const dimmedViews = root.root.findAllByType(View).filter((v) => flatStyle(v.props.style).opacity === 0.55);
    expect(dimmedViews.length).toBeGreaterThan(0);

    mockFetchEvents.mockResolvedValue([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Retry" }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(root.root.findAllByType(View).filter((v) => flatStyle(v.props.style).opacity === 0.55).length).toBe(0);
  });

  it("RETRY re-fetches events and, once back online, flushes anything queued while offline", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation(() => queryResult([]));
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderSocialPane();
    expect(mockFlushQueuedPings).not.toHaveBeenCalled();

    mockFetchEvents.mockResolvedValue([]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Retry" }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFetchEvents).toHaveBeenCalledTimes(2); // initial load + retry
    expect(mockFlushQueuedPings).toHaveBeenCalledTimes(1);
  });

  it("does NOT flush the queue on a normal (never-offline) load", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([]);
    await renderSocialPane();
    expect(mockFlushQueuedPings).not.toHaveBeenCalled();
  });

  it("shows the evergreen footer reassurance copy regardless of online/offline state", async () => {
    mockFetchEvents.mockResolvedValue([]);
    const online = await renderSocialPane();
    expect(texts(online)).toMatch(/Your log, plate, and rankings all keep working offline — they live on this phone\./);
  });

  // #181 review finding 1 (blocking): the fix -- sendPing now always attempts a real send and
  // classifies the ACTUAL result via pingQueue.ts's sendOrQueuePing, instead of gating on a
  // one-shot mount-time `offline` flag. sendOrQueuePing is a plain function (no RN, no closed-over
  // component state -- same split pingGesture.ts's own doc comment argues for), so it's tested
  // directly and thoroughly in pingQueue.test.ts rather than here.
  //
  // Driving this specific case through SocialPane's own hold-hover-release gesture was attempted
  // and abandoned: react-test-renderer's `createNodeMock` (the standard way to stub a ref's native
  // instance, needed for the hall row's `measureInWindow` call) is never invoked at all under this
  // project's jest-expo preset (confirmed by instrumenting the mock factory directly -- zero calls
  // across a full render + hold + hall-row onLayout pass), so `hallRectsRef` can never be populated
  // and no hover ever resolves to a real hallTid. This is the same gap already disclosed in this
  // PR's body for the ORIGINAL send-while-offline tests; it now also covers this fix specifically.
  it("still passes the hold-without-hovering cancel path with the current sendPing wiring (regression check for the finding-1 refactor)", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: session("me") } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "friendships") return queryResult([{ user_a: "me", user_b: "friend-1" }]);
      if (table === "profiles") return queryResult([{ user_id: "friend-1", display_name: "Alex" }]);
      return queryResult([]);
    });
    mockFetchEvents.mockResolvedValue([]);

    jest.useFakeTimers();
    try {
      const root = await renderSocialPane();
      const avatarViews = root.root.findAllByType(View).filter((n) => typeof n.props.onResponderGrant === "function");
      const { onResponderGrant, onResponderRelease } = avatarViews[0].props;
      act(() => onResponderGrant(fakeTouchEvent(10, 10, 1)));
      act(() => jest.advanceTimersByTime(400));
      act(() => onResponderRelease(fakeTouchEvent(10, 10, 2))); // never hovered -- cancel, no send
      expect(mockFrom).not.toHaveBeenCalledWith("pings");
      // The assertion that actually distinguishes cancel-vs-send: sendPing is a thin wrapper around
      // sendOrQueuePing (see this test's own header comment above), so this is the one call this
      // test can observe directly that would fire if the cancel guard ever regressed.
      expect(mockSendOrQueuePing).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
