import renderer, { act } from "react-test-renderer";
import { ScoreBadge } from "./ScoreBadge";

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
  it("is its own image for each rating (the ramp colour is baked in: assets.fresh.test regenerates them from the tokens)", () => {
    const src = (k: "health" | "carbon", v: number | "A" | "B") => JSON.stringify(mount(<ScoreBadge kind={k} value={v} size="row" />).root.findByType(require("react-native").Image).props.source);
    expect(new Set([src("carbon", "A"), src("carbon", "B"), src("health", 0), src("health", 5)]).size).toBe(4);
  });
});
