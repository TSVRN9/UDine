// #385: "N items hidden" counter in the sheet title row (docs/design/FilterSheet.dc.html:37-40).
// Separate .tsx file from FilterSheet.test.ts (that one's plain-logic, no JSX) since this needs to
// render the component -- same safe-area mock as PlateSheet.test.tsx/PlateBar.test.tsx.
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import type { FoodPreferences } from "@udine/shared";
import { FilterSheet } from "./FilterSheet";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

function texts(root: renderer.ReactTestRenderer): string[] {
  return root.root.findAllByType(Text).map((n) => (Array.isArray(n.props.children) ? n.props.children.join("") : String(n.props.children)));
}

const prefs: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

function render(hiddenCount: number) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(
      <FilterSheet
        visible
        items={[]}
        prefs={prefs}
        onChangePreferences={() => {}}
        stationFilter={new Set()}
        onChangeStationFilter={() => {}}
        priceFilter={new Set()}
        onChangePriceFilter={() => {}}
        hiddenCount={hiddenCount}
        onClose={() => {}}
      />,
    );
  });
  return root;
}

describe("FilterSheet hiddenCount title-row counter (#385)", () => {
  it("renders 'N items hidden' when hiddenCount > 0", () => {
    const root = render(4);
    expect(texts(root)).toContain("4 items hidden");
  });

  it("renders nothing when hiddenCount is 0", () => {
    const root = render(0);
    expect(texts(root).some((t) => t.includes("items hidden"))).toBe(false);
  });
});
