// docs/briefs/platesheet-search-visual-parity.md -- one test per audit row (1-17), every value read
// from the artboard's own inline style / SVG attributes via artboard.ts, never typed in by eye.
// Anchor note: "Search" appears three times in PlateSheetResults.dc.html (back-header title #0,
// the button #1, "Search UMass Dining directly" #2), so every "Search" anchor below passes its nth.
import renderer, { act } from "react-test-renderer";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { InMemoryLogStorage, searchBrandedFoods, searchFoods, searchProducts, type CustomFoodsStorage } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";
import { Spinner } from "./Skeleton";
import { Button } from "./ui";
import { getCachedDishCatalog, refreshDishCatalogIfStale, searchCachedDishes } from "../lib/dishCatalog";
import { searchCustomFoods } from "../lib/customFoodsStorage";
import { artboardEnclosingStyle, artboardStyle, artboardTag, normalizeColor } from "../lib/artboard";
import { colors, fonts, withOpacity } from "../lib/theme";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("../lib/supabase", () => ({ supabase: {} }));
jest.mock("@udine/shared", () => ({
  ...jest.requireActual("@udine/shared"),
  searchProducts: jest.fn(),
  searchFoods: jest.fn(),
  searchBrandedFoods: jest.fn(),
}));
jest.mock("../lib/dishCatalog", () => ({
  getCachedDishCatalog: jest.fn(),
  refreshDishCatalogIfStale: jest.fn(),
  searchCachedDishes: jest.fn(),
}));
jest.mock("../lib/customFoodsStorage", () => ({ searchCustomFoods: jest.fn() }));
jest.mock("../lib/lookupDish", () => ({
  ...jest.requireActual("../lib/lookupDish"),
  lookupDishLive: jest.fn(),
}));

const mockedSearchProducts = searchProducts as jest.Mock;
const mockedSearchFoods = searchFoods as jest.Mock;
const mockedSearchBrandedFoods = searchBrandedFoods as jest.Mock;
const mockedGetCachedDishCatalog = getCachedDishCatalog as jest.Mock;
const mockedRefreshDishCatalogIfStale = refreshDishCatalogIfStale as jest.Mock;
const mockedSearchCachedDishes = searchCachedDishes as jest.Mock;
const mockedSearchCustomFoods = searchCustomFoods as jest.Mock;

const PSR = "PlateSheetResults.dc.html";
const IN_FLIGHT = "SearchStateInFlight.dc.html";
const EMPTY = "SearchStateEmpty.dc.html";
const ERROR = "SearchStateError.dc.html";

const NUTRITION = {
  servingSize: "1 serving",
  calories: 200,
  caloriesFromFat: 0,
  totalFatG: 8,
  satFatG: 3,
  transFatG: 0,
  cholesterolMg: 10,
  sodiumMg: 400,
  totalCarbG: 24,
  dietaryFiberG: 1,
  sugarsG: 2,
  proteinG: 9,
};
const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };

const flat = (n: renderer.ReactTestInstance) => StyleSheet.flatten(n.props.style) ?? {};
const color = (v: unknown) => normalizeColor(v as string);
const byTestId = (root: renderer.ReactTestRenderer, id: string) => root.root.findAll((n) => n.type === View && n.props.testID === id);
const svgById = (root: renderer.ReactTestRenderer, id: string) => root.root.findAll((n) => n.type === Svg && n.props.testID === id)[0];
const textNode = (root: renderer.ReactTestRenderer, str: string) => root.root.findAll((n) => n.type === Text && n.props.children === str)[0];
const allText = (root: renderer.ReactTestRenderer) => root.root.findAllByType(Text).map((n) => [n.props.children].flat().join(""));
const buttonWithLabel = (root: renderer.ReactTestRenderer, label: string) => root.root.findAll((n) => n.type === Button && n.props.children === label)[0];
const directLookupButton = (root: renderer.ReactTestRenderer) => root.root.findAll((n) => n.type === Button && n.props.accessibilityLabel === "Search UMass Dining directly")[0];
/** The Press/Pressable Button actually renders -- carries the merged variant + override style. */
const buttonBox = (button: renderer.ReactTestInstance) => button.findAll((n) => n.props.accessibilityRole === "button" && n.props.style !== undefined)[0];
const insideScrollView = (n: renderer.ReactTestInstance) => {
  for (let p = n.parent; p; p = p.parent) if (p.type === ScrollView) return true;
  return false;
};

