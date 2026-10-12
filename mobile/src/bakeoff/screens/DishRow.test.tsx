import renderer, { act } from "react-test-renderer";
import { loadFixture } from "../logic/fixture";
import type { Dish } from "../logic/types";
import { DishRow } from "./DishRow";

const fx = loadFixture();
const all = fx.dishes;
const unscored = all.find((d) => d.health == null && d.carbon == null && !(d.diet & 3))!;
const scored = all.find((d) => d.health != null && d.carbon != null && !(d.diet & 3))!;

function mount(d: Dish, scores = { health: false, carbon: false }, contains: string[] = []) {
  let v!: renderer.ReactTestRenderer;
  act(() => { v = renderer.create(<DishRow dish={d} contains={contains} scores={scores} lane={false} />); });
  return v;
}
const labelled = (v: renderer.ReactTestRenderer, re: RegExp) =>
  v.root.findAll((n) => typeof n.type === "string" && typeof n.props.accessibilityLabel === "string" && re.test(n.props.accessibilityLabel));
const texts = (v: renderer.ReactTestRenderer) => JSON.stringify(v.toJSON());

describe("DishRow (Review Focus 5)", () => {
  it("an unscored dish renders the same tree whatever the toggles: no badge, no empty slot, no gap", () => {
    expect(texts(mount(unscored, { health: true, carbon: true }))).toBe(texts(mount(unscored)));
    // no score group at all (it is the only 6 dp gap in a row), not an empty one
    expect(texts(mount(unscored, { health: true, carbon: true }))).not.toContain('"gap":6');
    expect(texts(mount(scored, { health: true, carbon: false }))).toContain('"gap":6');
  });
  it("a dish with a healthfulness number but no H code draws no healthfulness badge and leaves no slot", () => {
    const raw = all.find((d) => d.health == null && d.carbon != null)!;
    const on = mount(raw, { health: true, carbon: false });
    expect(labelled(on, /Healthfulness/)).toHaveLength(0);
    expect(texts(on)).toBe(texts(mount(raw)));
  });
  it("a scored dish draws exactly the badges the toggles allow", () => {
    expect(labelled(mount(scored, { health: true, carbon: false }), /Healthfulness/)).toHaveLength(1);
    expect(labelled(mount(scored, { health: true, carbon: false }), /Carbon/)).toHaveLength(0);
    expect(labelled(mount(scored, { health: false, carbon: true }), /Carbon rating/)).toHaveLength(1);
    expect(labelled(mount(scored, { health: false, carbon: true }), /Healthfulness/)).toHaveLength(0);
    expect(labelled(mount(scored), /Healthfulness|Carbon/)).toHaveLength(0);
  });
  it("a revealed row that lists an avoided allergen leads with Contains, and only then", () => {
    expect(texts(mount(scored, undefined, ["Milk", "Soy"]))).toContain("Contains milk and soy");
    expect(texts(mount(scored))).not.toContain("Contains");
  });
  it("a press hands the row's dish to onOpen", () => {
    const onOpen = jest.fn();
    let v!: renderer.ReactTestRenderer;
    act(() => { v = renderer.create(<DishRow dish={scored} contains={[]} scores={{ health: false, carbon: false }} lane={false} onOpen={onOpen} />); });
    act(() => { v.root.findAll((n) => typeof n.props.onPress === "function")[0].props.onPress(); });
    expect(onOpen).toHaveBeenCalledWith(scored);
  });
});
