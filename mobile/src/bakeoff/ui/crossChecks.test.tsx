import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";

let mockBottom = 0;
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: mockBottom, left: 0, right: 0 }) }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  return {
    BottomSheetModal: R.forwardRef((p: any, _r: any) => <>{p.children}</>), BottomSheetBackdrop: () => null, useBottomSheetSpringConfigs: (c: object) => c, useBottomSheetTimingConfigs: (c: object) => c,
    useScrollEventsHandlersDefault: () => ({}),
    BottomSheetScrollView: (p: any) => { (globalThis as any).__content = p.contentContainerStyle; return <>{p.children}</>; },
  };
});
import { Sheet } from "./Sheet";
import { StationSwitcher } from "../screens/StationSwitcher";
import { HoursSheet } from "../screens/HoursSheet";
import { DietPrefs } from "../screens/DietPrefs";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const textStyle = (r: renderer.ReactTestRenderer, label: string) => flat(r.root.findAll((n) => (n.type as unknown) === "Text" && [n.props.children].flat().join("") === label)[0]);

// M2 `.sbody{padding:0 20px calc(24px + var(--sb))}`, `--sb: max(10px, env(safe-area-inset-bottom))` (src.html:31, 449)
describe("a sheet's bottom", () => {
  it.each([[0, 34], [6, 34], [10, 34], [34, 58]])("with a %s dp inset the content ends 24 + max(10, inset) = %s above the edge", (inset, expected) => {
    mockBottom = inset;
    make(<Sheet maxHeight={600}><></></Sheet>);
    expect((globalThis as any).__content.paddingBottom).toBe(expected);
  });
});

// M2 `#stidx button.cur`, `#days .day.cur`: font-weight 700
describe("the current row's weight", () => {
  it("is 700 in the station roster", () => {
    const r = make(<StationSwitcher title="Worcester lunch" stations={[{ name: "Grill", count: 3 }, { name: "Soups", count: 2 }]} current={1} maxHeight={600} onPick={() => {}} onDismiss={() => {}} />);
    expect(textStyle(r, "Soups").fontFamily).toBe("LibreFranklin_700Bold");
    expect(textStyle(r, "Grill").fontFamily).toBe(m2.font.bodyMd);
  });
  it("is 700 in the schedule's days", () => {
    const s = { name: "Worcester", address: "x", building: "", mapAddress: null, payment: "", description: "", days: [{ i: 0, label: "Today", right: "7 AM", current: true, meals: [], event: null }, { i: 1, label: "Tomorrow", right: "", current: false, meals: [], event: null }] } as never;
    const r = make(<HoursSheet s={s} maxHeight={600} onPick={() => {}} onDismiss={() => {}} />);
    expect(textStyle(r, "Today").fontFamily).toBe("LibreFranklin_700Bold");
    expect(textStyle(r, "Tomorrow").fontFamily).toBe(m2.font.bodyMd);
  });
});

// M2 `.h3{margin:22px 0 4px}` beats `.dh{margin-top:12px}` at equal specificity (declared later), and `.dh~.dh{margin-top:28px}` is the second group
describe("Dietary preferences' headings", () => {
  it("the first is 22 under the bar, the second 28 under the group above", () => {
    const r = make(<DietPrefs />);
    expect(textStyle(r, "Only show").marginTop).toBe(22);
    expect(textStyle(r, "Avoid").marginTop).toBe(28);
  });
});