function renderSheet(overrides: Partial<Parameters<typeof PlateSheet>[0]> = {}) {
  let root!: renderer.ReactTestRenderer;
  const customFoodsStorage: CustomFoodsStorage = { addCustomFood: jest.fn(), removeCustomFood: jest.fn(), getAllCustomFoods: jest.fn().mockResolvedValue([]) };
  act(() => {
    root = renderer.create(
      <PlateSheet
        visible
        plate={[]}
        totals={ZERO_TOTALS}
        logStorage={new InMemoryLogStorage()}
        customFoodsStorage={customFoodsStorage}
        hallTid={1}
        onStep={() => {}}
        onSetCount={() => {}}
        onShowResultDetail={() => {}}
        onOpenCustomFoodForm={() => {}}
        onLog={() => {}}
        onClose={() => {}}
        {...overrides}
      />,
    );
  });
  return root;
}
const searchInput = (root: renderer.ReactTestRenderer) => root.root.findByProps({ placeholder: "Search for a food" });
function expand(root: renderer.ReactTestRenderer) {
  act(() => {
    root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
  });
}
async function runSearch(root: renderer.ReactTestRenderer, q: string) {
  if (root.root.findAllByProps({ placeholder: "Search for a food" }).length === 0) expand(root);
  act(() => {
    searchInput(root).props.onChangeText(q);
  });
  await act(async () => {
    searchInput(root).props.onSubmitEditing();
  });
}

/** Six OFF hits (5 visible + Load More), one of them a per-100g estimate, mirroring PlateSheetResults.dc.html's rows. */
function seedResults(count = 6) {
  const products = [
    { barcode: "k", productName: "Kind Bar — Dark Chocolate", nutrition: { ...NUTRITION, servingSize: "per 100g", calories: 452 } },
    { barcode: "q", productName: "Quest Protein Bar", nutrition: { ...NUTRITION, calories: 200 } },
    ...Array.from({ length: 4 }, (_, i) => ({ barcode: `x${i}`, productName: `Protein Bar ${i}`, nutrition: { ...NUTRITION, calories: 240 } })),
  ].slice(0, count);
  mockedSearchProducts.mockResolvedValue({ results: products, hasMore: false });
}
function failEverySource() {
  mockedSearchProducts.mockRejectedValue(new Error("off down"));
  mockedSearchFoods.mockRejectedValue(new Error("usda down"));
  mockedSearchBrandedFoods.mockRejectedValue(new Error("branded down"));
  mockedSearchCachedDishes.mockImplementation(() => {
    throw new Error("catalog down");
  });
}

beforeEach(() => {
  mockedSearchProducts.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedSearchFoods.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedSearchBrandedFoods.mockReset().mockResolvedValue({ results: [], hasMore: false });
  mockedGetCachedDishCatalog.mockReset().mockResolvedValue(null);
  mockedRefreshDishCatalogIfStale.mockReset().mockResolvedValue(undefined);
  mockedSearchCachedDishes.mockReset().mockReturnValue([]);
  mockedSearchCustomFoods.mockReset().mockReturnValue([]);
});

