// withTiming is spied at module scope, before any render, for the same reason as
// PlateSheet.closeContent.test.tsx / sheetAnimation.test.tsx: the shipped reanimated mock fires
// every withTiming callback synchronously with finished:true, which would make a close
// indistinguishable from "the sheet vanished the instant `visible` flipped".
import * as Reanimated from "react-native-reanimated";

const withTimingCalls: { toValue: number; config?: { duration?: number; easing?: unknown }; callback?: (finished?: boolean) => void }[] = [];
jest.spyOn(Reanimated, "withTiming").mockImplementation(((toValue: number, config?: { duration?: number; easing?: unknown }, callback?: (finished?: boolean) => void) => {
  withTimingCalls.push({ toValue, config, callback });
  return toValue as unknown as ReturnType<typeof Reanimated.withTiming>;
}) as typeof Reanimated.withTiming);

/* eslint-disable import/first -- withTiming must be spied before these imports load */
import fs from "node:fs";
import path from "node:path";
import renderer, { act } from "react-test-renderer";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType, GestureUpdateEvent } from "react-native-gesture-handler";
import { CompareSheet } from "./CompareSheet";
import { artboardPanelGap, artboardEnclosingStyle, artboardStyle, artboardTag, normalizeColor } from "../lib/artboard";
import { durations, reanimatedPaneCurve } from "../lib/motion";
import { SHEET_DISMISS_PX } from "../lib/sheetAnimation";
import { fonts, spacing } from "../lib/theme";
/* eslint-enable import/first */

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const FILE = "CompareSheet.dc.html";
// Hampshire = tid 3, Berkshire = tid 4 (CLAUDE.md's data-sources table).
const toast = { dishName: "French Toast", hallTid: 3, calories: 320 };
const waffle = { dishName: "Belgian Waffle", hallTid: 4, calories: 410 };

type Props = React.ComponentProps<typeof CompareSheet>;
function props(over: Partial<Props> = {}): Props {
  return { visible: true, pair: [toast, waffle], progress: { n: 1, of: 5 }, onPick: jest.fn(), onSkip: jest.fn(), onClose: jest.fn(), ...over };
}
function render(over: Partial<Props> = {}) {
  const p = props(over);
  let root!: renderer.ReactTestRenderer;
  act(() => {
    root = renderer.create(<CompareSheet {...p} />);
  });
  return { root, p };
}

const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;
const c = (v: unknown) => normalizeColor(String(v));
const textNode = (r: renderer.ReactTestRenderer, children: string) => r.root.findAllByType(Text).find((n) => n.props.children === children)!;
const textStyle = (r: renderer.ReactTestRenderer, children: string) => flat(textNode(r, children).props.style);
// the pressable ancestor of a label -- host Pressable node carrying onPress
const pressableOf = (r: renderer.ReactTestRenderer, children: string) => {
  let n = textNode(r, children).parent;
  while (n && typeof n.props.onPress !== "function") n = n.parent;
  return n!;
};
const familyFor = (weight: unknown) => ({ "400": fonts.body400, "500": fonts.body500, "600": fonts.body600 })[String(weight)];
const panel = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => n.type === View && n.props.testID === "compareSheetPanel")[0];
const withoutCalls = () => {
  withTimingCalls.length = 0;
};
afterEach(withoutCalls);

describe("CompareSheet content (CompareSheet.dc.html)", () => {
  it("shows the title, both dishes as 'Hall · N cal', the 'or' divider and Skip", () => {
    const { root } = render();
    const all = root.root.findAllByType(Text).map((n) => n.props.children);
    expect(all).toEqual(["Which did you like more?", "1 of 5", "French Toast", "Hampshire · 320 cal", "or", "Belgian Waffle", "Berkshire · 410 cal", "Skip"]);
  });

  it("renders nothing without a pair", () => {
    const { root } = render({ pair: null });
    expect(root.root.findAllByType(Text)).toHaveLength(0);
  });
});

