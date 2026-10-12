import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { Header, type Labels } from "./Header";

const labels: Labels = { status: "Open until midnight", onStatus: () => {} };
const mount = () => {
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<Header title="Worcester" labels={labels} oldLabels={labels} />); });
  return r;
};
const statusButtons = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type !== "string" && String(n.props.accessibilityLabel ?? "").endsWith("hours and directions") && n.props.hitSlop);

describe("the header's status button (the schedule's door)", () => {
  it("is at least 44 dp to touch: its line and the slop above and below it", () => {
    const b = statusButtons(mount())[0];
    expect(m2.type.status.line + b.props.hitSlop.top + b.props.hitSlop.bottom).toBeGreaterThanOrEqual(m2.size.tap);
  });
  it("gets there by slop alone, so the status line does not move", () => {
    const s = StyleSheet.flatten(statusButtons(mount())[0].props.style);
    expect(s.padding ?? s.paddingVertical ?? s.paddingTop ?? s.margin ?? s.marginTop ?? 0).toBe(0);
  });
});
