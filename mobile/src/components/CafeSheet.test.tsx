// CafeSheet reads safe-area insets; no SafeAreaProvider in this render tree (same fix as
// PlateBar.test.tsx/PlateSheet.test.tsx).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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

function render(location: RetailLocationHours, onOpenPdf = jest.fn()) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<CafeSheet visible loc={location} now={NOON} onClose={jest.fn()} onOpenPdf={onOpenPdf} />);
  });
  return root;
}

describe("CafeSheet (#177 fallback sheet)", () => {
  it("labels the standing menu with the exact caveat copy the issue's owner comment requires -- never presented as today's menu", () => {
    // Real capture shape, hours.test.ts's REAL_PEOPLES_ORGANIC.breakfast_menu.
    const root = render(loc({ breakfastMenu: "<p>Bacon Croissant</p><p>Veggie Croissant</p>" }));
    expect(texts(root).flat()).toContain("today's menu isn't posted yet — standing menu from umassdining.com");
    expect(texts(root).flat()).toContain("MENU");
  });

  it("renders sanitized item-list menu rows (name + price) via the shared trust-boundary parser, never the raw markup", () => {
    // "Name $X.XX" is parseRetailMenuHtml's own price-splitting shape (shared/src/content.ts) --
    // Coffee's line has no price, Bagel's does, matching real feed variety (People's Organic's own
    // capture is name-only; the parser also handles an embedded price on the same line).
    const root = render(loc({ breakfastMenu: "<p>Coffee</p><p>Bagel $2.50</p>" }));
    const flat = texts(root).flat();
    expect(flat).toContain("Coffee");
    expect(flat).toContain("Bagel");
    expect(flat).toContain("$2.50");
    // Never the raw HTML fragment -- proves this renders parsed text, not {@html}-style raw markup.
    expect(flat.some((t) => typeof t === "string" && t.includes("<p>"))).toBe(false);
  });

  it("renders no menu card at all when nothing is posted (state 4 -- e.g. Paciugo/The Hub)", () => {
    const root = render(loc());
    expect(texts(root).flat()).not.toContain("MENU");
  });

  it("a PDF-shaped *_menu (babyBerk/Commonwealth) renders a tappable row that calls onOpenPdf, not Linking.openURL", () => {
    const onOpenPdf = jest.fn();
    // Real capture, hours.test.ts's REAL_BABYBERK.breakfast_menu.
    const root = render(
      loc({ breakfastMenu: '<p><a href="https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf" target="_blank">Baby Berk Menu</a></p>' }),
      onOpenPdf,
    );
    act(() => {
      root.root.findByProps({ accessibilityLabel: "View Baby Berk Menu" }).props.onPress();
    });
    expect(onOpenPdf).toHaveBeenCalledWith("https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf", "Baby Berk Menu");
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