describe("CompareSheet artboard parity", () => {
  it("panel: fill, top radius, padding and the panel's row gap", () => {
    const { root } = render();
    const tag = artboardTag(FILE, "border-radius: 12px 12px 0 0");
    const spec = tag.style;
    const radius = Number(/border-radius:\s*(\d+)px/.exec(tag.attrs.style)![1]); // the shorthand is top-only, which artboardStyle cannot map
    const s = flat(panel(root).props.style);
    expect(c(s.backgroundColor)).toBe(spec.backgroundColor);
    expect(s.borderTopLeftRadius).toBe(radius);
    expect(s.borderTopRightRadius).toBe(radius);
    expect(s.paddingTop).toBe(spec.paddingTop);
    expect(s.paddingHorizontal).toBe(spec.paddingRight);
    expect(spec.paddingLeft).toBe(spec.paddingRight);
    expect(s.paddingBottom).toBe(spec.paddingBottom); // insets.bottom is 0 under the mock
    expect(s.gap).toBe(artboardPanelGap(FILE));
    // box-shadow: 0 -8px 24px rgba(36,26,20,0.25) -- shadow has no artboardStyle mapping
    expect(s.shadowRadius).toBe(24);
    expect(s.shadowOpacity).toBe(0.25);
    expect((s.shadowOffset as { height: number }).height).toBe(-8);
  });

  it("scrim is the artboard's 50% ink overlay", () => {
    const { root } = render();
    const spec = artboardTag(FILE, "background: rgba(36,26,20,0.5)").style;
    const scrim = root.root.findByProps({ accessibilityLabel: "Close" });
    expect(c(flat(scrim.props.style).backgroundColor)).toBe(spec.backgroundColor);
  });

  it("drag handle is the artboard's pill", () => {
    const { root } = render();
    const spec = artboardTag(FILE, "width: 40px; height: 4px").style;
    const handle = root.root.findAll((n) => n.type === View && n.props.testID === "compareHandle")[0];
    const s = flat(handle.props.style);
    expect(s.width).toBe(spec.width);
    expect(s.height).toBe(spec.height);
    expect(c(s.backgroundColor)).toBe(spec.backgroundColor);
    expect(s.borderRadius).toBeGreaterThanOrEqual(2);
  });

  it("title type", () => {
    const { root } = render();
    const spec = artboardStyle(FILE, "Which did you like more?");
    const s = textStyle(root, "Which did you like more?");
    expect(s.fontSize).toBe(spec.fontSize);
    expect(s.letterSpacing).toBe(spec.letterSpacing);
    expect(s.textTransform).toBe(spec.textTransform);
    expect(c(s.color)).toBe(spec.color);
    expect(s.fontFamily).toBe(fonts.display700); // font-weight 700 on Oswald
  });

  it("count: '1 of 5', 12px 55% ink on the right of a baseline title row (PlateExpanded's title-row idiom)", () => {
    const { root } = render();
    const spec = artboardStyle(FILE, "1 of 5");
    const s = textStyle(root, "1 of 5");
    expect(spec.fontSize).toBe(12);
    expect(s.fontSize).toBe(spec.fontSize);
    expect(c(s.color)).toBe(spec.color);
    expect(c(s.color)).toBe("rgba(36,26,20,0.55)");
    expect(s.fontFamily).toBe(familyFor(spec.fontWeight ?? 400)); // no font-weight on the artboard div: body 400
    // the row the title and the count share
    const row = artboardEnclosingStyle(FILE, "1 of 5", 1);
    expect(artboardEnclosingStyle(FILE, "Which did you like more?", 1)).toEqual(row); // same row
    // flex-direction / justify-content have no artboardStyle mapping: read the row's raw declaration (display: flex = a row)
    const raw = artboardTag(FILE, "display: flex; align-items: baseline").attrs.style;
    expect(raw).toMatch(/justify-content:\s*space-between/);
    const rn = flat(textNode(root, "1 of 5").parent!.props.style);
    expect(textNode(root, "Which did you like more?").parent).toBe(textNode(root, "1 of 5").parent);
    expect(rn.flexDirection).toBe("row");
    expect(rn.alignItems).toBe(row.alignItems);
    expect(rn.alignItems).toBe("baseline");
    expect(rn.justifyContent).toBe("space-between");
  });

  it("the count text is the progress prop, 'n of of'", () => {
    const { root } = render({ progress: { n: 4, of: 5 } });
    expect(textNode(root, "4 of 5")).toBeTruthy();
    const other = render({ progress: { n: 3, of: 7 } });
    expect(textNode(other.root, "3 of 7")).toBeTruthy();
  });

  it("each card: fill, hairline border, radius, padding, min-height", () => {
    const { root } = render();
    const spec = artboardEnclosingStyle(FILE, "Hampshire · 320 cal", 1);
    const spec2 = artboardEnclosingStyle(FILE, "Berkshire · 410 cal", 1);
    expect(spec2).toEqual(spec); // the two cards share one spec
    for (const sub of ["Hampshire · 320 cal", "Berkshire · 410 cal"]) {
      const card = flat(pressableOf(root, sub).props.style);
      expect(c(card.backgroundColor)).toBe(spec.backgroundColor);
      expect(card.borderWidth).toBe(1);
      expect(card.borderRadius).toBe(spec.borderRadius);
      expect(card.paddingVertical).toBe(spec.paddingVertical);
      expect(card.paddingHorizontal).toBe(spec.paddingHorizontal);
      expect(card.gap).toBe(spec.gap);
      expect(card.minHeight).toBe(68); // artboardStyle has no min-height mapping
      expect(card.justifyContent).toBe("center");
    }
    // border colour lives in the shorthand `border: 1px solid rgba(...)`, which artboardStyle drops
    const raw = fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "design", FILE), "utf8");
    expect(raw).toContain("border: 1px solid rgba(36,26,20,0.12)");
    expect(c(flat(pressableOf(root, "Hampshire · 320 cal").props.style).borderColor)).toBe("rgba(36,26,20,0.12)");
  });

  it("card name and sub-line type", () => {
    const { root } = render();
    // "Belgian Waffle" is unique to the sheet; "French Toast" also appears in the menu behind the scrim.
    const name = artboardStyle(FILE, "Belgian Waffle");
    const sub = artboardStyle(FILE, "Berkshire · 410 cal");
    expect(name.fontSize).toBe(15);
    expect(textStyle(root, "Belgian Waffle").fontSize).toBe(name.fontSize);
    expect(textStyle(root, "French Toast").fontSize).toBe(name.fontSize);
    expect(textStyle(root, "Belgian Waffle").fontFamily).toBe(familyFor(name.fontWeight));
    expect(textStyle(root, "Berkshire · 410 cal").fontSize).toBe(sub.fontSize);
    expect(c(textStyle(root, "Berkshire · 410 cal").color)).toBe(sub.color);
    expect(c(textStyle(root, "Hampshire · 320 cal").color)).toBe(sub.color);
  });

  it("'or' divider: rule colour and label type", () => {
    const { root } = render();
    const rule = artboardTag(FILE, "height: 1px; flex-grow: 1").style;
    const or = artboardTag(FILE, "font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: rgba(36,26,20,0.55)").style;
    const label = textStyle(root, "or");
    expect(label.fontSize).toBe(or.fontSize);
    expect(label.letterSpacing).toBe(or.letterSpacing);
    expect(label.textTransform).toBe(or.textTransform);
    expect(c(label.color)).toBe(or.color);
    const rules = root.root.findAll((n) => n.type === View && n.props.testID === "compareRule");
    expect(rules).toHaveLength(2);
    for (const r of rules) {
      expect(c(flat(r.props.style).backgroundColor)).toBe(rule.backgroundColor);
      expect(flat(r.props.style).height).toBe(rule.height);
    }
    // the divider row's own gap (label to rule)
    expect(flat(textNode(root, "or").parent!.props.style).gap).toBe(artboardEnclosingStyle(FILE, ">or<", 1).gap);
  });

  it("Skip: 44 high, 11/600 uppercase maroon", () => {
    const { root } = render();
    const spec = artboardStyle(FILE, "Skip");
    const s = textStyle(root, "Skip");
    expect(s.fontSize).toBe(spec.fontSize);
    expect(s.letterSpacing).toBe(spec.letterSpacing);
    expect(s.textTransform).toBe(spec.textTransform);
    expect(c(s.color)).toBe(spec.color);
    expect(s.fontFamily).toBe(familyFor(spec.fontWeight));
    expect(flat(pressableOf(root, "Skip").props.style).height).toBe(spec.height);
  });

  it("the cards column gap (card to divider to card) matches the artboard", () => {
    const { root } = render();
    const column = pressableOf(root, "Hampshire · 320 cal").parent!;
    expect(flat(column.props.style).gap).toBe(artboardEnclosingStyle(FILE, "Hampshire · 320 cal", 2).gap);
    expect(spacing(2)).toBe(8);
  });
});

