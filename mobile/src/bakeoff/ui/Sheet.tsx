import type { ReactNode, Ref } from "react";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";

/** gorhom bottom sheet in M2's skin: chalk surface, scrim at M2's 32%. */
export function Sheet({ sheetRef, snapPoints, index = -1, onClose, children }: {
  sheetRef?: Ref<BottomSheet>; snapPoints: (string | number)[]; index?: number; onClose?: () => void; children: ReactNode;
}) {
  return (
    <BottomSheet ref={sheetRef} index={index} snapPoints={snapPoints} enablePanDownToClose onClose={onClose}
      backgroundStyle={{ backgroundColor: m2.color.chalk }}
      handleIndicatorStyle={{ backgroundColor: m2.color.hair }}
      backdropComponent={(p) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={m2Motion.scrim} />}>
      <BottomSheetView>{children}</BottomSheetView>
    </BottomSheet>
  );
}
