import { act } from "react";
import renderer from "react-test-renderer";
import { YouScreen } from "./YouScreen";
import { PushPage } from "./PushPage";
import { StyleSheet } from "react-native";
import { dishKey, loadFixture, servingOn } from "../logic/fixture";
import * as store from "../state/store";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));

const words = (n: renderer.ReactTestInstance) => n.findAll((x) => (x.type as unknown) === "Text").map((x) => [x.props.children].flat().join("")).join(" ");
const open = () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<YouScreen />); });
  const row = r.root.findAll((x) => typeof x.type !== "string" && typeof x.props.onPress === "function" && words(x).startsWith("Dietary preferences"))[0];
  act(() => { row.props.onPress(); });
  return r;
};

// M2 `navPush` for a You row: the screen below shifts left 30% and dims to 10% as the page comes in (MO.push)
describe("Dietary preferences is pushed over You", () => {
  it("hands the page the push it shifts and dims You by", () => {
    const r = open();
    expect(r.root.findByType(PushPage).props.progress).toBeDefined();
  });
  it("draws You's dim under the page", () => {
    const r = open();
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "push-dim")).toHaveLength(1);
  });
});

// M2 `.meal{padding:12px 0;border-bottom:1px solid var(--hair)}`
describe("a meal logged today", () => {
  it("has 12 above and below it and a hairline under it", () => {
    const fx = loadFixture();
    const dish = servingOn(fx, "2026-10-08", "W", "lunch", dishKey("Golden BBQ Chicken Thigh"))!;
    act(() => store.resetStore());
    act(() => { store.add("lunch", dish.name, { W: dish }); store.log(); });
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<YouScreen />); });
    const box = r.root.findAll((n) => typeof n.type === "string" && StyleSheet.flatten(n.props.style)?.borderBottomColor === "rgba(36,23,26,0.12)" && StyleSheet.flatten(n.props.style)?.paddingVertical !== undefined)[0];
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ paddingVertical: 12, borderBottomWidth: 1 });
  });
});

// M2 `dayBlock`: the Today section is `<div class="sec" style="padding-top:20px">`, 2 under `.sec`'s 22 the sections after it keep
describe("You's first section", () => {
  it("starts 20 under the head, the others 22", () => {
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<YouScreen />); });
    const top = (h: string) => {
      const t = r.root.findAll((x) => (x.type as unknown) === "Text" && x.props.children === h)[0];
      let n = t.parent;
      while (n && StyleSheet.flatten(n.props.style)?.paddingTop === undefined) n = n.parent;
      return StyleSheet.flatten(n!.props.style).paddingTop;
    };
    expect(top("Today")).toBe(20);
    expect(top("Meals")).toBe(22);
  });
});
