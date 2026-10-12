import { forwardRef, type ReactNode } from "react";
import { View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, useBottomSheetSpringConfigs } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

/** M2's `.grab`: a 22 px strip holding a 40 x 5 handle. */
const Grab = () => (
  <View style={{ height: 22, alignItems: "center", justifyContent: "center" }}>
    <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(36,23,26,0.22)" }} />
  </View>
);

export type SheetRef = BottomSheetModal;

/**
 * gorhom bottom sheet modal in M2's skin: chalk surface, 16 radius, scrim at M2's 32%, M2's sheet spring. It sizes to its
 * content up to `maxHeight` and scrolls past that. A modal, so it covers the tab bar as M2's sheets do.
 */
export const Sheet = forwardRef<BottomSheetModal, { maxHeight: number; onDismiss?: () => void; onOpen?: () => void; scrollRef?: React.Ref<any>; children: ReactNode }>(
  function Sheet({ maxHeight, onDismiss, onOpen, children, scrollRef }, ref) {
    const { k, z } = m2Motion.spring.sheet;
    const animationConfigs = useBottomSheetSpringConfigs({ stiffness: k, damping: 2 * Math.sqrt(k) * z, mass: 1 });
    return (
      <BottomSheetModal ref={ref} enableDynamicSizing maxDynamicContentSize={maxHeight} enablePanDownToClose onDismiss={onDismiss} onChange={(i) => { if (i >= 0) onOpen?.(); }}
        animationConfigs={animationConfigs} handleComponent={Grab}
        backgroundStyle={{ backgroundColor: m2.color.chalk, borderTopLeftRadius: m2.radius.sheet, borderTopRightRadius: m2.radius.sheet }}
        backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} pressBehavior="close" />}>
        <BottomSheetScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: m2.space[4], paddingBottom: m2.space[5] }}>{children}</BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
