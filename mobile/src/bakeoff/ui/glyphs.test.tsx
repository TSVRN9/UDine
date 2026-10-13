import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { act } from "react";
import { Image, StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import Svg from "react-native-svg";
import { m2 } from "../../lib/theme";
import { BackButton } from "./BackButton";
import { Badge, DietBadge } from "./Badge";
import { Chevron, RowChevron } from "./Chevron";
import { ScoreBadge } from "./ScoreBadge";
import { SheetMark } from "./SheetMark";
import { Stepper } from "./Stepper";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const images = (r: renderer.ReactTestRenderer) => r.root.findAllByType(Image);
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const png = (n: string) => { const b = readFileSync(join(__dirname, "../../../assets/bakeoff/glyphs", n)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

// Every Svg that mounts is rasterised in software on the UI thread and dispatches a layout event Reanimated tries to apply to a tag that may not be mounted yet
// (20 'synchronouslyUpdateUIProps failed' warnings per hall open on an A53); a row remount mounts several. The kit's row glyphs are pre-rendered images
// (scripts/bakeoff-glyphs.js), at the size and colour the SVGs had.
describe("the kit's drawn glyphs are images, not Svgs", () => {
  it("chevrons: 24 for the back arrow, the row's 18, the status line's 14, tinted", () => {
    const back = make(<BackButton onPress={() => {}} />);
    expect(back.root.findAllByType(Svg)).toHaveLength(0);
    expect(flat(images(back)[0])).toMatchObject({ width: 24, height: 24, tintColor: m2.color.white });
    expect(flat(images(make(<RowChevron />))[0])).toMatchObject({ width: 18, height: 18, tintColor: m2.color.slate });
    expect(flat(images(make(<Chevron dir="down" size={14} stroke={m2.color.onDmQuiet} width={2} />))[0])).toMatchObject({ width: 14, height: 14, tintColor: m2.color.onDmQuiet });
  });
  it("the stepper's - and + are 20 dp, vm", () => {
    const r = make(<Stepper label="1" onDec={() => {}} onInc={() => {}} />);
    expect(r.root.findAllByType(Svg)).toHaveLength(0);
    expect(images(r).map((i) => flat(i))).toEqual([expect.objectContaining({ width: 20, height: 20, tintColor: m2.color.vm }), expect.objectContaining({ width: 20, height: 20, tintColor: m2.color.vm })]);
    expect(new Set(images(r).map((i) => i.props.source)).size).toBe(2);
  });
  it("the diet patch glyph is 12 dp, a sprout for plant based and a leaf for vegetarian", () => {
    const a = make(<DietBadge diet={2} />), b = make(<DietBadge diet={1} />);
    expect(a.root.findAllByType(Svg)).toHaveLength(0);
    expect(flat(images(a)[0])).toMatchObject({ width: 12, height: 12 });
    expect(images(a)[0].props.source).not.toBe(images(b)[0].props.source);
    expect(make(<Badge label="x"><></></Badge>).root.findAllByType(Svg)).toHaveLength(0);
  });
  it("the dish sheet's marks wear a 16 dp glyph, each its own", () => {
    const kinds = ["plant", "veg", "halal", "local", "sus"] as const;
    const srcs = kinds.map((k) => { const r = make(<SheetMark kind={k} />); expect(r.root.findAllByType(Svg)).toHaveLength(0); expect(flat(images(r)[0])).toMatchObject({ width: 16, height: 16 }); return images(r)[0].props.source; });
    expect(new Set(srcs).size).toBe(5);
  });
  it.each([["row", 18, 22.5], ["sheet", 24, 30], ["scale", 26, 32.5]] as const)("the score tile at %s is %s x %s, labelled, and is its own image per rating", (size, w, h) => {
    const r = make(<ScoreBadge kind="health" value={5} size={size} />);
    expect(r.root.findAllByType(Svg)).toHaveLength(0);
    expect(flat(images(r)[0])).toMatchObject({ width: w, height: h });
    expect(images(r)[0].props.accessibilityLabel ?? r.root.findAll((n) => n.props.accessibilityLabel === "Healthfulness 5 of 7").length).toBeTruthy();
    const srcs = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((v) => images(make(<ScoreBadge kind="health" value={v} size={size} />))[0].props.source));
    expect(srcs.size).toBe(8);
    expect(new Set((["A", "B", "C", "D", "E"] as const).map((v) => images(make(<ScoreBadge kind="carbon" value={v} size={size} />))[0].props.source)).size).toBe(5);
  });
});

describe("the pre-rendered glyph files", () => {
  const files = readdirSync(join(__dirname, "../../../assets/bakeoff/glyphs"));
  it("are 96 px: the 24, 18 and 16 boxes, and the 24 x 30 tile at 96 x 120", () => {
    for (const f of files) expect(png(f)).toEqual(f.startsWith("score-") ? [96, 120] : [96, 96]);
  });
  it("cover 8 health scores, 5 carbon letters, 5 marks, the chevrons, + - and the tick", () => {
    expect(files.filter((f) => f.startsWith("score-health-"))).toHaveLength(8);
    expect(files.filter((f) => f.startsWith("score-carbon-"))).toHaveLength(5);
    expect(files.filter((f) => f.startsWith("mark-"))).toHaveLength(5);
    for (const n of ["chevron-back", "chevron-forward", "chevron-down", "chevron-down-thin", "plus", "minus", "tick"]) expect(files).toContain(`${n}.png`);
  });
});
