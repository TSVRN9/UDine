import { processColor } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ScoreBadge } from "./ScoreBadge";
import { m2 } from "../../lib/theme";

function mount(el: React.ReactElement) {
  let v!: renderer.ReactTestRenderer;
  act(() => { v = renderer.create(el); });
  return v;
}
const labelled = (v: renderer.ReactTestRenderer, label: string) =>
  v.root.findAll((n) => typeof n.type === "string" && n.props.accessibilityLabel === label);

describe("ScoreBadge", () => {
  it("renders nothing for an unscored dish", () => {
    expect(mount(<ScoreBadge kind="health" value={null} size="row" />).toJSON()).toBeNull();
    expect(mount(<ScoreBadge kind="carbon" value={null} size="row" />).toJSON()).toBeNull();
  });
  it("labels healthfulness, with 0 a real score", () => {
    expect(labelled(mount(<ScoreBadge kind="health" value={5} size="row" />), "Healthfulness 5 of 7")).not.toHaveLength(0);
    expect(labelled(mount(<ScoreBadge kind="health" value={0} size="row" />), "Healthfulness 0 of 7")).not.toHaveLength(0);
  });
  it("labels the carbon letter", () => {
    expect(labelled(mount(<ScoreBadge kind="carbon" value="A" size="row" />), "Carbon rating A")).not.toHaveLength(0);
  });
  it("draws the tile in M2's ramp colour", () => {
    expect(JSON.stringify(mount(<ScoreBadge kind="carbon" value="B" size="row" />).toJSON())).toContain(`"fill":{"type":0,"payload":${String(processColor(m2.color.carbon.B[0]))}}`);
  });
});
