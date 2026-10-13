import { StyleSheet, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { StateCurtain } from "./NetState";

// M2 `.mst{padding:28px 20px 8px}` holds `<p class="empty">`: the UA's 16 px paragraph margin, then `.mst .empty{padding:0 0 16px}`,
// then the button. The words start 28 + 16 under the pinned rows and the button 16 + 16 under the words.
const render = () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<StateCurtain state="fail" top={0} text="Worcester's menu didn't load." />); });
  return r;
};
const styled = (r: renderer.ReactTestRenderer) => r.root.findAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {});

describe("a failed menu's words and button", () => {
  it("the words start 28 + 16 under the pinned rows", () => expect(styled(render()).some((s) => s.paddingTop === 44)).toBe(true));
  it("the button is 16 + 16 under the words", () => expect(styled(render()).some((s) => s.marginTop === 32 && s.height === 52)).toBe(true));
});
