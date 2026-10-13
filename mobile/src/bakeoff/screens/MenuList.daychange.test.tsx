import { act } from "react";
import renderer from "react-test-renderer";
import type { Dish } from "../logic/types";
import { MenuItem, type RowContext } from "./MenuList";

const draws: string[] = [];
jest.mock("../ui", () => ({ ...jest.requireActual("../ui"), ListRow: (p: { name: string }) => { draws.push(p.name); return null; } }));
jest.mock("./RowControl", () => ({ RowControl: () => null }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));

const row: RowContext = { scores: { health: false, carbon: false }, day: 1, place: "W", meal: "lunch", onOpen: () => {}, hereKey: null, onToggleAll: () => {} };

// A day change commits a new list of items: new item objects and new `contains` arrays, and a new rows context (the day). A row whose dish and what it
// shows are the same must not draw again; only rows whose data changed do (a Galaxy A53 trace: 238-335 ms of JS on a day change).
describe("a day change across rows", () => {
  it("redraws only the rows whose dish changed", () => {
    const mk = (key: string) => ({ key, name: key, station: "Grill", diet: 0, cal: 1, p: 1 }) as unknown as Dish;
    const a = mk("a"), b = mk("b"), c = mk("c");
    const list = (ds: Dish[], day: number) => <>{ds.map((d) => <MenuItem key={d.key} it={{ t: "dish", dish: d, contains: [] }} row={{ ...row, day }} />)}</>;
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(list([a, b], 1)); });
    expect(draws).toEqual(["a", "b"]);
    draws.length = 0;
    act(() => { r.update(list([a, c], 2)); });   // day 1 -> 2: b leaves, c arrives, a is on both days
    expect(draws).toEqual(["c"]);
  });
});
