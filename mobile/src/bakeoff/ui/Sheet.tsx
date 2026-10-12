import { forwardRef, useCallback, useRef, type ReactNode } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, useBottomSheetSpringConfigs, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

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
export const GRAB = 22;

/** M2's `.grab`: a 22 px strip holding a 40 x 5 handle. */
const Grab = () => (
  <View style={{ height: GRAB, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(36,23,26,0.22)" }} />
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
}>(
  function Sheet({ maxHeight, onDismiss, contentOffset = 0, children, snapPoints, animatedPosition, onScrollY, sticky }, ref) {
    const { k, z } = m2Motion.spring.sheet;
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
      if (retries.current++ < 12) setTimeout(openScrolled, 80);
    };
    // gorhom calls this as a hook, once per render of its scrollable, from a stable function: that is what the rule cannot see
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hook = useCallback<ScrollEventsHandlersHookType>((r, o) => useOpenedAt(armed, r, o), [armed]);
    const animationConfigs = useBottomSheetSpringConfigs({ stiffness: k, damping: 2 * Math.sqrt(k) * z, mass: 1 });
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing={!snapPoints} maxDynamicContentSize={maxHeight} snapPoints={snapPoints} animatedPosition={animatedPosition} enablePanDownToClose onDismiss={() => { laidOut.current = false; box.current = { h: 0, c: 0 }; reached.current = false; retries.current = 0; armed.set(false); onDismiss?.(); }}
        animationConfigs={animationConfigs} handleComponent={Grab}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetScrollView ref={scroll} style={snapPoints ? undefined : { maxHeight: maxHeight - GRAB }} stickyHeaderIndices={sticky ? [0] : undefined} onScroll={(e) => { const y = e.nativeEvent.contentOffset.y; if (y >= contentOffset - 1) reached.current = true; onScrollY?.(y); }} scrollEventsHandlersHook={hook}
          onLayout={(e) => { box.current.h = e.nativeEvent.layout.height; openScrolled(); }}
          onContentSizeChange={(_w, h) => { box.current.c = h; openScrolled(); }}
          contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingBottom: m2.space[5] }}>{children}</BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
