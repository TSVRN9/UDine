import { readFileSync } from "fs";
import { join } from "path";
import { act } from "react";
import { Image, StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import Svg from "react-native-svg";
import { HallLetter } from "./HallLetter";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };

// react-native-svg rasterises each Svg in software on the UI thread on every draw: two 200 dp dashed letters cost the hall open 187 ms for its first frame
describe("the hall letter", () => {
  it("is an image, not an Svg", () => {
    const r = make(<HallLetter letter="W" />);
    expect(r.root.findAllByType(Svg)).toHaveLength(0);
    expect(r.root.findAllByType(Image)).toHaveLength(1);
  });
  it("is the 200 dp box at the band's right edge, 6 above its top, and takes no touches", () => {
    const box = make(<HallLetter letter="F" />).root.findAll((n) => n.props.pointerEvents === "none")[0];
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ position: "absolute", right: 0, top: -6, width: 200, height: 200 });
  });
  it("has its own image for each hall", () => {
    const src = (l: string) => make(<HallLetter letter={l as "W"} />).root.findByType(Image).props.source;
    expect(new Set(["W", "F", "H", "B"].map(src)).size).toBe(4);
  });
  it.each(["W", "F", "H", "B"])("%s is pre-rendered at 1x, 2x and 3x of the 200 dp box (scripts/bakeoff-letters.js)", (l) => {
    for (const [suffix, k] of [["", 1], ["@2x", 2], ["@3x", 3]] as const) {
      const png = readFileSync(join(__dirname, `../../../assets/bakeoff/letters/${l}${suffix}.png`));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([200 * k, 200 * k]);
    }
  });
});
