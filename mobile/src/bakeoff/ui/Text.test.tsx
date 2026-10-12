import { StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

const style = (v: keyof typeof m2.type, own?: object) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Text v={v} style={own}>Soups</Text>); });
  return StyleSheet.flatten(r.root.findByType("Text" as never).props.style) as Record<string, number | string>;
};

describe("Text keeps descenders (Oswald at line == size clips on Android)", () => {
  const tight = (Object.keys(m2.type) as (keyof typeof m2.type)[]).filter((v) => m2.type[v].line < m2.type[v].size * 1.2);
  it("there are tight variants to guard", () => expect(tight).toEqual(expect.arrayContaining(["station", "day", "menuName", "bandName", "pinName", "letter"])));
  it.each(tight)("%s has room below its text and gives the same back, so the layout is M2's", (v) => {
    const s = style(v);
    expect(s.paddingBottom).toBeGreaterThanOrEqual(Math.ceil(m2.type[v].size * 0.3));
    expect(s.marginBottom).toBe(-(s.paddingBottom as number));
    expect(s.lineHeight).toBe(m2.type[v].line);
  });
  it("a caller's marginBottom is the layout: the room comes off it, not off the margin it replaced", () => {
    const sh = style("schedHead", { marginTop: 2, marginBottom: 6 });
    expect(sh.paddingBottom).toBe(Math.ceil(m2.type.schedHead.size * 0.3));
    expect(sh.marginBottom).toBe(6 - (sh.paddingBottom as number));
    expect(sh.marginTop).toBe(2);
    const se = style("section", { marginBottom: m2.space[0] });
    expect(se.marginBottom).toBe(m2.space[0] - (se.paddingBottom as number));
  });
  it("a caller's paddingBottom adds to the room", () => {
    const s = style("station", { paddingBottom: 3 });
    expect(s.paddingBottom).toBe(3 + Math.ceil(m2.type.station.size * 0.3));
  });
  it("a roomy variant is left alone", () => expect(style("rowName").paddingBottom).toBeUndefined());
});
