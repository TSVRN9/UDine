// PR #129 review findings 2 and 4: the card->pamphlet param seam was under-asserted
// (objectContaining with 2 of 5 keys let a renamed key silently blank the pamphlet's banner) and
// WebBrowser.openBrowserAsync's rejection was unhandled (a double-tap's "already being presented"
// error vanished silently). Both live in openEventTap now -- test them here, once, for every caller.
import { Alert } from "react-native";
import type { DiningEvent } from "@udine/shared";
import { openEventTap } from "./openEventTap";

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

const mockOpenBrowserAsync = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const linkEvent: DiningEvent = {
  title: "Fall Fest",
  featuredImage: "",
  pdfLink: "",
  externalLink: "https://example.com/fall-fest",
  expirationDate: "2026-09-01T16:00:00.000Z",
  isFeatured: false,
};

const contentEvent: DiningEvent = {
  title: "Sustainability Big Impact",
  featuredImage: "https://example.com/banner.jpg",
  pdfLink: "https://example.com/poster.jpg",
  externalLink: "",
  expirationDate: "2026-08-27T16:00:00.000Z",
  isFeatured: true,
};

const brokenEvent: DiningEvent = { title: "Mystery Event", featuredImage: "", pdfLink: "", externalLink: "", expirationDate: "", isFeatured: false };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

describe("openEventTap", () => {
  it("a link-classified event opens the pop-up in-app browser with its URL", async () => {
    await openEventTap(linkEvent);
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith("https://example.com/fall-fest");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("a content-classified event pushes /event-detail with the full, exact params object -- not just some of it", async () => {
    await openEventTap(contentEvent);
    // Exact-match, not objectContaining: a renamed/dropped key here must fail this assertion, since
    // that's precisely the "banner silently blanks" bug finding 2 describes.
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/event-detail",
      params: {
        title: "Sustainability Big Impact",
        featuredImage: "https://example.com/banner.jpg",
        pamphletImage: "https://example.com/poster.jpg",
        expirationDate: "2026-08-27T16:00:00.000Z",
        isFeatured: "1",
      },
    });
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it("a malformed/missing-payload event opens nothing and pushes nothing", async () => {
    await openEventTap(brokenEvent);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("a rejected openBrowserAsync (e.g. a double-tap's 'already being presented') surfaces via Alert, not a silent unhandled rejection", async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error("Another WebBrowser is already being presented"));
    await openEventTap(linkEvent);
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't open link", "Another WebBrowser is already being presented");
  });
});