describe("CompareSheet actions", () => {
  it("tapping a card picks it over the other one, in both directions", () => {
    const first = render();
    act(() => pressableOf(first.root, "Hampshire · 320 cal").props.onPress());
    expect(first.p.onPick).toHaveBeenCalledWith(toast, waffle);

    const second = render();
    act(() => pressableOf(second.root, "Berkshire · 410 cal").props.onPress());
    expect(second.p.onPick).toHaveBeenCalledWith(waffle, toast);
    expect(second.p.onPick).toHaveBeenCalledTimes(1);
  });

  it("Skip only skips: it records nothing and does not close", () => {
    const { root, p } = render();
    act(() => pressableOf(root, "Skip").props.onPress());
    expect(p.onSkip).toHaveBeenCalledTimes(1);
    expect(p.onPick).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it("a backdrop tap closes", () => {
    const { root, p } = render();
    act(() => root.root.findByProps({ accessibilityLabel: "Close" }).props.onPress());
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onPick).not.toHaveBeenCalled();
  });

  it("a card tap landing while the sheet is closing is dropped (no second pick during the close animation)", () => {
    const first = render();
    const onPick = first.p.onPick as jest.Mock;
    act(() => first.root.update(<CompareSheet {...first.p} visible={false} />));
    // still mounted: the close tween is running and its completion callback hasn't fired
    expect(first.root.root.findAllByType(Text).length).toBeGreaterThan(0);
    act(() => pressableOf(first.root, "Hampshire · 320 cal").props.onPress());
    act(() => pressableOf(first.root, "Skip").props.onPress());
    expect(onPick).not.toHaveBeenCalled();
    expect(first.p.onSkip).not.toHaveBeenCalled();
  });
});

describe("CompareSheet drag-to-dismiss (same useDraggableSheet handle as PlateSheet)", () => {
  const panEvent = (translationY: number, velocityY = 0) => ({ translationX: 0, translationY, velocityX: 0, velocityY, x: 0, y: 0, absoluteX: 0, absoluteY: 0, numberOfPointers: 1 }) as unknown as GestureUpdateEvent<never>;
  const gestureOf = (r: renderer.ReactTestRenderer) => r.root.findByType(GestureDetector).props.gesture as GestureType;

  it("the pan sits on the handle row, not the cards", () => {
    const { root } = render();
    const handle = root.root.findAll((n) => n.type === View && n.props.testID === "compareHandle")[0];
    expect(root.root.findByType(GestureDetector).findAll((n) => n === handle)).toHaveLength(1);
  });

  it("a drag past the dismiss distance closes; a short slow drag snaps back", () => {
    const far = render();
    act(() => {
      gestureOf(far.root).handlers.onStart?.(panEvent(0));
      gestureOf(far.root).handlers.onUpdate?.(panEvent(SHEET_DISMISS_PX + 20));
      gestureOf(far.root).handlers.onEnd?.(panEvent(SHEET_DISMISS_PX + 20), true);
    });
    expect(far.p.onClose).toHaveBeenCalledTimes(1);

    const near = render();
    act(() => {
      gestureOf(near.root).handlers.onStart?.(panEvent(0));
      gestureOf(near.root).handlers.onUpdate?.(panEvent(20));
      gestureOf(near.root).handlers.onEnd?.(panEvent(20, 0), true);
    });
    expect(near.p.onClose).not.toHaveBeenCalled();
  });
});

describe("CompareSheet close animation", () => {
  it("slides out on durations.sheet / reanimatedPaneCurve and keeps its content mounted until the tween finishes", () => {
    const { root, p } = render();
    withTimingCalls.length = 0;
    act(() => root.update(<CompareSheet {...p} visible={false} />));

    const close = withTimingCalls.find((call) => call.toValue === 0);
    expect(close).toBeTruthy();
    expect(close!.config?.duration).toBeLessThanOrEqual(durations.sheet);
    expect(close!.config?.easing).toBe(reanimatedPaneCurve);
    // mid-close: still showing both dishes, not blanked on the same commit
    expect(textNode(root, "French Toast")).toBeTruthy();
    expect(textNode(root, "Belgian Waffle")).toBeTruthy();

    act(() => close!.callback?.(true));
    expect(root.root.findAllByType(Text)).toHaveLength(0);
  });

  it("opens on durations.sheet / reanimatedPaneCurve", () => {
    withTimingCalls.length = 0;
    render();
    const open = withTimingCalls.find((call) => call.toValue === 1);
    expect(open?.config?.duration).toBe(durations.sheet);
    expect(open?.config?.easing).toBe(reanimatedPaneCurve);
  });

  it("CompareSheet.tsx spells no duration or easing of its own", () => {
    const src = fs.readFileSync(path.join(__dirname, "CompareSheet.tsx"), "utf8");
    expect(src).not.toMatch(/duration|easing|Easing|withTiming|withSpring/);
    expect(src).toMatch(/useDraggableSheet\(/);
  });
});
