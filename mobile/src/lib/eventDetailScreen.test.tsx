// Lives here, not next to src/app/event-detail.tsx: expo-router scans every file under src/app/
// as a candidate route (see redirect.test.tsx's own note -- a .test.tsx there gets bundled into
// the real app and crashes at runtime on the bare `jest` global). Imports the screen by relative
// path instead, same pattern as redirect.test.tsx/hallMenu.test.tsx.
import renderer, { act } from "react-test-renderer";
import { Image, Text } from "react-native";
import * as expoRouter from "expo-router";
import EventDetailScreen from "../app/event-detail";

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
}));

const mockedUseLocalSearchParams = expoRouter.useLocalSearchParams as jest.Mock;

function texts(root: renderer.ReactTestRenderer) {
  return root.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .join(" ");
}

describe("EventDetailScreen (#120 in-app pamphlet)", () => {
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
