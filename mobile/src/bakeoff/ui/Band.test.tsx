import { StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { Band } from "./Band";

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
