import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import Svg from "react-native-svg";
import { m2 } from "../../lib/theme";
import { Board, lampRects } from "./Busy";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

// M2 `histSVG`, a 350 x 30 box: n columns 3 apart, five lamps up each, 2 between lamps, drawn as plain Views (an Svg is rasterised in software on every draw)
describe("the busy board's lamps", () => {
  it("sit where the SVG's rects sat (4 columns)", () => {
    const r = lampRects(4);
    expect(r).toHaveLength(20);
    const at = (i: number, k: number) => r.find((x) => x.i === i && x.k === k)!;
    expect(at(0, 0)).toMatchObject({ x: 0, y: 25.6, w: 85.25, h: 4.4 });
    expect(at(1, 0).x).toBeCloseTo(88.25);
    expect(at(3, 4)).toMatchObject({ y: 0 });
    expect(at(3, 4).x).toBeCloseTo(264.75);
    expect(at(2, 2).y).toBeCloseTo(30 - 3 * 4.4 - 2 * 2);
  });
  it("end on the box's right edge: the last column's right is 350", () => {
    const last = lampRects(12).find((x) => x.i === 11 && x.k === 0)!;
    expect(last.x + last.w).toBeCloseTo(350);
  });
});

describe("the busy board", () => {
  const cols = [{ lit: 2, now: false }, { lit: 5, now: true }, { lit: 0, now: false }];
  it("is Views: no Svg", () => expect(make(<Board columns={cols} />).root.findAllByType(Svg)).toHaveLength(0));
  it("is five lamps a column, lit ones at M2's tones (the current hour gold), unlit ones dim", () => {
    const r = make(<Board columns={cols} />);
    const lamps = r.root.findAll((n) => typeof n.type === "string" && flat(n).position === "absolute" && flat(n).backgroundColor !== undefined);
    expect(lamps).toHaveLength(15);
    const colors = lamps.map((n) => flat(n).backgroundColor);
    expect(colors.filter((c) => c === m2.color.boardOn)).toHaveLength(2);
    expect(colors.filter((c) => c === m2.color.gold)).toHaveLength(5);
    expect(colors.filter((c) => c === m2.color.boardOff)).toHaveLength(3 + 0 + 5);
  });
  it("lays a lamp out in percent of the box's width, so it stretches with the screen as the SVG did", () => {
    const r = make(<Board columns={[{ lit: 1, now: false }]} />);
    const first = r.root.findAll((n) => typeof n.type === "string" && flat(n).position === "absolute" && flat(n).backgroundColor !== undefined)[0];
    expect(flat(first)).toMatchObject({ left: "0%", width: "100%" });
  });
});
