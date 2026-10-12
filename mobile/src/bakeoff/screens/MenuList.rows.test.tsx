import { act } from "react";
import { View } from "react-native";
import renderer from "react-test-renderer";
import type { Item } from "../logic/menuView";
import type { Dish } from "../logic/types";
import { MenuList, type RowContext } from "./MenuList";

let mockRenders = 0;
jest.mock("./DishRow", () => ({ DishRow: () => { mockRenders++; return null; } }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));
// this FlashList asks for every row on every render, so a row that re-renders without cause shows up here
jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return { FlashList: R.forwardRef(function FL(props: any, ref: any) {
    R.useImperativeHandle(ref, () => ({ computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {} }));
    return <V>{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
  }) };
});

const dish = (key: string) => ({ key, name: key, station: "Grill" }) as Dish;
const items: Item[] = [{ t: "dish", dish: dish("a"), contains: [] }, { t: "dish", dish: dish("b"), contains: [] }, { t: "dish", dish: dish("c"), contains: [] }];
const row: RowContext = { scores: { health: false, carbon: false }, day: 0, place: "W", meal: "lunch", onOpen: () => {}, hereKey: null, onToggleAll: () => {} };

// A day change re-renders HallMenu five or six times (the commit, the done, the sheet); the rows must not draw again for any that did not change them
// (a Galaxy A53 trace: 250 ms of JS on a day change, every visible row among it)
describe("the hall's rows", () => {
  it("do not render again when the screen does and nothing they show has changed", () => {
    const P = ({ n }: { n: number }) => <View testID={String(n)}><MenuList items={items} state="ok" stateText="" row={row} head={300} animatedRef={undefined} holdOn={{ get: () => 1 }} onScroll={undefined} scrollY={{ get: () => 0 }} onViewable={() => {}} /></View>;
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<P n={0} />); });
    expect(mockRenders).toBe(3);
    act(() => { r.update(<P n={1} />); });
    act(() => { r.update(<P n={2} />); });
    expect(mockRenders).toBe(3);
  });
  it("render again when what they show does change (the dish brought up)", () => {
    mockRenders = 0;
    const P = ({ r2 }: { r2: RowContext }) => <MenuList items={items} state="ok" stateText="" row={r2} head={300} animatedRef={undefined} holdOn={{ get: () => 1 }} onScroll={undefined} scrollY={{ get: () => 0 }} onViewable={() => {}} />;
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<P r2={row} />); });
    act(() => { r.update(<P r2={{ ...row, hereKey: "b" }} />); });
    expect(mockRenders).toBe(6);
  });
});
