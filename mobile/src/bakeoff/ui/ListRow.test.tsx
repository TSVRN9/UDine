import { act } from "react";
import { StyleSheet, View } from "react-native";
import renderer from "react-test-renderer";
import { ListRow } from "./ListRow";

const make = (name: string) => <ListRow name={name} marks={<View testID="badge" />} />;
const badgeBox = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "badge").map((n) => { let p = n.parent!; while (typeof p.type !== "string") p = p.parent!; return StyleSheet.flatten(p.props.style) as { left: number }; });
const layOut = (r: renderer.ReactTestRenderer, width: number) => {
  const t = r.root.findAll((n) => n.props.onTextLayout)[0];
  act(() => { t.props.onTextLayout({ nativeEvent: { lines: [{ x: 0, y: 0, width }] } }); });
};

// FlashList recycles a row: the same component is handed another dish. The badge sits where its own name ends, and not before that is measured
describe("a recycled row", () => {
  it("does not draw the previous dish's badge position under the new name", () => {
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(make("Rigatoni Pasta Bake")); });
    layOut(r, 180);
    expect(badgeBox(r)).toHaveLength(1);
    act(() => { r.update(make("Roasted Cauliflower With Tahini")); });
    expect(badgeBox(r)).toHaveLength(0);
    layOut(r, 240);
    expect(badgeBox(r)).toHaveLength(1);
    expect(badgeBox(r)[0].left).toBeGreaterThan(200);
  });
});
