// Lives here, not next to src/app/event-detail.tsx: expo-router scans every file under src/app/
// as a candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into
// the real app and crashes at runtime on the bare `jest` global). Imports the screen by relative
// path instead, same pattern as redirect.test.tsx/hallMenu.test.tsx.
import renderer, { act } from "react-test-renderer";
import { Alert, Image, Share, Text } from "react-native";
import * as expoRouter from "expo-router";
import EventDetailScreen from "../app/event-detail";

const mockedSetOptions = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  useNavigation: () => ({ setOptions: mockedSetOptions }),
}));

const mockedUseLocalSearchParams = expoRouter.useLocalSearchParams as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

/** The share button lives in navigation.setOptions({ headerRight }), not the screen's own
 * rendered tree -- pull the latest headerRight the screen handed setOptions and render it
 * standalone to find/tap its Pressable, same technique any React Navigation headerRight needs
 * under jest since native-stack renders the header outside the screen's own component subtree.
 * Found by accessibilityRole rather than findByType(Pressable): react-test-renderer's tree
 * collapses Pressable down to its host View instance, so the Pressable composite type itself
 * isn't a separately-findable node. */
function renderHeaderRight() {
  const options = mockedSetOptions.mock.calls.at(-1)?.[0];
  let headerRoot!: renderer.ReactTestRenderer;
  act(() => {
    headerRoot = renderer.create(options.headerRight());
  });
  return headerRoot.root.findByProps({ accessibilityRole: "button" });
}

describe("EventDetailScreen (#120 in-app pamphlet)", () => {
  beforeEach(() => {
    mockedSetOptions.mockClear();
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

describe("EventDetailScreen share button", () => {
  beforeEach(() => {
    mockedSetOptions.mockClear();
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

  it("registers a headerRight share button via navigation.setOptions", () => {
    act(() => {
      renderer.create(<EventDetailScreen />);
    });
    expect(mockedSetOptions).toHaveBeenCalled();
    expect(renderHeaderRight()).toBeTruthy();
  });

  it("tapping it calls Share.share with the title and poster URL as plain text (Android needs the link IN the message, not just the url field)", async () => {
    act(() => {
      renderer.create(<EventDetailScreen />);
    });
    const button = renderHeaderRight();
    await act(async () => {
      button.props.onPress();
    });
    expect(Share.share).toHaveBeenCalledWith({
      message: "Sustainability Big Impact\nhttps://example.com/poster.jpg",
      url: "https://example.com/poster.jpg",
    });
  });

  it("swallows a dismissed/failed share silently instead of alerting", async () => {
    (Share.share as jest.Mock).mockRejectedValue(new Error("share failed"));
    act(() => {
      renderer.create(<EventDetailScreen />);
    });
    const button = renderHeaderRight();
    await act(async () => {
      button.props.onPress();
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
