import { act } from "react";
import renderer from "react-test-renderer";
import { HallHeader } from "./HallHeader";
import { HallMenu } from "./HallMenu";
import { HoursSheet } from "./HoursSheet";
import { StationSwitcher } from "./StationSwitcher";
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
  return { BottomSheetModal: R.forwardRef(() => null), BottomSheetScrollView: () => null, BottomSheetBackdrop: () => null, BottomSheetModalProvider: ({ children }: any) => children, BottomSheetView: () => null, useBottomSheetTimingConfigs: () => ({}), useBottomSheetSpringConfigs: (c: unknown) => c };
});
// the jest build of Reanimated hands back an object for an animated ref, where the device's is a function ref
jest.mock("react-native-reanimated", () => ({ ...jest.requireActual("react-native-reanimated"), useAnimatedRef: () => () => {} }));
jest.mock("@shopify/flash-list", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return {
    FlashList: R.forwardRef(function FL(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({ computeVisibleIndices: () => ({ startIndex: 0, endIndex: 1 }), getLayout: () => ({ y: 0 }), getFirstItemOffset: () => 0, scrollToOffset: () => {} }));
      R.useEffect(() => { props.onViewableItemsChanged?.({}); });
      return <V>{props.ListHeaderComponent}{props.data.map((d: any, i: number) => <V key={i}>{props.renderItem({ item: d, index: i })}</V>)}</V>;
    }),
  };
});

const flush = async (ms = 60) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
beforeEach(() => { jest.useFakeTimers(); (global as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 8); (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id); });
const live: renderer.ReactTestRenderer[] = [];
afterEach(() => { act(() => live.splice(0).forEach((r) => r.unmount())); jest.useRealTimers(); });

