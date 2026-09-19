// platesheet-close-animation-missing: on a real device, closing PlateSheet from the expanded
// search state played no slide/fade at all -- it just vanished. Root cause (confirmed on-device,
// Agent_Emulator_Wide, Android 15/API 35): the "closing invalidates whatever's in flight and
// resets the search box" effect in PlateSheet.tsx was keyed on `visible`, which flips the INSTANT
// the user taps to close -- before useDraggableSheet's ~300ms close tween has rendered a single
// frame. That reset tears down a whole screenful of search rows/icons in the same commit the
// close animation is trying to start in, and the panel's own translateY/opacity animation gets
// dropped along with it (frame-by-frame capture: content flashed to the idle state, then the
// WHOLE panel vanished, both within one frame -- no intermediate slide). Keying the reset on
// `modalVisible` instead (true for the full close animation, only flipping false from
// useDraggableSheet's own completion callback, same value the render gate below already uses)
// keeps the content -- and the panel -- stable and visible for the whole close tween, confirmed
// on-device: the panel now visibly translates down across several frames before disappearing.
//
// Same withTiming-capturing technique as sheetAnimation.test.tsx's own suite, and for the same
// reason: the shipped react-native-reanimated mock invokes withTiming's callback SYNCHRONOUSLY
// with finished:true, which would flip modalVisible false in the same tick the close starts --
// exactly indistinguishable from the bug this test exists to catch. The spy must be installed
// before this file's first render (module scope), same caveat sheetAnimation.test.tsx documents.
import * as Reanimated from "react-native-reanimated";

const withTimingCalls: { toValue: number; callback?: (finished?: boolean) => void }[] = [];
jest.spyOn(Reanimated, "withTiming").mockImplementation(((toValue: number, _config?: unknown, callback?: (finished?: boolean) => void) => {
  withTimingCalls.push({ toValue, callback });
  return toValue as unknown as ReturnType<typeof Reanimated.withTiming>;
}) as typeof Reanimated.withTiming);

import renderer, { act } from "react-test-renderer";
import { Pressable, TextInput } from "react-native";
import { InMemoryLogStorage, type CustomFoodsStorage, type LogStorage } from "@udine/shared";
import { PlateSheet } from "./PlateSheet";

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
  getCachedDishCatalog: jest.fn().mockResolvedValue([]),
  refreshDishCatalogIfStale: jest.fn(),
  searchCachedDishes: jest.fn().mockReturnValue([]),
}));
jest.mock("../lib/customFoodsStorage", () => ({
  searchCustomFoods: jest.fn().mockReturnValue([]),
}));

function emptyLogStorage(): LogStorage {
  return new InMemoryLogStorage();
}
function fakeCustomFoodsStorage(): CustomFoodsStorage {
  return { addCustomFood: jest.fn(), removeCustomFood: jest.fn(), getAllCustomFoods: jest.fn().mockResolvedValue([]) };
}
const ZERO_TOTALS = { date: "x", calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 };

function baseProps(overrides: Partial<Parameters<typeof PlateSheet>[0]> = {}): Parameters<typeof PlateSheet>[0] {
  return {
    visible: true,
    plate: [],
    totals: ZERO_TOTALS,
    logStorage: emptyLogStorage(),
    customFoodsStorage: fakeCustomFoodsStorage(),
    hallTid: 1,
    onStep: () => {},
    onSetCount: () => {},
    onShowResultDetail: () => {},
    onOpenCustomFoodForm: () => {},
    onLog: () => {},
    onClose: () => {},
    ...overrides,
  };
}

function renderSheet(overrides: Partial<Parameters<typeof PlateSheet>[0]> = {}) {
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<PlateSheet {...baseProps(overrides)} />);
  });
  return root;
}

function searchExpanded(root: renderer.ReactTestRenderer): boolean {
  try {
    root.root.findByProps({ placeholder: "Search for a food" });
    return true;
  } catch {
    return false;
  }
}

describe("PlateSheet close keeps its content mounted through the close animation", () => {
  afterEach(() => {
    withTimingCalls.length = 0;
  });

  it("does not reset the expanded search state the instant `visible` flips false -- only once modalVisible does", () => {
    const root = renderSheet();

    // Expand search (idle -> search pane) so there's real in-flight UI state to lose.
    act(() => {
      root.root.findByProps({ accessibilityLabel: "Add something else" }).props.onPress();
    });
    act(() => {
      root.root.findByType(TextInput).props.onChangeText("flatbread");
    });
    expect(searchExpanded(root)).toBe(true);

    // Tap the scrim to close -- `visible` flips false, starting useDraggableSheet's close tween.
    act(() => {
      root.update(<PlateSheet {...baseProps({ visible: false })} />);
    });

    // The close animation's own completion callback hasn't fired yet (captured below, not
    // auto-resolved) -- the sheet is still mid-close and must still show exactly what it showed
    // before the tap, not an instant reset to the idle "Add something else" state.
    const closeCall = withTimingCalls.find((c) => c.toValue === 0);
    expect(closeCall).toBeTruthy();
    expect(searchExpanded(root)).toBe(true);
    expect(root.root.findByType(TextInput).props.value).toBe("flatbread");

    // Only once the close animation actually finishes (its completion callback fires, flipping
    // modalVisible false, the same transition the render gate below unmounts on) does the content
    // reset -- by which point the overlay is already gone, so this is invisible to the user.
    act(() => {
      closeCall?.callback?.(true);
    });
    expect(root.toJSON()).toBeNull();
  });
});
