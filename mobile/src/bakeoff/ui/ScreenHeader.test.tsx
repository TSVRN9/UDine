import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { ScreenHeader } from "./ScreenHeader";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const head = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && flat(n).backgroundColor === m2.color.dm)[0];
const texts = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => [n.props.children].flat().join(""));

// what Halls and You each laid out by hand: M2 `.hhead{padding:calc(st + 10) 20 16}` and `.yhead{... 18}`
describe("ScreenHeader", () => {
  it("Halls: 24 + 10 over, 20 at the sides, 16 under; the brand and the date on a 30 dp line, the title 2 under it", () => {
    const r = make(<ScreenHeader brand="UDine" date="Thursday, October 8" title="Lunch" />);
    expect(flat(head(r))).toMatchObject({ paddingTop: 34, paddingHorizontal: 20, paddingBottom: 16 });
    expect(texts(r)).toEqual(["UDine", "Thursday, October 8", "Lunch"]);
    const line = r.root.findAll((n) => typeof n.type === "string" && flat(n).height === 30)[0];
    expect(flat(line)).toMatchObject({ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" });
    expect(flat(r.root.findAll((n) => (n.type as unknown) === "Text" && n.props.accessibilityRole === "header")[0])).toMatchObject({ marginTop: 2, top: -2, fontSize: 52 });
  });
  it("its brand is 22 on Oswald's normal 32.6 line and its date 15 on the normal 18.2, baseline-aligned on the 30 dp row", () => {
    const r = make(<ScreenHeader brand="UDine" date="Thursday, October 8" title="Lunch" />);
    expect(flat(r.root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === "Thursday, October 8")[0])).toMatchObject({ fontSize: 15, lineHeight: 18.2 });
    expect(flat(r.root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === "UDine")[0])).toMatchObject({ fontSize: 22, lineHeight: 32.6 });
  });
  it("You: the date alone at the foot of its 30 dp line, 18 under the title", () => {
    const r = make(<ScreenHeader variant="you" date="Thursday, October 8" title="You" />);
    expect(flat(head(r)).paddingBottom).toBe(18);
    expect(texts(r)).toEqual(["Thursday, October 8", "You"]);
    expect(flat(r.root.findAll((n) => typeof n.type === "string" && flat(n).height === 30)[0])).toMatchObject({ justifyContent: "flex-end" });
  });
});
