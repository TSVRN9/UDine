// CafeSheet reads no safe-area insets or Modal machinery anymore (café-screen unification: it's
// plain content mounted inside HallMenuScreenBody's info-only state, not a standalone sheet Modal
// -- see this file's own doc comment).
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text } from "react-native";
import type { RetailLocationHours } from "@udine/shared";
import { CafeSheet } from "./CafeSheet";

function texts(root: renderer.ReactTestRenderer) {
  return root.root.findAllByType(Text).map((n) => n.props.children);
}

// Some Text nodes interpolate JSX (`No menu posted for {name} today`), which react-test-renderer
// gives back as separate array elements, not one joined string -- flatten each node's children to
// a single string before joining across nodes, so substring assertions work the way they read.
function allText(root: renderer.ReactTestRenderer): string {
  return root.root
    .findAllByType(Text)
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)))
    .join(" | ");
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

function render(
  location: RetailLocationHours,
  pdf: { url: string; label: string } | null = null,
  onOpenPdf = jest.fn(),
  onOpenCustomFoodForm = jest.fn(),
) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <CafeSheet loc={location} now={NOON} pdf={pdf} onOpenPdf={onOpenPdf} onOpenCustomFoodForm={onOpenCustomFoodForm} />,
    );
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

  it("#416: hoursBox pill uses CafeMenuInfoOnly.dc.html:39's smaller/bolder spec, distinct from the top status pill (CafeSheet.dc.html:36)", () => {
    const root = render(loc({ hours: { openTime: "7:00 AM", closeTime: "6:00 PM" } }));
    const pills = root.root.findAllByType(Text).filter((n) => {
      const kids = Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children);
      return kids.includes("OPEN · TIL");
    });
    expect(pills.length).toBe(2);
    const topStyle = StyleSheet.flatten(pills[0].props.style as never) as {
      fontSize?: number;
      letterSpacing?: number;
    };
    const hoursStyle = StyleSheet.flatten(pills[1].props.style as never) as {
      fontSize?: number;
      letterSpacing?: number;
    };
    expect(topStyle.fontSize).toBe(10);
    expect(topStyle.letterSpacing).toBe(0.5);
    expect(hoursStyle.fontSize).toBe(9);
    expect(hoursStyle.letterSpacing).toBe(0.8);
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

  it("#377: never renders its own café-name title (dedupes against [slug].tsx's 22px header) -- no pdf/CTA state, so the name should appear nowhere", () => {
    const root = render(loc({ name: "babyBerk" }), { url: "https://umassdining.com/menu.pdf", label: "Baby Berk Menu" });
    expect(texts(root).flat()).not.toContain("babyBerk");
  });

  it("#376: no-menu-at-all state shows the 'Log What You Got Here' CTA and boxed hours row, and the CTA routes into the custom-food flow", () => {
    const onOpenCustomFoodForm = jest.fn();
    const root = render(loc({ name: "babyBerk", hours: { openTime: "11:00 AM", closeTime: "6:00 PM" } }), null, jest.fn(), onOpenCustomFoodForm);
    expect(allText(root)).toContain("Log What You Got Here");
    expect(allText(root)).toContain("No menu posted for babyBerk today");
    expect(texts(root).flat()).toContain("Today");
    expect(texts(root).flat()).toContain("11:00 AM – 6:00 PM");
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Log what you got here" }).props.onPress();
    });
    expect(onOpenCustomFoodForm).toHaveBeenCalledWith(undefined);
  });

  it("#376: the CTA does not show when a pdf menu was found instead", () => {
    const root = render(loc(), { url: "https://umassdining.com/menu.pdf", label: "Baby Berk Menu" });
    expect(texts(root).flat()).not.toContain("Log What You Got Here");
  });
});
