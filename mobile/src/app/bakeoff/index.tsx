import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { loadFixture } from "../../bakeoff/logic/fixture";
import type { PlaceKey } from "../../bakeoff/logic/types";
import { useContainerTransform } from "../../bakeoff/motion/useContainerTransform";
import { HallHeader } from "../../bakeoff/screens/HallHeader";
import { HallsList, bandOff } from "../../bakeoff/screens/HallsList";
import { applyDevParams } from "../../bakeoff/state/prefs";

export default function Halls() {
  const { top } = useSafeAreaInsets();
  const [H, setH] = useState(0);
  const [place, setPlace] = useState<PlaceKey | null>(null);
  const scrollY = useSharedValue(0);
  const t = useContainerTransform(H, scrollY);
  const root = useRef<View>(null);
  const fx = loadFixture();
  const q = useLocalSearchParams<{ hall?: string }>();

  const onOpen = (key: PlaceKey, band: React.RefObject<View | null>, compact: boolean) => {
    if (t.phase !== "closed") return;
    root.current?.measureInWindow((_x, rootY) => {
      band.current?.measureInWindow((_bx, y) => {
        scrollY.set(0);
        setPlace(key);
        // the band sits 1 dp under its wrapper's top (the seam between bands)
        t.open({ top: y - rootY + 1, height: compact ? 84 : m2.size.band, off: bandOff(key, top) });
      });
    });
  };

  // dev only (screenshots): `bakeoff?hall=W&day=2&meal=dinner&sheet=hours&y=400&reveal=1&diet=veg&avoid=Milk&scores=health,carbon`
  useEffect(() => {
    if (!__DEV__) return;
    applyDevParams(q);
    if (!(q.hall && H && t.phase === "closed" && fx.places.some((p) => p.key === q.hall))) return;
    const id = requestAnimationFrame(() => { setPlace(q.hall as PlaceKey); t.show({ top: 0, height: m2.size.band, off: 0 }); });
    return () => cancelAnimationFrame(id);
  }, [H]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = place && fx.places.find((x) => x.key === place);
  return (
    <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <HallsList hidden={t.phase === "closed" ? null : place} onOpen={onOpen} />
      {t.phase !== "closed" && p ? <HallHeader t={t} H={H} place={p.key} name={p.name} scrollY={scrollY} onBack={() => t.close()} /> : null}
    </View>
  );
}
