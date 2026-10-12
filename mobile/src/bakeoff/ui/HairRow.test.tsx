import { act } from "react";
import { StyleSheet, Text } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { HairRow } from "./HairRow";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const pressables = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPressIn === "function");
const host = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && flat(n).borderBottomColor === m2.color.hair)[0];

describe("HairRow", () => {
  it("has the hairline under it, and takes its box from the row it is", () => {
    expect(flat(host(make(<HairRow style={{ minHeight: 64 }}><Text>x</Text></HairRow>)))).toMatchObject({ borderBottomWidth: 1, minHeight: 64 });
  });
  it("has none when it is the last", () => expect(flat(host(make(<HairRow last><Text>x</Text></HairRow>))).borderBottomWidth).toBe(0));
  it("is plain without a press, and a tinting button with one", () => {
    expect(pressables(make(<HairRow><Text>x</Text></HairRow>))).toHaveLength(0);
    const hit = jest.fn();
    const p = pressables(make(<HairRow onPress={hit}><Text>x</Text></HairRow>))[0];
    expect(p.props.accessibilityRole).toBe("button");
    act(() => { p.props.onPress(); });
    expect(hit).toHaveBeenCalled();
  });
});
