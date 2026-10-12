import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import type { Dish } from "../logic/types";
import { MenuItem, type RowContext } from "./MenuList";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));

const row = (over: Partial<RowContext> = {}): RowContext => ({ scores: { health: false, carbon: false }, day: 0, place: "W", meal: "lunch", onOpen: () => {}, hereKey: null, onToggleAll: () => {}, ...over });
const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const texts = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => [n.props.children].flat().join(""));
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

describe("one line of the hall's list", () => {
  it("a station head is 50 high with its name at the foot", () => {
    const r = make(<MenuItem it={{ t: "head", name: "Grill", si: 0 }} row={row()} />);
    expect(texts(r)).toEqual(["Grill"]);
    expect(r.root.findAll((n) => typeof n.type === "string" && flat(n).height === 50)).toHaveLength(1);
  });
  it("the diet note toggles Show all", () => {
    const toggle = jest.fn();
    const r = make(<MenuItem it={{ t: "note", line: "3 dishes hidden", revealed: false }} row={row({ onToggleAll: toggle })} />);
    const b = r.root.findAll((n) => typeof n.props.onPress === "function")[0];
    act(() => { b.props.onPress(); });
    expect(toggle).toHaveBeenCalled();
    expect(texts(r)).toEqual(["3 dishes hidden", "Show all"]);
  });
  it("a holiday's note opens its event, and is inert where nothing listens", () => {
    const open = jest.fn();
    const r = make(<MenuItem it={{ t: "event", i: 3, title: "Indigenous Peoples Day Hours" }} row={row({ onEvent: open })} />);
    const b = r.root.findAll((n) => typeof n.props.onPress === "function")[0];
    act(() => { b.props.onPress(); });
    expect(open).toHaveBeenCalledWith(3);
    expect(flat(b).minHeight).toBe(52);
    const inert = make(<MenuItem it={{ t: "event", i: 3, title: "x" }} row={row()} />);
    expect(inert.root.findAll((n) => typeof n.props.onPress === "function")).toHaveLength(0);
  });
  it("a café with no dishes says what it is and that it lists none", () => {
    const r = make(<MenuItem it={{ t: "cafe", name: "Wasabi", description: "Sushi." }} row={row()} />);
    expect(texts(r)).toEqual(["Sushi.", "Menu", "Wasabi doesn't list its menu in the app."]);
  });
  it("an empty day says so, 28 under the pinned rows", () => {
    const r = make(<MenuItem it={{ t: "empty", text: "No menu posted for Friday." }} row={row()} />);
    expect(texts(r)).toEqual(["No menu posted for Friday."]);
    expect(r.root.findAll((n) => typeof n.type === "string" && flat(n).paddingTop === m2.space.stateTop)).toHaveLength(1);
  });
  it("a dish is a row; the one the list was brought up to is the tinted one", () => {
    const d = { key: "k", name: "Pizza", station: "Grill", cal: 300, p: 10, c: 30, f: 8, diet: 0, serving: "1 slice", allergens: [], health: null, carbon: null, price: null, ingredients: "", nutrition: {} } as unknown as Dish;
    const plain = make(<MenuItem it={{ t: "dish", dish: d, contains: [] }} row={row()} />);
    const here = make(<MenuItem it={{ t: "dish", dish: d, contains: [] }} row={row({ hereKey: "k" })} />);
    expect(texts(plain)).toContain("Pizza");
    const tinted = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && flat(n).backgroundColor === m2.color.here).length;
    expect(tinted(plain)).toBe(0);
    expect(tinted(here)).toBe(1);
  });
});
