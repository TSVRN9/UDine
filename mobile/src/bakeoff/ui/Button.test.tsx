import { StyleSheet, Text as RNText } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Button } from "./Button";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const press = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPressIn === "function")[0];
const text = (r: renderer.ReactTestRenderer) => flat(r.root.findAllByType(RNText)[0]);

// what each hand-rolled button drew before they became one: M2 `.btn`, `.btn.line`, `.obtn`, `.gbtn`, `.dirb`
const centered = { alignItems: "center", justifyContent: "center", borderRadius: 8 };
const cases = [
  ["HallsList / LogReceipt: Try again, Undo", "outline", "md", {}, { height: 44, paddingHorizontal: 14, borderWidth: 1.5, borderColor: m2.color.outline }, { fontSize: 15, color: m2.color.white }],
  ["HoursSheet: Directions (.dirb)", "line", "md", {}, { height: 44, paddingHorizontal: 16, borderWidth: 1.5, borderColor: m2.color.vm }, { fontSize: 15, color: m2.color.vm }],
  ["NetState: Try again (.btn.line)", "line", "lg", {}, { height: 52, borderWidth: 1.5, borderColor: m2.color.vm }, { fontSize: 17, color: m2.color.vm }],
  ["DishSheet: Add to plate (.btn)", "fill", "lg", {}, { height: 52, backgroundColor: m2.color.vm }, { fontSize: 17, color: m2.color.white }],
  ["EventPage: the first link", "gold", "lg", {}, { height: 52, backgroundColor: m2.color.gold }, { fontSize: 17, color: m2.color.dm }],
  ["EventPage: the other links", "outline", "lg", {}, { height: 52, borderWidth: 1.5, borderColor: m2.color.outline }, { fontSize: 17, color: m2.color.white }],
  ["PlateBar: Log (.gbtn)", "gold", "bar", {}, { height: 48, minWidth: 84, paddingHorizontal: 18, backgroundColor: m2.color.gold }, { fontSize: 16, color: m2.color.dm }],
  ["PlateBar: a hall to log at (.gbtn, min-width 0, padding 14)", "gold", "choose", {}, { height: 48, minWidth: 0, paddingHorizontal: 14, backgroundColor: m2.color.gold, flexShrink: 1 }, { fontSize: 16, color: m2.color.dm }],
] as const;

describe("Button", () => {
  it.each(cases)("%s", (_name, kind, size, extra, box, label) => {
    const r = make(<Button kind={kind} size={size} label="Go" onPress={() => {}} {...extra} />);
    expect(flat(press(r))).toMatchObject({ ...centered, ...box });
    expect(text(r)).toMatchObject(label);
  });
  it("is a button, scales on press, and passes a press through", () => {
    const hit = jest.fn();
    const r = make(<Button kind="fill" size="lg" label="Go" onPress={hit} />);
    expect(press(r).props.accessibilityRole).toBe("button");
    act(() => { press(r).props.onPress(); });
    expect(hit).toHaveBeenCalledTimes(1);
  });
  it("keeps the caller's accessibility label and its own margin", () => {
    const r = make(<Button kind="line" size="md" label="Directions" accessibilityLabel="Directions" accessibilityRole="link" style={{ marginTop: 6 }} />);
    expect(press(r).props.accessibilityLabel).toBe("Directions");
    expect(press(r).props.accessibilityRole).toBe("link");
    expect(flat(press(r)).marginTop).toBe(6);
  });
});
