import { StyleSheet, Text, View } from "react-native";
import renderer, { act } from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Badge } from "./Badge";
import { HallChip } from "./HallChip";
import { SheetMark } from "./SheetMark";
import { Felt } from "./Felt";

const make = (el: React.ReactElement) => { let r!: renderer.ReactTestRenderer; act(() => { r = renderer.create(el); }); return r; };
const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;
const views = (r: renderer.ReactTestRenderer) => r.root.findAllByType(View);
const stitchOf = (r: renderer.ReactTestRenderer) => views(r).map(flat).find((s) => s.borderStyle === "dashed")!;
const feltOf = (r: renderer.ReactTestRenderer, ground: string) => views(r).map(flat).find((s) => s.backgroundColor === ground)!;

// what the badge, the hall letter, the dish mark and the event frame each drew by hand before they shared this
describe("Felt draws the same patches the kit drew by hand", () => {
  it("patch: gold, radius 4, a 1 dp maroon stitch 2 in at radius 2", () => {
    const r = make(<Felt kind="patch" style={{ width: 20, height: 20 }}><Text>x</Text></Felt>);
    expect(feltOf(r, m2.color.gold)).toMatchObject({ width: 20, height: 20, borderRadius: 4 });
    expect(stitchOf(r)).toMatchObject({ position: "absolute", top: 2, left: 2, right: 2, bottom: 2, borderRadius: 2, borderWidth: 1, borderColor: m2.color.stitch });
  });
  it("mark: gold, radius 5, the stitch 3 in at radius 3", () => {
    const r = make(<SheetMark kind="halal" />);
    expect(feltOf(r, m2.color.gold)).toMatchObject({ height: 30, borderRadius: 5 });
    expect(stitchOf(r)).toMatchObject({ top: 3, left: 3, right: 3, bottom: 3, borderRadius: 3, borderWidth: 1, borderColor: m2.color.stitch });
  });
  it("frame: maroon, radius 6, 7 of felt, a 1.5 dp gold stitch 2.5 in at radius 3", () => {
    const r = make(<Felt kind="frame"><Text>x</Text></Felt>);
    expect(feltOf(r, m2.color.vm)).toMatchObject({ borderRadius: 6, padding: 7, overflow: "hidden" });
    expect(stitchOf(r)).toMatchObject({ top: 2.5, left: 2.5, right: 2.5, bottom: 2.5, borderRadius: 3, borderWidth: 1.5, borderColor: m2.color.stitchGold });
  });
  it("the diet badge and a hall chip's letter wear the patch", () => {
    expect(feltOf(make(<Badge label="Plant based"><Text>x</Text></Badge>), m2.color.gold)).toMatchObject({ width: 20, height: 20, borderRadius: 4 });
    const chip = make(<HallChip name="Worcester" letter="W" onPress={() => {}} />);
    expect(views(chip).map(flat).filter((s) => s.backgroundColor === m2.color.gold)[0]).toMatchObject({ width: 28, height: 28, borderRadius: 4 });
    expect(stitchOf(chip)).toMatchObject({ top: 2, borderRadius: 2, borderColor: m2.color.stitch });
  });
});
