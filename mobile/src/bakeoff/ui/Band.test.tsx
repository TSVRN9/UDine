import { StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Band, BandFace, bandHeight } from "./Band";

// M2 `.bt{top:16px}` (src.html:150) and `.pin .bt{top:14px}` (src.html:176)
const textTop = (compact: boolean) => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Band name="Worcester" status="Open until midnight" compact={compact} />); });
  const box = r.root.findAllByType(View).find((v) => {
    const s = StyleSheet.flatten(v.props.style);
    return s?.position === "absolute" && s.left === 20 && typeof s.top === "number";
  })!;
  return StyleSheet.flatten(box.props.style).top;
};

describe("Band text block", () => {
  it("a hall band's text sits 16 under the band's top", () => expect(textTop(false)).toBe(16));
  it("a pinned café's text sits 14 under its top", () => expect(textTop(true)).toBe(14));
});

describe("BandFace (the band's copy that rides a container transform)", () => {
  it("draws the name and status with no button, no ground and no press layer", () => {
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<BandFace name="Worcester" status="Open until midnight" />); });
    expect(r.root.findAll((n) => typeof n.props.onPressIn === "function")).toHaveLength(0);
    expect(r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => n.props.children)).toEqual(["Worcester", "Open until midnight"]);
  });
  it("bandHeight is 112, a pinned café 84", () => { expect(bandHeight(false)).toBe(112); expect(bandHeight(true)).toBe(84); });
});
