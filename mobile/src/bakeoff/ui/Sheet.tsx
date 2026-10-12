import { forwardRef, useRef, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, useBottomSheetSpringConfigs } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

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
    const scroll = useRef<ScrollView>(null);
    const animationConfigs = useBottomSheetSpringConfigs({ stiffness: k, damping: 2 * Math.sqrt(k) * z, mass: 1 });
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing maxDynamicContentSize={maxHeight} enableContentPanningGesture={false} enablePanDownToClose onDismiss={onDismiss}
        animationConfigs={animationConfigs} handleComponent={Grab}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetView>
          {/* a plain ScrollView, not gorhom's: gorhom pins its own to the top until the sheet has settled, and M2's schedule opens
              already scrolled to the chosen day. The sheet is dragged by its handle and the scrim. */}
          <ScrollView ref={scroll} style={{ maxHeight: maxHeight - GRAB }} showsVerticalScrollIndicator={false}
            onContentSizeChange={() => { if (contentOffset) scroll.current?.scrollTo({ y: contentOffset, animated: false }); }}
            contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingBottom: m2.space[5] }}>{children}</ScrollView>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);
