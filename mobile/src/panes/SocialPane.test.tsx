import type { ReactNode } from "react";
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
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useFocusEffect: (callback: () => void) => {
    if (mockSeenFocusCallbacks.has(callback)) return;
    mockSeenFocusCallbacks.add(callback);
    callback();
  },
}));

import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
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
    root = renderer.create(<SocialPane activeIndex={0} />);
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

  it("events: renders both a banner (featuredImage) event and a plain-row event, each opening its link", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockResolvedValue([harvestDinner, fallFest]);

    const root = await renderSocialPane();
    const allTexts = root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));
    expect(allTexts.some((t) => /Local Harvest Dinner/.test(t))).toBe(true);
    expect(allTexts.some((t) => /Fall Fest/.test(t))).toBe(true);
    expect(allTexts.filter((t) => /DETAILS/.test(t)).length).toBe(2);
    // The banner event's subtitle ("Through Aug 27") must render exactly once, not once inside the
    // banner-overlay title slot and again in the row below it.
    expect(allTexts.filter((t) => /Through Aug 27/.test(t)).length).toBe(1);
  });

  it("events load error: shows an error line instead of hanging on a loading state forever", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderSocialPane();
    expect(texts(root)).toMatch(/Couldn.t load events/);
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
});
