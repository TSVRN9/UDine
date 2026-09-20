// Lives here, not next to src/app/event-detail.tsx: expo-router scans every file under src/app/
// as a candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into
// the real app and crashes at runtime on the bare `jest` global). Imports the screen by relative
// path instead, same pattern as redirect.test.tsx/hallMenu.test.tsx.
import renderer, { act } from "react-test-renderer";
import { Alert, Image, Share, Text } from "react-native";
import * as expoRouter from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import EventDetailScreen from "../app/event-detail";
import { artboardEnclosingStyle, artboardNthStyle, artboardStyle, normalizeColor } from "./artboard";
import { buttonColors, colors } from "./theme";
import { Card } from "../components/ui";

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  router: { back: jest.fn() },
}));

// event-detail.tsx reads safe-area insets for its header; no SafeAreaProvider in this render tree
// (same fix as NutritionLabel.test.tsx/PlateBar.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", downloadAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const mockedDownload = FileSystem.downloadAsync as jest.Mock;
const mockedIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockedShareAsync = Sharing.shareAsync as jest.Mock;
const mockedUseLocalSearchParams = expoRouter.useLocalSearchParams as jest.Mock;
const mockedRouterBack = expoRouter.router.back as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) ?? {};
}

describe("EventDetailScreen (#120 in-app pamphlet)", () => {
  beforeEach(() => {
    mockedRouterBack.mockClear();
  });

  it("renders the banner, title, date line, and the pamphlet image (pdf_link poster) as the body", () => {
    mockedUseLocalSearchParams.mockReturnValue({
      title: "Sustainability Big Impact",
      featuredImage: "https://example.com/banner.jpg",
      pamphletImage: "https://example.com/poster.jpg",
      expirationDate: "2026-09-01T16:00:00.000Z",
      isFeatured: "",
    });

    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    expect(texts(root)).toMatch(/Sustainability Big Impact/);
    expect(texts(root)).toMatch(/Through Sep 1/);

    const images = root.root.findAllByType(Image);
    expect(images.some((img) => img.props.source?.uri === "https://example.com/banner.jpg")).toBe(true);
    expect(images.some((img) => img.props.source?.uri === "https://example.com/poster.jpg")).toBe(true);
  });

  it("marks a featured event with the same ★ prefix the card uses, and skips the banner image when there isn't one", () => {
    mockedUseLocalSearchParams.mockReturnValue({
      title: "Founders Day",
      featuredImage: "",
      pamphletImage: "https://example.com/poster.jpg",
      expirationDate: "",
      isFeatured: "1",
    });

    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    expect(texts(root)).toMatch(/★\s+Founders Day/);
    const images = root.root.findAllByType(Image);
    expect(images.length).toBe(1); // pamphlet only, no banner
  });
});

