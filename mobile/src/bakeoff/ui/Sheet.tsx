import { forwardRef, useCallback, useRef, type ReactNode } from "react";
import { useSharedValue } from "react-native-reanimated";
import { View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, useBottomSheetSpringConfigs, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

/**
 * gorhom pins its scrollables to the top while the sheet is still rising, and resets any scroll that happens then. The schedule
 * opens already scrolled (M2), so the first scroll event, the one our own `scrollTo` makes as the content is measured, is let through
 * and recorded as the scroll position; everything after it is gorhom's own (so a drag down from the list still hands over to the sheet).
 */
function useOpenedAt(armed: { get: () => boolean }, ref: Parameters<ScrollEventsHandlersHookType>[0], offsetY: Parameters<ScrollEventsHandlersHookType>[1]) {
  const base = useScrollEventsHandlersDefault(ref, offsetY);
  const handleOnScroll = useCallback((e: any, ctx: any) => {
    "worklet";
    if (armed.get() && !ctx.opened && e.contentOffset.y > 0) { ctx.opened = true; offsetY.set(e.contentOffset.y); return; }
    (base.handleOnScroll as any)?.(e, ctx);
  }, [base, offsetY, armed]);
  return { ...base, handleOnScroll };
}
const GRAB = 22;

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
export const Sheet = forwardRef<BottomSheetModal, { maxHeight: number; onDismiss?: () => void; contentOffset?: number; children: ReactNode }>(
  function Sheet({ maxHeight, onDismiss, contentOffset = 0, children }, ref) {
    const { k, z } = m2Motion.spring.sheet;
    const scroll = useRef<any>(null);
    // armed only for a sheet that opens scrolled: otherwise gorhom's hook sees every scroll (a plain list's first scroll is not ours)
    const armed = useSharedValue(false), laidOut = useRef(false), box = useRef({ h: 0, c: 0 });
    // scroll once, as soon as the content is tall enough to reach the offset (the first layout can come before it is)
    const openScrolled = () => {
      const { h, c } = box.current;
      if (laidOut.current || !contentOffset || !h || c - h < contentOffset - 1) return;
      laidOut.current = true;
      armed.set(true);
      (scroll.current?.getScrollResponder?.() ?? scroll.current)?.scrollTo({ y: contentOffset, animated: false });
    };
    // gorhom calls this as a hook, once per render of its scrollable, from a stable function: that is what the rule cannot see
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hook = useCallback<ScrollEventsHandlersHookType>((r, o) => useOpenedAt(armed, r, o), [armed]);
    const animationConfigs = useBottomSheetSpringConfigs({ stiffness: k, damping: 2 * Math.sqrt(k) * z, mass: 1 });
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing maxDynamicContentSize={maxHeight} enablePanDownToClose onDismiss={() => { laidOut.current = false; box.current = { h: 0, c: 0 }; armed.set(false); onDismiss?.(); }}
        animationConfigs={animationConfigs} handleComponent={Grab}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetScrollView ref={scroll} scrollEventsHandlersHook={hook}
          onLayout={(e) => { box.current.h = e.nativeEvent.layout.height; openScrolled(); }}
          onContentSizeChange={(_w, h) => { box.current.c = h; openScrolled(); }}
          contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingBottom: m2.space[5] }}>{children}</BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
