import renderer, { act } from "react-test-renderer";
import { dishKey, loadFixture, servingOn } from "../logic/fixture";
import * as store from "../state/store";
import { PlateBar } from "./PlateBar";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" },
}));

const fx = loadFixture();
const dish = (place: "W" | "F", name: string) => servingOn(fx, "2026-10-08", place, "lunch", dishKey(name))!;
const sheet = { current: { snapToIndex: jest.fn() } } as never;
const index = { get: () => 0, set: () => {} } as never;

function mount() {
  let v!: renderer.ReactTestRenderer;
  act(() => { v = renderer.create(<PlateBar sheet={sheet} animatedIndex={index} collapse={jest.fn()} />); });
  return v;
}
const text = (v: renderer.ReactTestRenderer) => JSON.stringify(v.toJSON());
// the outermost pressable whose own text matches
const press = (v: renderer.ReactTestRenderer, label: RegExp) => {
  const words = (n: renderer.ReactTestInstance) => n.findAll((x) => (x.type as unknown) === "Text").map((x) => [x.props.children].flat().join("")).join(" ");
  const n = v.root.findAll((x) => typeof x.type !== "string" && typeof x.props.onPress === "function" && label.test(words(x)))[0];
  act(() => { n.props.onPress(); });
};

beforeEach(() => act(() => store.resetStore()));

it("draws the front plate's label, items and totals, and does not loop on the store (selectors are stable)", () => {
  act(() => { store.add("lunch", "Golden BBQ Chicken Thigh", { W: dish("W", "Golden BBQ Chicken Thigh") }); });
  const v = mount();
  expect(text(v)).toContain("Worcester lunch, 1 item");
  expect(text(v)).toContain("93");
});
it("Log crossfades to the receipt with Undo, and Undo brings the plate back", () => {
  act(() => { store.add("lunch", "Golden BBQ Chicken Thigh", { W: dish("W", "Golden BBQ Chicken Thigh") }); });
  const v = mount();
  press(v, /Log/);
  expect(text(v)).toContain("Logged Worcester lunch");
  expect(store.getState().plates.plates).toHaveLength(0);
  press(v, /Undo/);
  expect(store.getState().plates.plates).toHaveLength(1);
  expect(text(v)).toContain("Worcester lunch, 1 item");
});
it("a plate several halls serve asks where it is logged before it logs", () => {
  act(() => { store.add("lunch", "Beef Brisket Noodle Bowl", { W: dish("W", "Beef Brisket Noodle Bowl"), B: servingOn(fx, "2026-10-08", "B", "lunch", dishKey("Beef Brisket Noodle Bowl"))! }); });
  const v = mount();
  press(v, /Log/);
  expect(store.getState().log).toHaveLength(0);
  expect(text(v)).toContain("Log at");
  press(v, /Berkshire/);
  expect(store.getState().log[0].place).toBe("B");
});
it("a half-item plate says ½ items, not 0½ items", () => {
  act(() => {
    const d = dish("W", "Golden BBQ Chicken Thigh");
    store.add("lunch", d.name, { W: d });
    store.step(store.getState().plates.plates[0].id, d.key, -1);
  });
  expect(text(mount())).toContain("Worcester lunch, ½ items");
});
