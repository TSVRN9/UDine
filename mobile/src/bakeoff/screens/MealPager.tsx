import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { emphasized, m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as typeof FlashList;
const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const X = m2Motion.sharedX;

export interface PagerHandle {
  list: () => FlashListRef<any> | null;
  /** Meal change: the old list's visible rows leave as a copy while the new meal comes in (MaterialSharedAxis X). */
  shift: (dir: -1 | 1, apply: () => void) => void;
}

interface Ghost { id: number; rows: unknown[]; top: number; dir: -1 | 1 }

/**
 * The menu list, and the meal change's shared axis (M2 sharedAxisX): the old list slides 30 dp toward the side it leaves and
 * is gone by 35% of the time; the new one slides in from the other side and is opaque by 60%. The copy is the rows that were
 * on screen, drawn by the same `renderItem`, so the list never empties to bare ground.
 */
export const MealPager = forwardRef<PagerHandle, {
  data: unknown[]; renderItem: (item: any, index: number) => ReactElement; keyOf: (item: any, index: number) => string; typeOf: (item: any) => string;
  header: ReactElement; footer: ReactElement; onScroll: any; scrollY: { get: () => number }; animatedRef?: any; onViewable?: () => void;
  children?: ReactNode;
}>(function MealPager({ data, renderItem, keyOf, typeOf, header, footer, onScroll, scrollY, animatedRef, onViewable }, ref) {
  const list = useRef<FlashListRef<any>>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const run = useRef(0), dirSv = useSharedValue(1);
  const p = useSharedValue(1), o = useSharedValue(1), g = useSharedValue(0);
  const pending = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  const drop = useCallback((id: number) => setGhost((cur) => (cur && cur.id === id ? null : cur)), []);
  useImperativeHandle(ref, () => ({
    list: () => list.current,
    shift: (dir, apply) => {
      const l = list.current;
      let next: Ghost | null = null;
      if (l) {
        const { startIndex, endIndex } = l.computeVisibleIndices();
        const first = l.getLayout(startIndex);
        if (first) next = { id: ++run.current, rows: dataRef.current.slice(startIndex, endIndex + 2), top: first.y + l.getFirstItemOffset() - scrollY.get(), dir };
      }
      const id = next?.id ?? ++run.current;
      dirSv.set(dir);
      // nothing moves until the new meal is drawn (see the effect): the old list stays as it is until then
      pending.current = id;
      setGhost(next);
      apply();
    },
  }), [dirSv, scrollY]);

  useEffect(() => {
    const id = pending.current;
    if (id == null) return;
    pending.current = null;
    // the copy of the old rows now covers the list, so the new meal can be set at its start; the list lays its rows out a
    // frame after React commits them, so both move from the second frame on
    p.set(0); o.set(0); g.set(1);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      p.set(withTiming(1, { duration: X.d, easing: emphasized }, (done) => { if (done) runOnJS(drop)(id); }));
      o.set(withTiming(1, { duration: X.d * X.inAt, easing: Easing.linear }));
      g.set(withTiming(0, { duration: X.d * X.at, easing: Easing.linear }));
    }));
    return () => cancelAnimationFrame(raf);
  }, [data, p, o, g, drop]);

  const enter = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateX: dirSv.get() * X.dist * (1 - p.get()) }] }));
  const leave = useAnimatedStyle(() => ({ opacity: g.get(), transform: [{ translateX: -dirSv.get() * X.dist * p.get() }] }));
  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[{ flex: 1 }, enter]}>
        <AnimatedFlashList
          ref={(r: any) => { list.current = r; if (animatedRef) animatedRef(r); }}
          data={data} renderItem={({ item, index }: any) => renderItem(item, index)} keyExtractor={keyOf} getItemType={typeOf}
          ListHeaderComponent={header} ListFooterComponent={footer}
          onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable} drawDistance={600}
        />
      </Animated.View>
      {ghost ? (
        <Animated.View pointerEvents="none" style={[fill, { overflow: "hidden", backgroundColor: m2.color.chalk }, leave]}>
          <View style={{ position: "absolute", left: 0, right: 0, top: ghost.top }}>
            {ghost.rows.map((it, i) => <View key={i}>{renderItem(it, i)}</View>)}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
});
