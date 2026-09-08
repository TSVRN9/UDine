// CafeSheet reads no safe-area insets or Modal machinery anymore (café-screen unification: it's
// plain content mounted inside HallMenuScreenBody's info-only state, not a standalone sheet Modal
// -- see this file's own doc comment).
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { RetailLocationHours } from "@udine/shared";
import { CafeSheet } from "./CafeSheet";

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

const NOON = new Date(2026, 7, 24, 12, 0);

function loc(overrides: Partial<RetailLocationHours> = {}): RetailLocationHours {
  return {
    name: "People's Organic Coffee",
    hours: { openTime: "7:00 AM", closeTime: "4:00 PM" },
    locationId: 32,
    breakfastMenu: null,
    lunchMenu: null,
    dinnerMenu: null,
    description: "",
    address: "",
    mapAddress: undefined,
    acceptedPayment: "",
    ...overrides,
  };
}

function render(location: RetailLocationHours, pdf: { url: string; label: string } | null = null, onOpenPdf = jest.fn()) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<CafeSheet loc={location} now={NOON} pdf={pdf} onOpenPdf={onOpenPdf} />);
  });
  return root;
}

describe("CafeSheet (info-only state content, #177/café-screen-unification)", () => {
  it("renders no menu card at all when the waterfall found no pdf (state 3 -- e.g. Paciugo/The Hub)", () => {
    const root = render(loc());
    expect(texts(root).flat()).not.toContain("MENU");
  });

  it("a pdf prop renders the caveat copy and a tappable row that calls onOpenPdf, not Linking.openURL", () => {
    const onOpenPdf = jest.fn();
    const root = render(loc(), { url: "https://umassdining.com/menu.pdf", label: "Baby Berk Menu" }, onOpenPdf);
    expect(texts(root).flat()).toContain("today's menu isn't posted yet — standing menu from umassdining.com");
    act(() => {
      root.root.findByProps({ accessibilityLabel: "View Baby Berk Menu" }).props.onPress();
    });
    expect(onOpenPdf).toHaveBeenCalledWith("https://umassdining.com/menu.pdf", "Baby Berk Menu");
  });

  it("shows the status pill with the styling spec's exact 'OPEN · TIL' copy", () => {
    const root = render(loc({ hours: { openTime: "7:00 AM", closeTime: "6:00 PM" } }));
    expect(texts(root).flat()).toContain("OPEN · TIL 6:00 PM");
  });

  it("hides DIRECTIONS for babyBerk's degenerate ',' mapAddress instead of opening a blank query", () => {
    const root = render(loc({ address: "<p><br/>,  </p>", mapAddress: "," }));
    expect(root.root.findAllByProps({ accessibilityLabel: "Get directions" }).length).toBe(0);
  });

  it("shows DIRECTIONS for a real parseable mapAddress", () => {
    const root = render(loc({ address: "<p>1 Campus Center Way<br/>Amherst, MA 01003</p>", mapAddress: "42.3915402,-72.5292962" }));
    expect(root.root.findAllByProps({ accessibilityLabel: "Get directions" }).length).toBeGreaterThan(0);
  });

  it("joins acceptedPayment with the styling spec's ' · ' separator", () => {
    const root = render(loc({ acceptedPayment: "Cash, Credit Cards, UCard, Dining Dollars, YCMP" }));
    expect(texts(root).flat()).toContain("Cash · Credit Cards · UCard · Dining Dollars · YCMP");
  });
});
