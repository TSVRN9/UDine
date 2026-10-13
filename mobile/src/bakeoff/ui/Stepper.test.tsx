import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { Stepper } from "./Stepper";
import { tapBox } from "./tap";

const flat = (n: renderer.ReactTestInstance) => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

describe("the 44 dp tap box", () => {
  it("is 44 square with its contents centred", () => expect(tapBox).toEqual({ width: 44, height: 44, alignItems: "center", justifyContent: "center" }));
  it("is what each of the stepper's buttons is", () => {
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<Stepper label="1" onDec={() => {}} onInc={() => {}} />); });
    const buttons = r.root.findAll((n) => typeof n.props.onPressIn === "function");
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(flat(b)).toMatchObject(tapBox);
  });
});
