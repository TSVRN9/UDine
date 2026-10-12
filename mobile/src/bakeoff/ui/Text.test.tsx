import { StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Text } from "./Text";

const style = (v: keyof typeof m2.type) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Text v={v}>Soups</Text>); });
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
  it("a roomy variant is left alone", () => expect(style("rowName").paddingBottom).toBeUndefined());
});