async function mount(mode: NetMode, place: PlaceKey = "W", day = 0, onEvent?: (i: number) => void, phase = "open") {
  act(() => startNet(mode));
  const t = { style: new Proxy({}, { get: () => ({}) }), phase, rect: { current: null }, dragBack: {}, ready: () => {}, open: () => {}, close: () => {}, progress: { get: () => 1 } } as never;
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
    const box = b.findAll((x) => x.props.style && flat(x.props.style).minHeight === 18.2 && flat(x.props.style).marginTop === 7);
    expect(box.length).toBeGreaterThan(0);
    expect(b.findAll((x) => (x.type as unknown) === "Text" && x.props.children === "Busy").length).toBeGreaterThan(0);
  });
  it("slow: nothing to list and no status until it arrives, then the labels and the list are there", async () => {
    const r = await mount("slow");
    expect(texts(r)).not.toContain("Lunch");
    expect(texts(r).join(" ")).not.toMatch(/Open until/);
    expect(texts(r)).toContain("Today");
    await flush(1600);
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

describe("a menu arriving from the network (M2 arrive())", () => {
  const entering = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && n.props.entering != null);
  const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  it("Try again: the failure text and the button are gone in the commit that brings the rows, and the rows fade in over chalk", async () => {
    const r = await mount("fail");
    const chalk = () => r.root.findAll((n) => typeof n.type === "string" && n.props.exiting != null).length;
    expect(chalk()).toBe(1);   // the chalk under the failure leaves by fading out
    press(r, "Try again");
    await settle();   // no timer has run: this is the arrival's own commit
    const t = texts(r);
    expect(t).toContain("Lunch");
    expect(t).not.toContain("Worcester's menu didn't load.");
    expect(t).not.toContain("Try again");
    expect(chalk()).toBe(0);
    expect(entering(r).length).toBeGreaterThan(0);   // the tab and station labels fade in
    await flush(400);
    expect(entering(r)).toHaveLength(0);   // and the fade is not left on for later
  });
  it("slow: the spinner is gone in the commit that brings the rows, and the status line comes in with no fade of its own", async () => {
    const r = await mount("slow");
    await act(async () => { jest.advanceTimersByTime(1600); });
    const t = texts(r);
    expect(t).toContain("Lunch");
    expect(r.root.findAll((n) => n.props.accessibilityRole === "progressbar")).toHaveLength(0);
    const status = r.root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === "Open until midnight")[0];
    for (let n: renderer.ReactTestInstance | null = status; n; n = n.parent) expect(n.props.entering).toBeUndefined();
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

// The list, and the two sheets, mount when the open has settled: mounting ~30 rows inside the 500 ms put a UI-thread commit under the animation
// M2 fades the destination's content, list included, in over the last 70% of the open, already in its final layout: a static slice of the rows that
// fit the screen is mounted with the overlay (no FlashList, no virtualisation), and the lazy list takes over once the open has settled.
describe("a hall's list while the container opens", () => {
  const rows = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && typeof n.props.accessibilityLabel === "string" && n.props.accessibilityLabel.startsWith("Add ")).length;
  const flashLists = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => n.props.ListHeaderComponent !== undefined).length;
  it("has its first rows in it while it opens: a slice that fits the screen, not the list", async () => {
    const r = await mount("ok", "W", 0, undefined, "opening");
    expect(texts(r)).toContain("Worcester");
    expect(rows(r)).toBeGreaterThan(0);
    expect(rows(r)).toBeLessThanOrEqual(Math.ceil((800 - (24 + 282 + 48 + 48)) / 64));
    expect(flashLists(r)).toBe(0);
  });
  it("hands over to the full list once the open has settled, and the slice is gone (no row twice)", async () => {
    const r = await mount("ok", "W", 0, undefined, "opening");
    const slice = rows(r);
    const t = r.root.findByType(HallMenu).props.t;
    t.phase = "open";
    act(() => { r.update(<HallMenu t={t} H={800} place="W" name="Worcester" scrollY={{ get: () => 0, set: () => {} } as never} ghost={null} onBack={() => {}} />); });
    await flush();
    expect(flashLists(r)).toBe(1);
    expect(rows(r)).toBeGreaterThan(slice);
    const open = await mount("ok", "W", 0, undefined, "open");
    expect(rows(r)).toBe(rows(open));
  });
  it("is mounted straight away when the hall is already open", async () => {
    const r = await mount("ok", "W", 0, undefined, "open");
    expect(rows(r)).toBeGreaterThan(0);
    expect(flashLists(r)).toBe(1);
  });
  it("and stays mounted while it closes", async () => {
    const r = await mount("ok", "W", 0, undefined, "open");
    const t = r.root.findByType(HallMenu).props.t;
    t.phase = "closing";
    act(() => { r.update(<HallMenu t={t} H={800} place="W" name="Worcester" scrollY={{ get: () => 0, set: () => {} } as never} ghost={null} onBack={() => {}} />); });
    expect(rows(r)).toBeGreaterThan(0);
  });
});

// the two sheets are not needed until a tap: they mount after the list has, in a commit of their own (A53 profile: list and sheets in one 390 ms task)
describe("a hall that opens from a band", () => {
  it("mounts its sheets after its list, not in the commit that mounts the list", async () => {
    act(() => startNet("ok"));
    const el = (phase: string) => {
      const t = { style: new Proxy({}, { get: () => ({}) }), phase, rect: { current: null }, dragBack: {}, ready: () => {}, open: () => {}, close: () => {}, progress: { get: () => 1 } } as never;
      return <HallMenu t={t} H={800} place="W" name="Worcester" scrollY={{ get: () => 0, set: () => {} } as never} ghost={null} onBack={() => {}} />;
    };
    let r!: renderer.ReactTestRenderer;
    act(() => { r = renderer.create(el("opening")); });
    live.push(r);
    expect(r.root.findAllByType(HoursSheet)).toHaveLength(0);
    act(() => { r.update(el("open")); });
    expect(texts(r)).toContain("Lunch");
    expect(r.root.findAllByType(HoursSheet)).toHaveLength(0);
    expect(r.root.findAllByType(StationSwitcher)).toHaveLength(0);
    await flush(60);
    expect(r.root.findAllByType(HoursSheet)).toHaveLength(1);
    expect(r.root.findAllByType(StationSwitcher)).toHaveLength(1);
  });
});
