import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { loadFixture } from "../logic/fixture";
import { menuItems, menuView } from "../logic/menuView";
import { MenuList, MenuSlice, type RowContext } from "./MenuList";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));
jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return { FlashList: R.forwardRef(function FL(props: any, ref: any) {
    R.useImperativeHandle(ref, () => ({ computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {} }));
    return <V testID="list">{props.ListHeaderComponent}{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
  }) };
});

const fx = loadFixture();
const view = menuView(fx, "2026-10-08", "W", "lunch", { veg: false, plant: false, halal: false, avoid: [] }, false);
const items = menuItems(view, { veg: false, plant: false, halal: false, avoid: [] }, false, "");
const row: RowContext = { scores: { health: false, carbon: false }, day: 0, place: "W", meal: "lunch", onOpen: () => {}, hereKey: null, onToggleAll: () => {} };
const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const HEAD = 402;

describe("the slice the open shows before the list", () => {
  it("is the rows that fit under the pinned head, no more (at least 64 each)", () => {
    const r = make(<MenuSlice items={items} row={row} head={HEAD} height={800} />);
    const kids = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "slice-row");
    expect(kids.length).toBe(Math.ceil((800 - HEAD) / 64));
    expect(kids.length).toBeLessThan(items.length);
  });
  it("starts the first row where the list does: under a spacer of the head's height, at scroll 0", () => {
    const slice = make(<MenuSlice items={items} row={row} head={HEAD} height={800} />);
    const list = make(<MenuList items={items} state="ok" stateText="" row={row} head={HEAD} animatedRef={undefined} holdOn={{ get: () => 1 }} onScroll={undefined} scrollY={{ get: () => 0 }} onViewable={() => {}} />);
    const spacer = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && StyleSheet.flatten(n.props.style)?.height === HEAD)[0];
    expect(StyleSheet.flatten(spacer(slice).props.style)).toEqual(StyleSheet.flatten(spacer(list).props.style));
    // the same first row, drawn by the same MenuItem
    const first = (r: renderer.ReactTestRenderer) => JSON.stringify(r.root.findAll((n) => n.props.it && n.props.it === items[0])[0].props.it);
    expect(first(slice)).toBe(first(list));
  });
  it("draws nothing for a curtain's empty list", () => {
    const r = make(<MenuSlice items={[]} row={row} head={HEAD} height={800} />);
    expect(r.root.findAll((n) => n.props.testID === "slice-row")).toHaveLength(0);
  });
  it("mounts cheaply: the rows that fit, in well under the time of the full list", () => {
    const t = (el: React.ReactElement) => { const a = performance.now(); make(el); return performance.now() - a; };
    t(<MenuSlice items={items} row={row} head={HEAD} height={800} />);   // warm the module graph
    const slice = t(<MenuSlice items={items} row={row} head={HEAD} height={800} />);
    const list = t(<MenuList items={items} state="ok" stateText="" row={row} head={HEAD} animatedRef={undefined} holdOn={{ get: () => 1 }} onScroll={undefined} scrollY={{ get: () => 0 }} onViewable={() => {}} />);
    console.log(`slice ${slice.toFixed(1)} ms for ${Math.ceil((800 - HEAD) / 64)} rows; full list ${list.toFixed(1)} ms for ${items.length} items (jest, JS only)`);
    expect(slice).toBeLessThan(list);
  });
});
