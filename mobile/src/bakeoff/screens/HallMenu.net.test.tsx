import { act } from "react";
import renderer from "react-test-renderer";
import { HallHeader } from "./HallHeader";
import { HallMenu } from "./HallMenu";
import { getNet, startNet } from "../state/net";
import { loadFixture } from "../logic/fixture";
import type { PlaceKey } from "../logic/types";
import type { NetMode } from "../logic/net";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Rigid: "rigid" }, NotificationFeedbackType: { Success: "success" },
}));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({}), useGlobalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  return { BottomSheetModal: R.forwardRef(() => null), BottomSheetScrollView: () => null, BottomSheetBackdrop: () => null, BottomSheetModalProvider: ({ children }: any) => children, BottomSheetView: () => null, useBottomSheetSpringConfigs: (c: unknown) => c };
});
// the jest build of Reanimated hands back an object for an animated ref, where the device's is a function ref
jest.mock("react-native-reanimated", () => ({ ...jest.requireActual("react-native-reanimated"), useAnimatedRef: () => () => {} }));
jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return {
    FlashList: R.forwardRef(function FL(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({ computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {} }));
      return <V>{props.ListHeaderComponent}{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
    }),
  };
});

const flush = async (ms = 60) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
beforeEach(() => { jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
const live: renderer.ReactTestRenderer[] = [];
afterEach(() => { act(() => live.splice(0).forEach((r) => r.unmount())); jest.useRealTimers(); });

async function mount(mode: NetMode, place: PlaceKey = "W", day = 0, onEvent?: (i: number) => void) {
  act(() => startNet(mode));
  const t = { style: new Proxy({}, { get: () => ({}) }), phase: "open", rect: { current: null }, dragBack: {}, ready: () => {}, open: () => {}, close: () => {}, progress: { get: () => 1 } } as never;
  const at = day ? { place, day, meal: "lunch", dish: "none" } as never : undefined;
  const name = loadFixture().places.find((p) => p.key === place)!.name;
  let r!: renderer.ReactTestRenderer;
  act(() => { r = renderer.create(<HallMenu t={t} H={800} place={place} name={name} scrollY={{ get: () => 0, set: () => {} } as never} ghost={null} onBack={() => {}} at={at} onEvent={onEvent} />); });
  live.push(r);
  await flush();
  return r;
}
const texts = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => [n.props.children].flat().join(""));
const press = (r: renderer.ReactTestRenderer, label: string) => {
  const words = (n: renderer.ReactTestInstance) => n.findAll((x) => (x.type as unknown) === "Text").map((x) => [x.props.children].flat().join("")).join(" ");
  const n = r.root.findAll((x) => typeof x.type !== "string" && typeof x.props.onPress === "function" && words(x) === label)[0];
  act(() => { n.props.onPress(); });
};
// what sets the name's y: the block it hangs from (anchored by its bottom) and everything under the name in it
const nameBlock = (r: renderer.ReactTestRenderer) => {
  let n = r.root.findAll((x) => (x.type as unknown) === "Text" && x.props.children === "Worcester" && x.props.accessibilityRole === "header")[0];
  while (!(n.props.style && n.props.style.bottom === 50)) n = n.parent!;
  return n;
};
const flat = (s: unknown): Record<string, unknown> => Object.assign({}, ...[s].flat(9).filter(Boolean));

describe("a hall in each network state", () => {
  it.each(["ok", "slow", "offline", "fail"] as const)("%s: the name hangs from the same block, with the status's room and the busy row's room under it", async (mode) => {
    const r = await mount(mode);
    const b = nameBlock(r);
    expect(flat(b.props.style)).toEqual({ position: "absolute", left: 20, bottom: 50 });
    // the status line's box has its height whether or not it has a line, and a busy row is under it in every state (hidden when not live)
    const box = b.findAll((x) => x.props.style && flat(x.props.style).minHeight === 20 && flat(x.props.style).marginTop === 7);
    expect(box.length).toBeGreaterThan(0);
    expect(b.findAll((x) => (x.type as unknown) === "Text" && x.props.children === "Busy").length).toBeGreaterThan(0);
  });
  it("slow: nothing to list and no status until it arrives, then the labels and the list are there", async () => {
    const r = await mount("slow");
    expect(texts(r)).not.toContain("Lunch");
    expect(texts(r).join(" ")).not.toMatch(/Open until/);
    expect(texts(r)).toContain("Today");
    await flush(1500);
    expect(texts(r)).toContain("Lunch");
    expect(texts(r).join(" ")).toMatch(/Open until/);
  });
  it("offline: today is as online minus the live layer, and an unsaved day says so", async () => {
    const r = await mount("offline");
    expect(texts(r)).toContain("Lunch");
    const day = await mount("offline", "W", 5);
    expect(texts(day)).toContain("You're offline, and the menu for Tuesday, October 13 isn't saved on this phone.");
    expect(texts(day)).toContain("Tue 13");
  });
  it("fail: the menu didn't load, with Try again, and Try again re-fetches and lands on the menu", async () => {
    const r = await mount("fail");
    expect(texts(r)).toContain("Worcester's menu didn't load.");
    expect(texts(r)).not.toContain("Lunch");
    press(r, "Try again");
    await flush();
    expect(texts(r)).toContain("Lunch");
    expect(texts(r)).not.toContain("Worcester's menu didn't load.");
    expect(getNet().mode).toBe("ok");
  });
});

describe("the holiday note", () => {
  it("leads its own day's list, with no date tag, and opens its event", async () => {
    const open = jest.fn();
    const r = await mount("ok", "W", 4, open);
    const t = texts(r);
    expect(t.filter((x) => x === "Indigenous Peoples Day")).toHaveLength(1);
    expect(t.join(" ")).not.toMatch(/Mon, Oct 12/);
    press(r, "Indigenous Peoples Day");
    expect(open).toHaveBeenCalledWith(0);
  });
  it("is not on another day's list", async () => {
    expect(texts(await mount("ok", "W", 3))).not.toContain("Indigenous Peoples Day");
    expect(texts(await mount("ok", "W", 0))).not.toContain("Indigenous Peoples Day");
  });
});

describe("a café that lists no dishes", () => {
  it("keeps its description and says it doesn't list its menu, with no pinned rows", async () => {
    const r = await mount("ok", "c13");
    const t = texts(r).join("|");
    expect(t).toContain("Located in the Integrated Science building");
    expect(t).toContain("ISB Café doesn't list its menu in the app.");
    expect(texts(r)).not.toContain("Today");
    expect(t).not.toMatch(/custom food/i);
  });
});

describe("the band's copy that rides the opening container", () => {
  const count = (phase: string) => {
    act(() => startNet("ok"));
    const t = { style: new Proxy({}, { get: () => ({}) }), phase, rect: { current: { top: 0, height: 112, off: 0 } }, dragBack: {}, ready: () => {}, open: () => {}, close: () => {}, progress: { get: () => 1 } } as never;
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(<HallHeader t={t} H={800} place="W" name="Worcester" scrollY={{ get: () => 0, set: () => {} } as never} onBack={() => {}} pushed />); });
    live.push(r);
    return texts(r).filter((x) => x === "Worcester").length;
  };
  it("is drawn while the screen opens and is gone once it is open (a commit under it brought it back over the title)", () => {
    expect(count("opening")).toBe(2);
    expect(count("open")).toBe(1);
  });
});
