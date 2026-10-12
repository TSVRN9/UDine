import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { m2 } from "../../lib/theme";
import { loadFixture } from "../../bakeoff/logic/fixture";
import type { ServeTarget } from "../../bakeoff/logic/dishSheet";
import type { PlaceKey } from "../../bakeoff/logic/types";
import { useContainerTransform } from "../../bakeoff/motion/useContainerTransform";
import { EventPage } from "../../bakeoff/screens/EventPage";
import { HallHeader } from "../../bakeoff/screens/HallHeader";
import { HallsList, bandOff } from "../../bakeoff/screens/HallsList";
import { PushedHall } from "../../bakeoff/screens/PushedHall";
import { registerServe } from "../../bakeoff/state/serve";
import { PushDim, usePush } from "../../bakeoff/ui/push";

export default function Halls() {
  const { top } = useSafeAreaInsets();
  const [H, setH] = useState(0);
  const [place, setPlace] = useState<PlaceKey | null>(null);
  // a hall pushed over the open one from a dish sheet's where-served; `p` is the push (1 = off to the right, 0 = in) the hall below shifts and dims by
  const [pushed, setPushed] = useState<{ at: ServeTarget; key: number } | null>(null);
  const { p, below, dim } = usePush();
  // an event's page pushed over the open hall (the holiday note); it shifts and dims the hall below by the same `p`
  const [ev, setEv] = useState<number | null>(null);
  // the sheet that asked for the push is half-way out
  const [go, setGo] = useState(false);
  const { width: W } = useWindowDimensions();
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
    if (!(q.hall && H && t.phase === "closed" && fx.places.some((p) => p.key === q.hall))) return;
    const id = requestAnimationFrame(() => { setPlace(q.hall as PlaceKey); t.show({ top: 0, height: m2.size.band, off: 0 }); });
    return () => cancelAnimationFrame(id);
  }, [H]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushEvent = (i: number) => { p.set(1); setEv(i); };
  const push = (to: ServeTarget) => { p.set(1); setGo(false); setPushed((cur) => ({ at: to, key: (cur?.key ?? 0) + 1 })); };
  // a where-served from the plate's dish sheet arrives here to push its hall (the plate sheet belongs to the layout, not to this tab)
  const pushRef = useRef(push);
  useEffect(() => { pushRef.current = push; });
  useEffect(() => registerServe({ push: (to) => pushRef.current(to), go: () => setGo(true) }), []);
  const open = place && fx.places.find((x) => x.key === place);
  return (
    <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <Animated.View style={[{ flex: 1 }, below]}>
        <HallsList hidden={t.phase === "closed" ? null : place} onOpen={onOpen} />
        {t.phase !== "closed" && open ? <HallHeader t={t} H={H} place={open.key} name={open.name} scrollY={scrollY} onBack={() => t.close()} onPush={push} onPushGo={() => setGo(true)} onEvent={pushEvent} /> : null}
      </Animated.View>
      {ev != null ? (
        <>
          <PushDim dim={dim} />
          <EventPage i={ev} progress={p} onPop={() => setEv(null)} />
        </>
      ) : null}
      {pushed ? (
        <>
          <PushDim dim={dim} />
          <PushedHall key={pushed.key} at={pushed.at} name={fx.places.find((x) => x.key === pushed.at.place)!.name} H={H} W={W} p={p} go={go} onPop={() => setPushed(null)} onPush={push} onPushGo={() => setGo(true)} />
        </>
      ) : null}
    </View>
  );
}
