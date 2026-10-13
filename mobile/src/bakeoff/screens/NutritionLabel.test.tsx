import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { NutritionLabel } from "./NutritionLabel";

const label = { serving: "1 slice", cal: "300", rows: [{ kind: "row", left: "", name: "Total Fat", value: "8g", right: "10%" }] } as never;

// M2 `.label .lr` and `.ls` set no line-height: their 15 px is on the font's own line (18.2), not `.dal`'s 1.4
describe("the label's rows", () => {
  it("say their names on the font's normal line", () => {
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<NutritionLabel label={label} />); });
    const t = (name: string) => StyleSheet.flatten(r.root.findAll((n) => (n.type as unknown) === "Text" && [n.props.children].flat().join("") === name)[0].props.style) as Record<string, unknown>;
    expect(t("Serving size")).toMatchObject({ fontSize: 15, lineHeight: 18.2 });
    expect(t("Total Fat")).toMatchObject({ fontSize: 15, lineHeight: 18.2 });
  });
});
