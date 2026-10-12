import { act } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { CheckRow } from "../screens/CheckRow";
import { LRow, LRowSub } from "./LRow";

jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" } }));
const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const box = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && flat(n).minHeight === 56)[0];

// M2 `.lrow{min-height:56px;border-bottom:1px solid var(--hair);padding:8px 0;gap:12px}` (and `.check`, `.lrow:last-child{border-bottom:0}`)
describe("LRow", () => {
  it("is 56 high, a row with its ends apart, a hairline under it", () => {
    expect(flat(box(make(<LRow title="Franklin" trailing={<View />} />)))).toMatchObject({
      minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, gap: 12, borderBottomWidth: 1, borderBottomColor: m2.color.hair,
    });
  });
  it("has no rule when it is the last", () => expect(flat(box(make(<LRow title="Franklin" last />))).borderBottomWidth).toBe(0));
  it("says its title in rowName and its sub 2 under it in meta, slate", () => {
    const r = make(<LRow title="Dietary preferences" sub={<LRowSub>Vegetarian</LRowSub>} />);
    const [t, s] = r.root.findAllByType(RNText).map(flat);
    expect(t).toMatchObject({ fontSize: 16, color: m2.color.ink });
    expect(s).toMatchObject({ fontSize: 13, color: m2.color.slate, marginTop: 2 });
  });
  it("is plain without a press and a button that tints with one", () => {
    expect(make(<LRow title="x" />).root.findAll((n) => typeof n.props.onPressIn === "function")).toHaveLength(0);
    const hit = jest.fn();
    const r = make(<LRow title="x" onPress={hit} />);
    const p = r.root.findAll((n) => typeof n.props.onPressIn === "function")[0];
    expect(p.props.accessibilityRole).toBe("button");
    act(() => { p.props.onPress(); });
    expect(hit).toHaveBeenCalled();
  });
});

describe("CheckRow is an LRow with a 26 dp box", () => {
  it("off: a 2 dp slate outline; on: filled vm", () => {
    const boxes = (on: boolean) => make(<CheckRow label="Halal" on={on} onToggle={() => {}} />).root.findAll((n) => typeof n.type === "string" && flat(n).width === 26).map(flat)[0];
    expect(boxes(false)).toMatchObject({ height: 26, borderRadius: 6, borderWidth: 2, borderColor: m2.color.slate, backgroundColor: "transparent" });
    expect(boxes(true)).toMatchObject({ backgroundColor: m2.color.vm, borderWidth: 0 });
  });
  it("is a checkbox with its state and a label that includes its line", () => {
    const r = make(<CheckRow label="Charles River Campus" line="Newton" on onToggle={() => {}} last />);
    const p = r.root.findAll((n) => typeof n.props.onPressIn === "function")[0];
    expect(p.props).toMatchObject({ accessibilityRole: "checkbox", accessibilityState: { checked: true }, accessibilityLabel: "Charles River Campus, Newton" });
    expect(flat(p).borderBottomWidth).toBe(0);
  });
});
