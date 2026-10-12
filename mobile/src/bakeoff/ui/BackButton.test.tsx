import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { BackButton } from "./BackButton";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };

// M2 `.icon{width:48px;height:48px}`, `.icon svg{width:24px;stroke-width:2.2}`: the one back arrow, on the maroon bar and over a photo
describe("BackButton", () => {
  it("is a 48 dp button labelled Back that passes a press through", () => {
    const hit = jest.fn();
    const r = make(<BackButton onPress={hit} />);
    const p = r.root.findAll((n) => typeof n.props.onPressIn === "function")[0];
    expect(p.props.accessibilityLabel).toBe("Back");
    expect(p.props.accessibilityRole).toBe("button");
    expect(StyleSheet.flatten(p.props.style)).toMatchObject({ width: 48, height: 48, alignItems: "center", justifyContent: "center" });
    act(() => { p.props.onPress(); });
    expect(hit).toHaveBeenCalledTimes(1);
  });
  it("draws one white 24 dp chevron on M2's path", () => {
    const r = make(<BackButton onPress={() => {}} />);
    expect(r.root.findByType(Svg).props).toMatchObject({ width: 24, height: 24, stroke: m2.color.white, strokeWidth: 2.2 });
    expect(r.root.findByType(Path).props.d).toBe("M15 5l-7 7 7 7");
  });
});
