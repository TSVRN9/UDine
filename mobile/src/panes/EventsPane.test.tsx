import type { DiningEvent, NewsletterIssue, PressRelease } from "@udine/shared";

import renderer, { act } from "react-test-renderer";
import { Image, StyleSheet, Text } from "react-native";
import { EventsPane } from "./EventsPane";

// Real @udine/shared's fetchEvents/fetchPressReleases/fetchNewsletter all do a live network fetch
// -- keep everything else real, stub just the network calls. Same pattern as
// menuFetchWithSeenTracking.test.ts's @udine/shared partial mock.
const mockFetchEvents = jest.fn<Promise<DiningEvent[]>, []>();
const mockFetchPressReleases = jest.fn<Promise<PressRelease[]>, []>();
const mockFetchNewsletter = jest.fn<Promise<NewsletterIssue[]>, []>();
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchEvents: () => mockFetchEvents(),
  fetchPressReleases: () => mockFetchPressReleases(),
  fetchNewsletter: () => mockFetchNewsletter(),
}));

// EventsPane reads safe-area insets; there's no SafeAreaProvider in this render tree (same fix as
// YouPane.test.tsx/hallMenu.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

// router: the target of #120's card-tap classification (pushes /event-detail).
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

// #120: banner-less event notice rows and event/link classification-driven taps open either the
// in-app pamphlet screen (router.push, mocked above) or expo-web-browser's pop-up in-app browser --
// mocked here so a test can assert which one fired without a real browser/navigator.
const mockOpenBrowserAsync = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

// #90 nav reorg added a SEE ALL button (with its own trailing chevron) below the events list for
// each of the new Press/Newsletter sections, so "the event card is the only button in this pane"
// is no longer true -- every event card still carries an explicit accessibilityLabel={item.title}
// (PR #129 review finding 3, see EventCard's own comment), so selecting by that label is what
// keeps these lookups scoped to one specific card regardless of what else the pane renders.
function eventButton(root: renderer.ReactTestRenderer, title: string) {
  return root.root.findByProps({ accessibilityRole: "button", accessibilityLabel: title });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchEvents.mockResolvedValue([]);
  mockFetchPressReleases.mockResolvedValue([]);
  mockFetchNewsletter.mockResolvedValue([]);
});

async function renderEventsPane() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<EventsPane />);
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

