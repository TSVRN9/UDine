import { forwardRef, useCallback, useRef, type ReactNode } from "react";
import { ReduceMotion, useSharedValue, type SharedValue } from "react-native-reanimated";
import { View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, useBottomSheetSpringConfigs, useBottomSheetTimingConfigs, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SheetSpring } from "../../lib/motion";
import { useMotion } from "./motion";

/**
 * gorhom pins its scrollables to the top while the sheet is still rising, and resets any scroll that happens then. The schedule
 * opens already scrolled (M2), so the first scroll event, the one our own `scrollTo` makes as the content is measured, is let through
 * and recorded as the scroll position; everything after it is gorhom's own (so a drag down from the list still hands over to the sheet).
 */
function useOpenedAt(armed: { get: () => boolean; set: (v: boolean) => void }, ref: Parameters<ScrollEventsHandlersHookType>[0], offsetY: Parameters<ScrollEventsHandlersHookType>[1]) {
  const base = useScrollEventsHandlersDefault(ref, offsetY);
  const handleOnScroll = useCallback((e: any, ctx: any) => {
    "worklet";
    // armed: our own scrollTo to the opening offset (and any retry of it) is the scroll position, not something to put back at the top
    if (armed.get()) { offsetY.set(e.contentOffset.y); return; }
    (base.handleOnScroll as any)?.(e, ctx);
  }, [base, offsetY, armed]);
  const handleOnBeginDrag = useCallback((e: any, ctx: any) => {
    "worklet";
    armed.set(false);   // the finger is on the list: from here it is gorhom's (a drag down hands over to the sheet)
    (base.handleOnBeginDrag as any)?.(e, ctx);
  }, [base, armed]);
  return { ...base, handleOnScroll, handleOnBeginDrag };
}
/** M2's sheet spring (`SPRING.sheet`) for gorhom: every sheet the finger can release uses it. With reduced motion (M2 `RM`) a sheet takes
 * the 120 ms crossfade's timing instead, set to play under the system setting (gorhom's animations otherwise follow Reanimated's and are skipped):
 * gorhom has no fade in place, so it still travels, but over a tenth of a second and never on the spring. */
export function useSheetMotion() {
  const spring = useBottomSheetSpringConfigs(m2SheetSpring);
  const crossfade = useBottomSheetTimingConfigs({ duration: m2Motion.rmFade.d, easing: m2Motion.rmFade.e, reduceMotion: ReduceMotion.Never });
  return useMotion().reduced ? crossfade : spring;
}
export const GRAB = 22;

/** M2's `.grab`: a 22 px strip holding a 40 x 5 handle. */
const Grab = () => (
  <View style={{ height: GRAB, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: m2.size.grabW, height: m2.size.grabH, borderRadius: m2.radius.dot, backgroundColor: m2.color.grab }} />
  </View>
);

export type SheetRef = BottomSheetModal;

/**
 * gorhom bottom sheet modal in M2's skin: chalk surface, 16 radius, scrim at M2's 32%, M2's sheet spring. It sizes to its
 * content up to `maxHeight` and scrolls past that. A modal, so it covers the tab bar as M2's sheets do.
 */
export const Sheet = forwardRef<BottomSheetModal, {
  maxHeight: number; onDismiss?: () => void; contentOffset?: number; children: ReactNode;
  /** fixed detents (heights, dp) instead of sizing to the content: the dish sheet rests at one and scrolls up to the other */
  snapPoints?: number[];
  /** the sheet's top edge, in dp from the top of the screen (gorhom's own shared value) */
  animatedPosition?: SharedValue<number>;
  /** the content's scroll offset, as it changes */
  onScrollY?: (y: number) => void;
  /** the first child is pinned to the top of the scroll */
  sticky?: boolean;
  /** gorhom's own: an animation starts between two detent indices; the sheet settled at an index */
  onAnimate?: (from: number, to: number) => void;
  onChange?: (index: number) => void;
}>(
  function Sheet({ maxHeight, onDismiss, contentOffset = 0, children, snapPoints, animatedPosition, onScrollY, sticky, onAnimate, onChange }, ref) {
    const scroll = useRef<any>(null);
    // armed only for a sheet that opens scrolled: otherwise gorhom's hook sees every scroll (a plain list's first scroll is not ours)
    const armed = useSharedValue(false), laidOut = useRef(false), box = useRef({ h: 0, c: 0 });
    // Scroll as soon as the content is tall enough to reach the offset, and again on every later layout until a scroll event shows the
    // offset took (the first layouts come before the sheet has its final size, and a scrollTo then can be dropped). Once it has,
    // `reached` stays set, so a user scrolling away during the retries is never snapped back.
    const reached = useRef(false), retries = useRef(0);
    const openScrolled = () => {
      const { h, c } = box.current;
      if (!contentOffset || !h || c - h < contentOffset - 1) return;
      if (!reached.current) {
        laidOut.current = true;
        armed.set(true);
        (scroll.current?.getScrollResponder?.() ?? scroll.current)?.scrollTo({ y: contentOffset, animated: false });
      }
      if (retries.current++ < m2Motion.sheetRetry.max) setTimeout(openScrolled, m2Motion.sheetRetry.every);
    };
    // gorhom calls this as a hook, once per render of its scrollable, from a stable function: that is what the rule cannot see
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hook = useCallback<ScrollEventsHandlersHookType>((r, o) => useOpenedAt(armed, r, o), [armed]);
    const animationConfigs = useSheetMotion();
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing={!snapPoints} maxDynamicContentSize={maxHeight} snapPoints={snapPoints} animatedPosition={animatedPosition} enablePanDownToClose onDismiss={() => { laidOut.current = false; box.current = { h: 0, c: 0 }; reached.current = false; retries.current = 0; armed.set(false); onDismiss?.(); }}
        animationConfigs={animationConfigs} handleComponent={Grab} onAnimate={onAnimate} onChange={onChange}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetScrollView ref={scroll} style={snapPoints ? undefined : { maxHeight: maxHeight - GRAB }} stickyHeaderIndices={sticky ? [0] : undefined} onScroll={(e) => { const y = e.nativeEvent.contentOffset.y; if (y >= contentOffset - 1) reached.current = true; onScrollY?.(y); }} scrollEventsHandlersHook={hook}
          onLayout={(e) => { box.current.h = e.nativeEvent.layout.height; openScrolled(); }}
          onContentSizeChange={(_w, h) => { box.current.c = h; openScrolled(); }}
          contentContainerStyle={{ paddingHorizontal: m2.space.gutter, paddingBottom: m2.space.group }}>{children}</BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