describe("PlateSheet search pane parity (platesheet-search-visual-parity)", () => {
  it("#1 back chevron is the artboard's 20x20 SVG (M15 5l-7 7 7 7, 2px round stroke) in a gap-10 / padding 2 0 row, not a text glyph", () => {
    const root = renderSheet();
    expand(root);
    const svgSpec = artboardTag(PSR, "min-width: 20px").attrs;
    const pathSpec = artboardTag(PSR, 'd="M15 5l-7 7 7 7"').attrs;
    const rowSpec = artboardEnclosingStyle(PSR, "Search", 1);

    const back = root.root.findByProps({ accessibilityLabel: "Back" });
    expect(allText(root)).not.toContain("‹");
    const svg = svgById(root, "searchBackChevron");
    expect(svg.props.width).toBe(Number(svgSpec.width));
    expect(svg.props.height).toBe(Number(svgSpec.height));
    expect(svg.props.viewBox).toBe(svgSpec.viewBox);
    const path = back.findAllByType(Path)[0];
    expect(path.props.d).toBe(pathSpec.d);
    expect(color(path.props.stroke)).toBe(color(pathSpec.stroke));
    expect(path.props.strokeWidth).toBe(Number(pathSpec["stroke-width"]));
    expect(path.props.strokeLinecap).toBe(pathSpec["stroke-linecap"]);
    expect(path.props.strokeLinejoin).toBe(pathSpec["stroke-linejoin"]);

    const row = flat(back.parent!);
    expect(row.gap).toBe(rowSpec.gap);
    expect(row.alignItems).toBe(rowSpec.alignItems);
    expect(row.paddingVertical).toBe(rowSpec.paddingVertical);
    expect(row.paddingHorizontal ?? 0).toBe(rowSpec.paddingHorizontal);
  });

  it("#2 input box: 1px rgba(36,26,20,0.2) border, radius 6, padding 10/12", () => {
    const root = renderSheet();
    expand(root);
    const spec = artboardEnclosingStyle(PSR, "protein bar", 1);
    const box = flat(svgById(root, "searchIcon").parent!);
    expect(box.borderWidth).toBe(spec.borderWidth);
    expect(color(box.borderColor)).toBe(spec.borderColor);
    expect(box.borderRadius).toBe(spec.borderRadius);
    expect(box.paddingVertical).toBe(spec.paddingVertical);
    expect(box.paddingHorizontal).toBe(spec.paddingHorizontal);
  });

  it("#3 input text: 13px, #3b0a0f", () => {
    const root = renderSheet();
    expand(root);
    const spec = artboardStyle(PSR, "protein bar");
    const input = flat(searchInput(root));
    expect(input.fontSize).toBe(spec.fontSize);
    expect(color(input.color)).toBe(spec.color);
  });

  it("#4 input row: gap 10 and children stretch (CSS default -- the artboard declares no align-items)", () => {
    const root = renderSheet();
    expand(root);
    const spec = artboardEnclosingStyle(PSR, "protein bar", 2);
    expect(spec.alignItems).toBeUndefined();
    const row = flat(byTestId(root, "searchRow")[0]);
    expect(row.gap).toBe(spec.gap);
    expect(row.alignItems).toBe("stretch");
  });

  it("#5 Search button: padding 0 18, fills the row height (not content-height), Oswald 600 12px; dims to the in-flight artboard's opacity while its own query is running", async () => {
    let resolveOff!: (v: unknown) => void;
    mockedSearchProducts.mockImplementation(() => new Promise((r) => (resolveOff = r)));
    const root = renderSheet();
    expand(root);
    const spec = artboardStyle(PSR, "Search", 1);
    const idle = flat(buttonBox(buttonWithLabel(root, "Search")));
    expect(idle.paddingVertical).toBe(spec.paddingVertical);
    expect(idle.paddingHorizontal).toBe(spec.paddingHorizontal);
    expect(idle.alignSelf).toBeUndefined(); // the input row's align-items: stretch fills the height
    const label = flat(buttonWithLabel(root, "Search").findByType(Text));
    expect(label.fontSize).toBe(spec.fontSize);
    expect(label.fontFamily).toBe(fonts.display600);
    expect(spec.fontWeight).toBe("600");

    await runSearch(root, "protein bar");
    const dimmed = flat(buttonBox(buttonWithLabel(root, "Search")));
    expect(dimmed.opacity).toBe(artboardStyle(IN_FLIGHT, "Search", 1).opacity);
    await act(async () => {
      resolveOff({ results: [], hasMore: false });
    });
  });

  describe("result rows", () => {
    it("#6 result name is 13px / 600", async () => {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      const spec = artboardStyle(PSR, "Quest Protein Bar");
      const name = flat(textNode(root, "Quest Protein Bar"));
      expect(name.fontSize).toBe(spec.fontSize);
      expect(spec.fontWeight).toBe("600");
      expect(name.fontFamily).toBe(fonts.body600);
    });

    it("#7 result calories: mono 11px, ink at 55%", async () => {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      const spec = artboardStyle(PSR, "210 cal");
      const cal = flat(textNode(root, "200 cal"));
      expect(cal.fontSize).toBe(spec.fontSize);
      expect(color(cal.color)).toBe(spec.color);
      expect(cal.fontFamily).toBe(fonts.mono);
    });

    it("#8 an estimated per-100g serving reads '≈ N cal per 100g' (the artboard's Kind Bar row)", async () => {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      artboardStyle(PSR, "≈ 452 cal per 100g"); // throws if the artboard's copy ever changes
      expect(textNode(root, "≈ 452 cal per 100g")).toBeTruthy();
      expect(allText(root).join("|")).not.toMatch(/est\. per 100g/);
    });

    it("#9 rows are padding 8/2 with the artboard's 8% divider BETWEEN rows only, none after the last", async () => {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      const rowSpec = artboardTag(PSR, "padding: 8px 2px").style;
      const dividerSpec = artboardTag(PSR, "height: 1px; background: rgba(36,26,20,0.08)").style;

      const rows = byTestId(root, "resultRow");
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        const s = flat(row);
        expect(s.paddingVertical).toBe(rowSpec.paddingVertical);
        expect(s.paddingHorizontal).toBe(rowSpec.paddingHorizontal);
        expect(s.gap).toBe(rowSpec.gap);
        expect(s.borderBottomWidth).toBeUndefined();
      }
      const dividers = byTestId(root, "resultDivider");
      expect(dividers).toHaveLength(rows.length - 1);
      for (const d of dividers) {
        expect(flat(d).height).toBe(dividerSpec.height);
        expect(color(flat(d).backgroundColor)).toBe(dividerSpec.backgroundColor);
      }
    });

    it("#9 a single result has no divider at all", async () => {
      seedResults(1);
      const root = renderSheet();
      await runSearch(root, "bar");
      expect(byTestId(root, "resultRow")).toHaveLength(1);
      expect(byTestId(root, "resultDivider")).toHaveLength(0);
    });
  });

  describe("footer actions", () => {
    async function withFooter() {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      return root;
    }
    const assertActionGeometry = (box: Record<string, unknown>, label: Record<string, unknown>, spec: ReturnType<typeof artboardStyle>) => {
      expect(box.borderWidth).toBe(spec.borderWidth);
      expect(color(box.borderColor)).toBe(spec.borderColor);
      expect(box.borderRadius).toBe(spec.borderRadius);
      expect(box.paddingVertical).toBe(spec.paddingVertical);
      expect(box.paddingHorizontal).toBe(spec.paddingHorizontal);
      expect(box.marginTop).toBe(spec.marginTop);
      expect(box.alignSelf).toBeUndefined(); // full width: stretches in the list's column
      expect(label.fontSize).toBe(spec.fontSize);
      expect(label.letterSpacing).toBe(spec.letterSpacing);
      expect(label.textTransform).toBe(spec.textTransform);
      expect(color(label.color)).toBe(spec.color);
    };

    it("#10 Load More is a full-width block: 1px @20% border, radius 6, padding 10, marginTop 6, Oswald 600 12px/0.8 uppercase ink @65%", async () => {
      const root = await withFooter();
      const button = buttonWithLabel(root, "Load More");
      const spec = artboardStyle(PSR, "Load More");
      assertActionGeometry(flat(buttonBox(button)), flat(button.findByType(Text)), spec);
      expect(flat(button.findByType(Text)).fontFamily).toBe(fonts.display600);
    });

    it("#11 Search UMass Dining directly mirrors Load More's geometry in the maroon secondary treatment", async () => {
      const root = await withFooter();
      const button = directLookupButton(root);
      const spec = artboardStyle(PSR, "Search UMass Dining directly");
      assertActionGeometry(flat(buttonBox(button)), flat(button.findByType(Text)), spec);
      expect(flat(button.findByType(Text)).fontFamily).toBe(fonts.display600);
      expect(color(spec.borderColor)).toBe(color(withOpacity(colors.maroon600, 45)));
      expect(color(spec.color)).toBe(color(colors.maroon600));
    });

    it("#12 Create-a-custom-food row: dashed box (padding 12/14, gap 10, marginTop 6) with the artboard's 18x18 SVG plus, not a text glyph", async () => {
      const root = await withFooter();
      const svgSpec = artboardTag(PSR, 'viewBox="0 0 20 20"').attrs;
      const pathSpec = artboardTag(PSR, 'd="M10 4v12M4 10h12"').attrs;
      const rowSpec = artboardEnclosingStyle(PSR, "Can't find it? Create a custom food", 1);

      const svg = svgById(root, "customFoodPlusIcon");
      expect(svg.props.width).toBe(Number(svgSpec.width));
      expect(svg.props.height).toBe(Number(svgSpec.height));
      expect(svg.props.viewBox).toBe(svgSpec.viewBox);
      const path = svg.findAllByType(Path)[0];
      expect(path.props.d).toBe(pathSpec.d);
      expect(color(path.props.stroke)).toBe(color(pathSpec.stroke));
      expect(path.props.strokeWidth).toBe(Number(pathSpec["stroke-width"]));
      expect(path.props.strokeLinecap).toBe(pathSpec["stroke-linecap"]);
      expect(allText(root)).not.toContain("+");

      const row = flat(root.root.findByProps({ accessibilityLabel: "Create a custom food" }));
      expect(row.borderWidth).toBe(rowSpec.borderWidth);
      expect(color(row.borderColor)).toBe(rowSpec.borderColor);
      expect(row.borderStyle).toBe("dashed");
      expect(row.borderRadius).toBe(rowSpec.borderRadius);
      expect(row.paddingVertical).toBe(rowSpec.paddingVertical);
      expect(row.paddingHorizontal).toBe(rowSpec.paddingHorizontal);
      expect(row.gap).toBe(rowSpec.gap);
      expect(row.marginTop).toBe(rowSpec.marginTop);
    });
  });

  describe("#13 scroll structure", () => {
    it("back header, input row and status rows sit OUTSIDE the ScrollView; only the results list scrolls", async () => {
      seedResults();
      const root = renderSheet();
      await runSearch(root, "bar");
      expect(root.root.findAllByType(ScrollView)).toHaveLength(1);
      expect(insideScrollView(root.root.findByProps({ accessibilityLabel: "Back" }))).toBe(false);
      expect(insideScrollView(searchInput(root))).toBe(false);
      expect(byTestId(root, "searchRow").every((n) => !insideScrollView(n))).toBe(true);
      expect(byTestId(root, "resultRow").every(insideScrollView)).toBe(true);
      expect(insideScrollView(buttonWithLabel(root, "Load More"))).toBe(true);
    });

    // Yoga's real shrink is what the emulator screenshots verify; this pins the chain that lets the
    // keyboard-follow wrapper and sheet give up height so the pinned header + input stay on screen.
    it("the keyboard-follow wrapper and sheet may shrink, so the pinned header stays visible above the keyboard", () => {
      const root = renderSheet();
      expand(root);
      const wrapper = byTestId(root, "keyboardFollowWrapper")[0];
      expect(flat(wrapper).flexShrink).toBe(1);
      const sheet = wrapper.findAll((n) => n.props.style && flat(n).maxHeight !== undefined)[0];
      expect(flat(sheet).flexShrink).toBe(1);
    });

    it("focusing the input never scrolls anything (the scrollToEnd hack is gone)", () => {
      const spy = jest.spyOn(ScrollView.prototype as unknown as { scrollToEnd: () => void }, "scrollToEnd").mockImplementation(() => {});
      const root = renderSheet();
      expand(root);
      act(() => {
        searchInput(root).props.onFocus?.();
      });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe("in-flight (SearchStateInFlight.dc.html)", () => {
    async function inFlight() {
      let resolveOff!: (v: unknown) => void;
      mockedSearchProducts.mockImplementation(() => new Promise((r) => (resolveOff = r)));
      mockedSearchCachedDishes.mockReturnValue([{ dishName: "Peanut Butter Protein Bites", nutrition: { ...NUTRITION, calories: 210 }, allergens: [], dietTags: [], updatedAt: "x" }]);
      mockedGetCachedDishCatalog.mockResolvedValue([{}]);
      const root = renderSheet();
      await runSearch(root, "protein bar");
      return { root, resolveOff };
    }

    it("#14 the spinner becomes the gold-tinted fetching row reading 'Searching…'", async () => {
      const { root, resolveOff } = await inFlight();
      const rows = byTestId(root, "searchStateRow");
      expect(rows).toHaveLength(1);
      const pillSpec = artboardEnclosingStyle(IN_FLIGHT, "Searching…", 2);
      const s = flat(rows[0]);
      expect(color(s.backgroundColor)).toBe(pillSpec.backgroundColor);
      expect(s.borderRadius).toBe(pillSpec.borderRadius);
      expect(s.paddingVertical).toBe(pillSpec.paddingVertical);
      expect(s.paddingHorizontal).toBe(pillSpec.paddingHorizontal);
      expect(s.gap).toBe(artboardEnclosingStyle(IN_FLIGHT, "Searching…", 1).gap);
      expect(rows[0].findAllByType(Spinner)).toHaveLength(1);
      const textSpec = artboardStyle(IN_FLIGHT, "Searching…");
      const t = flat(textNode(root, "Searching…"));
      expect(t.fontSize).toBe(textSpec.fontSize);
      expect(color(t.color)).toBe(textSpec.color);
      expect(insideScrollView(rows[0])).toBe(false);
      await act(async () => {
        resolveOff({ results: [], hasMore: false });
      });
      expect(byTestId(root, "searchStateRow")).toHaveLength(0);
    });

    it("#17 while in flight the footer actions stay hidden", async () => {
      const { root, resolveOff } = await inFlight();
      expect(directLookupButton(root)).toBeUndefined();
      expect(root.root.findAllByProps({ accessibilityLabel: "Create a custom food" })).toHaveLength(0);
      expect(buttonWithLabel(root, "Load More")).toBeUndefined();
      await act(async () => {
        resolveOff({ results: [], hasMore: false });
      });
    });
  });

  describe("empty (SearchStateEmpty.dc.html)", () => {
    it("#15 reads 'Nothing found for <committed query>' in the artboard's 13px / 65% / padding 8/2 treatment", async () => {
      const root = renderSheet();
      await runSearch(root, "zzqx");
      const spec = artboardStyle(EMPTY, "Nothing found for");
      const t = flat(textNode(root, "Nothing found for zzqx"));
      expect(t.fontSize).toBe(spec.fontSize);
      expect(color(t.color)).toBe(spec.color);
      expect(t.paddingVertical).toBe(spec.paddingVertical);
      expect(t.paddingHorizontal).toBe(spec.paddingHorizontal);
      expect(allText(root).join("|")).not.toMatch(/No matches/);
    });

    it("#15 keeps the COMMITTED query while the user types a new one without submitting", async () => {
      const root = renderSheet();
      await runSearch(root, "zzqx");
      act(() => {
        searchInput(root).props.onChangeText("pizza");
      });
      expect(textNode(root, "Nothing found for zzqx")).toBeTruthy();
      expect(allText(root).join("|")).not.toMatch(/Nothing found for pizza/);
    });

    it("#17 shows direct-lookup and Create, in that order", async () => {
      const root = renderSheet();
      await runSearch(root, "zzqx");
      expect(directLookupButton(root)).toBeTruthy();
      expect(root.root.findAllByProps({ accessibilityLabel: "Create a custom food" }).length).toBeGreaterThan(0);
    });
  });

  describe("error (SearchStateError.dc.html)", () => {
    it("#16 the raw red text becomes the gray pill: alert glyph + the approved copy, never the raw error", async () => {
      failEverySource();
      const root = renderSheet();
      await runSearch(root, "protein bar");

      const rows = byTestId(root, "searchErrorRow");
      expect(rows).toHaveLength(1);
      const pillSpec = artboardEnclosingStyle(ERROR, "Couldn't search right now", 1);
      const s = flat(rows[0]);
      expect(color(s.backgroundColor)).toBe(pillSpec.backgroundColor);
      expect(s.borderRadius).toBe(pillSpec.borderRadius);
      expect(s.gap).toBe(pillSpec.gap);
      expect(s.paddingVertical).toBe(pillSpec.paddingVertical);
      expect(s.paddingHorizontal).toBe(pillSpec.paddingHorizontal);

      const copy = "Couldn't search right now. Check your connection and try again.";
      const textSpec = artboardStyle(ERROR, "Couldn't search right now");
      const t = flat(textNode(root, copy));
      expect(t.fontSize).toBe(textSpec.fontSize);
      expect(t.lineHeight).toBe(Math.round((textSpec.fontSize as number) * (textSpec.lineHeight as number)));
      expect(color(t.color)).toBe(textSpec.color);

      const glyph = svgById(root, "searchErrorIcon");
      const glyphSpec = artboardTag(ERROR, 'viewBox="0 0 16 16"').attrs;
      expect(glyph.props.width).toBe(Number(glyphSpec.width));
      expect(glyph.props.height).toBe(Number(glyphSpec.height));
      expect(glyph.findAllByType(Circle).length).toBeGreaterThan(0);

      const body = allText(root).join("|");
      expect(body).not.toMatch(/Search failed|please try again, or create/);
      expect(JSON.stringify(root.toJSON())).not.toMatch(/b00020/i);
    });

    it("#17 error shows Create but not direct-lookup or Load More", async () => {
      failEverySource();
      const root = renderSheet();
      await runSearch(root, "protein bar");
      expect(root.root.findAllByProps({ accessibilityLabel: "Create a custom food" }).length).toBeGreaterThan(0);
      expect(directLookupButton(root)).toBeUndefined();
      expect(buttonWithLabel(root, "Load More")).toBeUndefined();
    });
  });

  describe("dev fixtures (__DEV__ only)", () => {
    it.each([
      ["search-inflight", /Searching…/],
      ["search-empty", /Nothing found for/],
      ["search-error", /Couldn't search right now/],
    ])("%s seeds its state on open under __DEV__", (fixture, expected) => {
      const root = renderSheet({ stressFixture: fixture });
      expect(allText(root).join("|")).toMatch(expected);
    });

    it("seeds nothing outside __DEV__", () => {
      const g = globalThis as unknown as { __DEV__: boolean };
      const prev = g.__DEV__;
      g.__DEV__ = false;
      try {
        const root = renderSheet({ stressFixture: "search-error" });
        expect(root.root.findAllByProps({ placeholder: "Search for a food" })).toHaveLength(0);
      } finally {
        g.__DEV__ = prev;
      }
    });
  });
});
