import { act } from "react";
import { StyleSheet } from "react-native";
import renderer from "react-test-renderer";
import { m2 } from "../../lib/theme";
import { loadFixture } from "../logic/fixture";
import { EventPage } from "./EventPage";

jest.mock("../ui/motion", () => ({
  timed: (to: number) => to,
  part: (t: { d: number; e: unknown }, k: number) => ({ d: t.d * k, e: t.e }),
  useMotion: () => ({ reduced: false }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

// M2 `.pstat b{font:600 26px Oswald}` sets no line-height, so the date sits on Oswald's normal line (38.5), not the bar number's 26
describe("the event page's date", () => {
  it("is on the normal line of its 26 px face", () => {
    const i = loadFixture().events.findIndex((e) => e.links.length);
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<EventPage i={i} progress={{ get: () => 0, set: () => {} } as never} onPop={() => {}} />); });
    const date = r.root.findAll((n) => typeof n.type === "string" && n.props.style && StyleSheet.flatten(n.props.style).paddingTop === m2.space.eventDate)[0];
    expect(StyleSheet.flatten(date.props.style).lineHeight).toBe(m2.type.pstat.line);
    expect(m2.type.pstat.line).toBeGreaterThan(m2.type.barNum.line);
  });
});
