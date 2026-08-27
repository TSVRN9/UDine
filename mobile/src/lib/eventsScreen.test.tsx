// Lives here, not next to src/app/events.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into the
// real app and crashes at runtime on the bare `jest` global). Imports the screen by relative path
// instead, same pattern as redirect.test.tsx/hallMenu.test.tsx/eventDetailScreen.test.tsx.
//
// PR #129 review, non-blocking finding: this screen used to hand-roll `Linking.openURL(externalLink
// || pdfLink)` -- no scheme guard, no .pdf handling, and it kicked out to the system browser
// instead of the Social pane's in-app pamphlet/pop-up browser. Now it routes through the same
// openEventTap dispatcher SocialPane's EventCard uses, so the two behave identically for the same
// event. openEventTap itself is covered thoroughly in openEventTap.test.ts; this file just proves
// the screen actually wires taps through it.
import renderer, { act } from "react-test-renderer";
import type { DiningEvent } from "@udine/shared";
import EventsScreen from "../app/events";

const mockOpenEventTap = jest.fn();
jest.mock("./openEventTap", () => ({ openEventTap: (...args: unknown[]) => mockOpenEventTap(...args) }));

jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  fetchEvents: () => mockFetchEvents(),
}));
const mockFetchEvents = jest.fn();

const fallFest: DiningEvent = { title: "Fall Fest", featuredImage: "", pdfLink: "", externalLink: "https://example.com", expirationDate: "2026-09-01T16:00:00.000Z", isFeatured: false };

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderEventsScreen() {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<EventsScreen />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return root;
}

describe("EventsScreen (/events)", () => {
  it("tapping a row calls openEventTap with that event -- the same dispatcher the Social pane's EventCard uses, not a hand-rolled Linking.openURL", async () => {
    mockFetchEvents.mockResolvedValue([fallFest]);
    const root = await renderEventsScreen();

    const button = root.root.findAllByProps({ accessibilityRole: "button" }).find((b) => typeof b.props.onPress === "function");
    expect(button).toBeTruthy();
    act(() => {
      button!.props.onPress();
    });

    expect(mockOpenEventTap).toHaveBeenCalledWith(fallFest);
  });
});
