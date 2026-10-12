import { useRef, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { loadFixture } from "../../bakeoff/logic/fixture";
import { statusText } from "../../bakeoff/logic/status";
import type { PlaceKey } from "../../bakeoff/logic/types";
import { useContainerTransform } from "../../bakeoff/motion/useContainerTransform";
import { HallHeader } from "../../bakeoff/screens/HallHeader";
import { HallsList, bandOff } from "../../bakeoff/screens/HallsList";

export default function Halls() {
  const { top } = useSafeAreaInsets();
  const [H, setH] = useState(0);
  const [place, setPlace] = useState<PlaceKey | null>(null);
  const t = useContainerTransform(H);
  const root = useRef<View>(null);
  const fx = loadFixture();

  const onOpen = (key: PlaceKey, band: React.RefObject<View | null>, compact: boolean) => {
    if (t.phase !== "closed") return;
    root.current?.measureInWindow((_x, rootY) => {
      band.current?.measureInWindow((_bx, y) => {
        setPlace(key);
        // the band sits 1 dp under its wrapper's top (the seam between bands)
        t.open({ top: y - rootY + 1, height: compact ? 84 : m2.size.band, off: bandOff(key, top) });
      });
    });
  };

  const p = place && fx.places.find((q) => q.key === place);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <HallsList hidden={t.phase === "closed" ? null : place} onOpen={onOpen} />
      {t.phase !== "closed" && p ? (
        <HallHeader t={t} H={H} place={p.key} name={p.name} status={statusText(fx.hours[p.key], new Date(fx.clock))} onBack={() => t.close()} />
      ) : null}
      </View>
    </GestureHandlerRootView>
  );
}