describe("EventDetailScreen header (EventDetailOptionA.dc.html)", () => {
  beforeEach(() => {
    mockedRouterBack.mockClear();
    mockedUseLocalSearchParams.mockReturnValue({
      title: "Sustainability Big Impact",
      featuredImage: "https://example.com/banner.jpg",
      pamphletImage: "https://example.com/poster.jpg",
      expirationDate: "2026-09-01T16:00:00.000Z",
      isFeatured: "",
    });
  });

  it("renders a custom in-content header, not the native stack header -- back chevron calls router.back()", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    const back = root.root.findByProps({ accessibilityLabel: "Back" });
    expect(back.props.accessibilityRole).toBe("button");
    act(() => {
      back.props.onPress();
    });
    expect(mockedRouterBack).toHaveBeenCalled();

    expect(texts(root)).toMatch(/‹/);
    expect(texts(root)).toMatch(/Event/);
  });

  it("titles the header row per the artboard (font, size, letter-spacing, uppercase, maroon900)", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    const title = flatStyle(root.root.findByProps({ children: "Event" }).props.style);
    const spec = artboardStyle("EventDetailOptionA.dc.html", "Event");
    expect(title.fontSize).toBe(spec.fontSize);
    expect(title.letterSpacing).toBe(spec.letterSpacing);
    expect(title.textTransform).toBe(spec.textTransform);
    expect(normalizeColor(title.color as string)).toBe(spec.color);
  });

  it("renders the share control as a bordered pill (icon + SHARE label) using buttonColors('secondary')", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    const pill = root.root.findByProps({ accessibilityLabel: "Share" });
    expect(pill.props.accessibilityRole).toBe("button");

    const pillStyle = flatStyle(pill.props.style);
    const secondary = buttonColors("secondary");
    expect(pillStyle.borderColor).toBe(secondary.borderColor);
    expect(pillStyle.backgroundColor).toBe(secondary.backgroundColor);

    const containerSpec = artboardEnclosingStyle("EventDetailOptionA.dc.html", "SHARE", 1);
    expect(pillStyle.borderRadius).toBe(containerSpec.borderRadius);
    expect(normalizeColor(pillStyle.borderColor as string)).toBe(containerSpec.borderColor);

    const label = flatStyle(root.root.findByProps({ children: "SHARE" }).props.style);
    const labelSpec = artboardStyle("EventDetailOptionA.dc.html", "SHARE");
    expect(label.fontSize).toBe(labelSpec.fontSize);
    expect(label.letterSpacing).toBe(labelSpec.letterSpacing);
    expect(normalizeColor(label.color as string)).toBe(labelSpec.color);
    expect(label.color).toBe(colors.maroon600);
  });

  it("banner image renders full-bleed: no borderRadius, no margin, directly below the header", () => {
    mockedUseLocalSearchParams.mockReturnValue({
      title: "Sustainability Big Impact",
      featuredImage: "https://example.com/banner.jpg",
      pamphletImage: "https://example.com/poster.jpg",
      expirationDate: "",
      isFeatured: "",
    });
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    const banner = root.root.findAllByType(Image).find((img) => img.props.source?.uri === "https://example.com/banner.jpg")!;
    const bannerStyle = flatStyle(banner.props.style);
    const spec = artboardNthStyle("EventDetailOptionA.dc.html", "div", 6); // the banner's own div, textless
    expect(bannerStyle.height).toBe(spec.height);
    expect(bannerStyle.width).toBe("100%");
    expect(bannerStyle.borderRadius).toBeUndefined();
    expect(bannerStyle.marginBottom).toBeUndefined();
    expect(bannerStyle.marginHorizontal).toBeUndefined();
    expect(bannerStyle.marginLeft).toBeUndefined();
    expect(bannerStyle.marginRight).toBeUndefined();
  });

  it("title/subtitle/pamphlet content flows without a bordered Card wrapper", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    expect(root.root.findAllByType(Card).length).toBe(0);
  });
});

describe("EventDetailScreen share pill", () => {
  beforeEach(() => {
    mockedRouterBack.mockClear();
    mockedDownload.mockReset().mockImplementation(async (_url: string, dest: string) => ({ uri: dest, status: 200 }));
    mockedIsAvailable.mockReset().mockResolvedValue(true);
    mockedShareAsync.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockedUseLocalSearchParams.mockReturnValue({
      title: "Sustainability Big Impact",
      featuredImage: "https://example.com/banner.jpg",
      pamphletImage: "https://example.com/poster.jpg",
      expirationDate: "2026-09-01T16:00:00.000Z",
      isFeatured: "",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function tapShare() {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<EventDetailScreen />);
    });
    const pill = root.root.findByProps({ accessibilityLabel: "Share" });
    await act(async () => {
      pill.props.onPress();
    });
  }

  it("downloads the poster to the cache dir and shares only that file, as an image", async () => {
    await tapShare();
    expect(mockedDownload).toHaveBeenCalledWith("https://example.com/poster.jpg", expect.stringMatching(/^file:\/\/\/cache\/.+\.jpg$/));
    const dest = mockedDownload.mock.calls[0][1];
    expect(mockedShareAsync).toHaveBeenCalledWith(dest, { mimeType: "image/jpeg", UTI: "public.jpeg" });
    expect(Share.share).not.toHaveBeenCalled();
  });

  it("derives the image type from the URL extension, ignoring a query string", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ title: "T", pamphletImage: "https://example.com/poster.PNG?v=2", expirationDate: "" });
    await tapShare();
    expect(mockedShareAsync).toHaveBeenCalledWith(expect.stringMatching(/\.png$/), { mimeType: "image/png", UTI: "public.png" });
  });

  it("does not share the error page when the download resolves non-2xx", async () => {
    mockedDownload.mockResolvedValue({ uri: "file:///cache/x.jpg", status: 404 });
    await tapShare();
    expect(mockedDownload).toHaveBeenCalled();
    expect(mockedShareAsync).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("skips sharing when sharing is unavailable", async () => {
    mockedIsAvailable.mockResolvedValue(false);
    await tapShare();
    expect(mockedDownload).toHaveBeenCalled();
    expect(mockedShareAsync).not.toHaveBeenCalled();
  });

  it("swallows a thrown download or share error silently instead of alerting", async () => {
    mockedDownload.mockRejectedValueOnce(new Error("offline"));
    await tapShare();
    expect(mockedShareAsync).not.toHaveBeenCalled();
    mockedShareAsync.mockRejectedValueOnce(new Error("share failed"));
    await tapShare();
    expect(mockedShareAsync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