describe("EventsPane", () => {
  it("renders events", async () => {
    mockFetchEvents.mockResolvedValue([fallFest]);
    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/Fall Fest/);
  });

  it("no events: shows the empty state, not a blank pane", async () => {
    mockFetchEvents.mockResolvedValue([]);
    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/No events/);
  });

  it("events v2.1 (#120): a banner event drops the title/star row entirely (footer is subtitle + icon only, no duplicate of the banner's own title art); a banner-less event keeps title+subtitle; DETAILS is gone from both", async () => {
    mockFetchEvents.mockResolvedValue([harvestDinner, fallFest]);

    const root = await renderEventsPane();
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

  // Real fetchEvents banners are full poster graphics (~1024x432, 2.37:1) -- a fixed banner height
  // forces resizeMode="cover" to crop most of the poster off. aspectRatio lets cover fill the width
  // without cropping a well-formed poster.
  it("banner image uses aspectRatio, not a fixed crop-prone height", async () => {
    mockFetchEvents.mockResolvedValue([harvestDinner]);
    const root = await renderEventsPane();
    const image = root.root.findAllByType(Image).find((img) => img.props.source?.uri === harvestDinner.featuredImage);
    const style = StyleSheet.flatten(image!.props.style);
    expect(style.aspectRatio).toBeCloseTo(1024 / 432);
    expect(style.height).toBeUndefined();
  });

  it("events v2.1 (#120): tapping a card whose payload resolves to an http(s) link opens the pop-up in-app browser (expo-web-browser), not a bare Linking.openURL", async () => {
    mockFetchEvents.mockResolvedValue([fallFest]); // externalLink: "https://example.com", no featuredImage -- the only Pressable is the event card.

    const root = await renderEventsPane();
    const eventPressable = eventButton(root, fallFest.title);
    act(() => {
      eventPressable.props.onPress();
    });
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith("https://example.com");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("events v2.1 (#120): tapping a card whose payload is in-feed content (no external link, a usable pdf_link poster) pushes the in-app pamphlet screen with the full, exact param set", async () => {
    mockFetchEvents.mockResolvedValue([pamphletEvent]);

    const root = await renderEventsPane();
    const eventPressable = eventButton(root, pamphletEvent.title);
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
    mockFetchEvents.mockResolvedValue([fallFest]); // link-classified: externalLink set, no pdfLink

    const root = await renderEventsPane();
    // Scoped to the event card's own subtree, not the whole pane -- #90 nav reorg's Press/
    // Newsletter SEE ALL rows carry their own "›" chevrons below the events list, so a whole-tree
    // scan for "›" no longer proves anything about THIS card's own trailing glyph.
    const card = eventButton(root, fallFest.title);
    const cardTexts = card.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));
    // Rendering only a link-classified event: seeing "›" here (and not "↗") would mean the glyphs
    // got swapped/inverted, since there is no in-app-content card in this render to legitimately
    // produce a "›". This is what a glyph-swap mutation flips -- see openEventTap.test.ts's own
    // exact-match test for the tap-destination side of the same spec.
    expect(cardTexts).toContain("↗");
    expect(cardTexts).not.toContain("›");
  });

  it("events v2.1 (#120): trailing icon is derived from the tap destination -- in-app content (pamphletEvent) gets the chevron, never the external-link glyph", async () => {
    mockFetchEvents.mockResolvedValue([pamphletEvent]); // content-classified: no externalLink, a usable pdfLink

    const root = await renderEventsPane();
    const card = eventButton(root, pamphletEvent.title);
    const cardTexts = card.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : n.props.children));
    expect(cardTexts).toContain("›");
    expect(cardTexts).not.toContain("↗");
  });

  it("events v2.1 (#120): a banner event card's accessible name is its title, not just the date-line footer text left after the title row was dropped", async () => {
    mockFetchEvents.mockResolvedValue([harvestDinner]); // banner event -- title row is not rendered as visible Text

    const root = await renderEventsPane();
    const labeled = root.root.findAllByProps({ accessibilityLabel: "Local Harvest Dinner" });
    expect(labeled.length).toBeGreaterThan(0);
  });

  it("events v2.1 (#120): a card with neither a link nor usable content (malformed/missing payload) still renders, but tapping it safely no-ops", async () => {
    const brokenEvent: DiningEvent = {
      title: "Mystery Event",
      featuredImage: "",
      pdfLink: "",
      externalLink: "",
      expirationDate: "2026-09-01T16:00:00.000Z",
      isFeatured: false,
    };
    mockFetchEvents.mockResolvedValue([brokenEvent]);

    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/Mystery Event/);
    const eventPressable = eventButton(root, brokenEvent.title);
    act(() => {
      eventPressable.props.onPress();
    });
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  // #181: offline is NOT an error state (owner decision) -- a fetchEvents failure surfaces as the
  // offline line, not an error text.
  it("events load error is treated as offline, not shown as an error line", async () => {
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderEventsPane();
    expect(texts(root)).not.toMatch(/Couldn.t load events/);
    expect(texts(root)).toMatch(/offline · showing what's cached/);
  });

  it("RETRY re-fetches events", async () => {
    mockFetchEvents.mockRejectedValue(new Error("network down"));

    const root = await renderEventsPane();

    mockFetchEvents.mockResolvedValue([fallFest]);
    await act(async () => {
      root.root.findByProps({ accessibilityLabel: "Retry" }).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockFetchEvents).toHaveBeenCalledTimes(2); // initial load + retry
    expect(texts(root)).toMatch(/Fall Fest/);
  });

  it("shows the evergreen footer reassurance copy regardless of online/offline state", async () => {
    mockFetchEvents.mockResolvedValue([]);
    const online = await renderEventsPane();
    expect(texts(online)).toMatch(/Your log and plate keep working offline — they live on this phone\./);
  });

  // #90 nav reorg: Press and Newsletter sections give /press and /newsletter a real in-app entry
  // point now that QUICK_LINKS (index.tsx) is gone. The footer reassurance line must still be the
  // last thing on the pane.
  it("keeps the footer reassurance line after the new Press/Newsletter sections, not swallowed between them", async () => {
    const root = await renderEventsPane();
    const body = texts(root);
    const pressIdx = body.indexOf("Press");
    const newsletterIdx = body.indexOf("Newsletter");
    const footerIdx = body.indexOf("Your log and plate keep working offline");
    expect(pressIdx).toBeGreaterThan(-1);
    expect(newsletterIdx).toBeGreaterThan(pressIdx);
    expect(footerIdx).toBeGreaterThan(newsletterIdx);
  });
});

const pressRelease: PressRelease = { title: "UDine covered by the Collegian", url: "https://example.com/article", image: "", date: "2026-08-01" };
const newsletterIssue: NewsletterIssue = { period: "August 2026", link: "https://example.com/newsletter/aug", content: "" };

describe("EventsPane Press section", () => {
  it("shows the empty state when there are no press releases", async () => {
    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/No press releases/);
  });

  it("renders real press releases (title + date, same fields press.tsx already renders)", async () => {
    mockFetchPressReleases.mockResolvedValue([pressRelease]);
    const root = await renderEventsPane();
    const body = texts(root);
    expect(body).toMatch(/UDine covered by the Collegian/);
    expect(body).toMatch(/2026-08-01/);
  });

  it("renders a SEE ALL link, and tapping it navigates to /press", async () => {
    mockFetchPressReleases.mockResolvedValue([pressRelease]);
    const root = await renderEventsPane();
    const button = root.root.findByProps({ accessibilityRole: "button", accessibilityLabel: "See all press releases" });
    act(() => {
      button.props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/press");
  });
});

describe("EventsPane Newsletter section", () => {
  it("shows the empty state when there are no newsletter issues", async () => {
    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/No newsletter issues/);
  });

  it("renders real newsletter issues (period, same field newsletter.tsx already renders)", async () => {
    mockFetchNewsletter.mockResolvedValue([newsletterIssue]);
    const root = await renderEventsPane();
    expect(texts(root)).toMatch(/August 2026/);
  });

  it("renders a SEE ALL link, and tapping it navigates to /newsletter", async () => {
    mockFetchNewsletter.mockResolvedValue([newsletterIssue]);
    const root = await renderEventsPane();
    const button = root.root.findByProps({ accessibilityRole: "button", accessibilityLabel: "See all newsletter issues" });
    act(() => {
      button.props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith("/newsletter");
  });
});
