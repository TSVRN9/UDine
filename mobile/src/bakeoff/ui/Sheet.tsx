import { forwardRef, useCallback, useRef, type ReactNode } from "react";
import { View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, useBottomSheetSpringConfigs, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

/**
 * gorhom pins its scrollables to the top while the sheet is still rising, and resets any scroll that happens then. The schedule
 * opens already scrolled (M2), so the first scroll event, the one our own `scrollTo` makes as the content is measured, is let through
 * and recorded as the scroll position; everything after it is gorhom's own (so a drag down from the list still hands over to the sheet).
 */
const useOpenedAt: ScrollEventsHandlersHookType = (ref, offsetY) => {
  const base = useScrollEventsHandlersDefault(ref, offsetY);
  const handleOnScroll = useCallback((e: any, ctx: any) => {
    "worklet";
    if (!ctx.opened && e.contentOffset.y > 0) { ctx.opened = true; offsetY.set(e.contentOffset.y); return; }
    (base.handleOnScroll as any)?.(e, ctx);
  }, [base, offsetY]);
  return { ...base, handleOnScroll };
};
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
    const animationConfigs = useBottomSheetSpringConfigs({ stiffness: k, damping: 2 * Math.sqrt(k) * z, mass: 1 });
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing maxDynamicContentSize={maxHeight} enablePanDownToClose onDismiss={onDismiss}
        animationConfigs={animationConfigs} handleComponent={Grab}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetScrollView ref={scroll} scrollEventsHandlersHook={useOpenedAt}
          onLayout={() => { if (contentOffset) (scroll.current?.getScrollResponder?.() ?? scroll.current)?.scrollTo({ y: contentOffset, animated: false }); }}
          contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingBottom: m2.space[5] }}>{children}</BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
