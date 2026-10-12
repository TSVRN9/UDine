import renderer, { act } from "react-test-renderer";
import { dishKey, loadFixture, servingOn } from "../logic/fixture";
import type { Dish } from "../logic/types";
import { DishRow } from "./DishRow";
import * as store from "../state/store";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" },
}));
const Haptics = require("expo-haptics") as { impactAsync: jest.Mock };

const fx = loadFixture();
const dish = servingOn(fx, "2026-10-08", "W", "lunch", dishKey("Golden BBQ Chicken Thigh"))!;
const other = fx.days["2026-10-08"].F!.lunch!.flatMap((s) => s.dishes).find((d) => !fx.days["2026-10-08"].W!.lunch!.some((s) => s.dishes.some((x) => x.key === d.key)))!;

function mount(d: Dish, place: "W" | "F") {
  let v!: renderer.ReactTestRenderer;
  act(() => { v = renderer.create(<DishRow dish={d} contains={[]} scores={{ health: false, carbon: false }} lane place={place} meal="lunch" />); });
  return { s: store, v };
}
const button = (v: renderer.ReactTestRenderer, label: string) => v.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
const press = (b: renderer.ReactTestInstance) => act(() => { b.props.onPress(); });
const qtyText = (v: renderer.ReactTestRenderer) => JSON.stringify(v.toJSON());

describe("a dish row's control in the lane", () => {
  beforeEach(() => { Haptics.impactAsync.mockClear(); act(() => store.resetStore()); });
  it("+ adds the dish and becomes the stepper where it stands; the plate holds it", () => {
    const { s, v } = mount(dish, "W");
    expect(button(v, "Increase")).toBeUndefined();
    press(button(v, `Add ${dish.name}`));
    expect(s.getState().plates.plates[0].items.map((i) => [i.name, i.qty])).toEqual([[dish.name, 1]]);
    expect(button(v, `Add ${dish.name}`)).toBeUndefined();
    expect(qtyText(v)).toContain('"1"');
  });
  it("the stepper goes 1, 2, then back down through 1 and ½ to removed, and + comes back", () => {
    const { s, v } = mount(dish, "W");
    press(button(v, `Add ${dish.name}`));
    press(button(v, "Increase"));
    expect(s.getState().plates.plates[0].items[0].qty).toBe(2);
    press(button(v, "Decrease")); press(button(v, "Decrease"));
    expect(s.getState().plates.plates[0].items[0].qty).toBe(0.5);
    expect(qtyText(v)).toContain("½");
    press(button(v, "Decrease"));
    expect(s.getState().plates.plates).toEqual([]);
    expect(button(v, `Add ${dish.name}`)).toBeDefined();
  });
  it("haptics: Light for an add and a step up, Rigid for the removal and nothing for a step down", () => {
    const { v } = mount(dish, "W");
    press(button(v, `Add ${dish.name}`));
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("light");
    press(button(v, "Increase"));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    press(button(v, "Decrease")); press(button(v, "Decrease"));   // 2 -> 1 -> ½
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
    press(button(v, "Decrease"));
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith("rigid");
  });
  it("a row for a hall that cannot join the plate draws the outlined + (adding it starts a second plate)", () => {
    const { s, v } = mount(other, "F");
    act(() => s.add("lunch", dish.name, { W: dish }));
    expect(JSON.stringify(v.toJSON())).toContain('"borderWidth":1.5');
    press(button(v, `Add ${other.name}`));
    expect(s.getState().plates.plates).toHaveLength(2);
    expect(s.getState().plates.front).toBe(1);
  });
  it("a day-less row (lane off) draws no control", () => {
    let v!: renderer.ReactTestRenderer;
    act(() => { v = renderer.create(<DishRow dish={dish} contains={[]} scores={{ health: false, carbon: false }} lane={false} place="W" meal="lunch" />); });
    expect(button(v, `Add ${dish.name}`)).toBeUndefined();
  });
  it("Log empties the row's stepper back to +, and Undo brings the stepper back", () => {
    const { s, v } = mount(dish, "W");
    press(button(v, `Add ${dish.name}`));
    expect(button(v, "Increase")).toBeDefined();
    act(() => s.log());
    expect(button(v, "Increase")).toBeUndefined();
    expect(button(v, `Add ${dish.name}`)).toBeDefined();
    act(() => s.undo());
    expect(button(v, "Increase")).toBeDefined();
    expect(button(v, `Add ${dish.name}`)).toBeUndefined();
  });
  it("the arriving stepper and the + that returns carry a UI-thread entering animation, and a lane that is only being drawn carries none", () => {
    const entering = (v: renderer.ReactTestRenderer) => v.root.findAll((n) => typeof n.type === "string" && n.props.entering != null).length;
    const { v } = mount(dish, "W");
    expect(entering(v)).toBe(0);
    press(button(v, `Add ${dish.name}`));
    expect(entering(v)).toBe(1);   // the stepper arrives; it is never drawn whole first because its first frame is the animation's
    press(button(v, "Decrease")); press(button(v, "Decrease"));   // 1 -> ½ -> removed
    expect(entering(v)).toBe(1);   // and the + fades back in
    expect(button(v, `Add ${dish.name}`)).toBeDefined();
  });
  it("a row that mounts already on the plate has no arrival", () => {
    act(() => store.add("lunch", dish.name, { W: dish }));
    const v = mount(dish, "W").v;
    expect(v.root.findAll((n) => typeof n.type === "string" && n.props.entering != null)).toHaveLength(0);
  });
});
