import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { emphasized, m2Linear, m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as typeof FlashList;
const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const X = m2Motion.sharedX;

export interface PagerHandle {
  list: () => FlashListRef<any> | null;
  /** Meal change: the old list's visible rows leave as a copy while the new meal comes in (MaterialSharedAxis X). */
  shift: (dir: -1 | 1, apply: () => void) => void;
  /** Day change: the old rows stay as a copy over the list while `apply` draws the new day; `ready` runs once it is drawn. */
  hold: (apply: () => void, ready: () => void) => void;
  /** Drop the copy `hold` left. */
  /** Drop the copy `hold` left from the tree (it was hidden by `holdOn`). */
  release: () => void;
}

interface Ghost { id: number; rows: ReactElement[]; top: number; dir: -1 | 1 }

/**
 * The menu list, and the meal change's shared axis (M2 sharedAxisX): the old list slides 30 dp toward the side it leaves and
 * is gone by 35% of the time; the new one slides in from the other side and is opaque by 60%. The copy is the rows that were
 * on screen, drawn by the same `renderItem`, so the list never empties to bare ground.
 */
export const MealPager = memo(forwardRef<PagerHandle, {
  data: unknown[]; renderItem: (item: any, index: number) => ReactElement; keyOf: (item: any, index: number) => string; typeOf: (item: any) => string;
  header: ReactElement; footer: ReactElement; onScroll: any; scrollY: { get: () => number }; animatedRef?: any; onViewable?: () => void;
  /** 1 while the copy `hold` made may show; the caller drops it to 0 on the UI thread when the new day takes over */
  holdOn?: { get: () => number };
  children?: ReactNode;
}>(function MealPager({ data, renderItem, keyOf, typeOf, header, footer, onScroll, scrollY, animatedRef, onViewable, holdOn }, ref) {
  const list = useRef<FlashListRef<any>>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const run = useRef(0), dirSv = useSharedValue(1);
  const p = useSharedValue(1), o = useSharedValue(1), g = useSharedValue(0);
  const pending = useRef<{ id: number; ready?: () => void } | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const renderRef = useRef(renderItem);
  renderRef.current = renderItem;

  // the rows on screen now, as a copy that sits where they are
  const capture = (dir: -1 | 1): Ghost | null => {
    const l = list.current;
    if (!l) return null;
    const { startIndex, endIndex } = l.computeVisibleIndices();
    const first = l.getLayout(startIndex);
    return first ? { id: ++run.current, rows: dataRef.current.slice(startIndex, endIndex + 2).map((it, i) => renderRef.current(it, startIndex + i)), top: first.y + l.getFirstItemOffset() - scrollY.get(), dir } : null;
  };
  const drop = useCallback((id: number) => setGhost((cur) => (cur && cur.id === id ? null : cur)), []);
  useImperativeHandle(ref, () => ({
    list: () => list.current,
    shift: (dir, apply) => {
      const next = capture(dir);
      dirSv.set(dir);
      // nothing moves until the new meal is drawn (see the effect): the old list stays as it is until then
      pending.current = { id: next?.id ?? ++run.current };
      setGhost(next);
      apply();
    },
    hold: (apply, ready) => {
      const next = capture(1);
      dirSv.set(0); // no slide: the copy and the list both stay where they are
      p.set(1); o.set(1); g.set(1);
      pending.current = { id: next?.id ?? ++run.current, ready };
      setGhost(next);
      apply();
    },
    release: () => { setTimeout(() => setGhost(null), m2Motion.fadeThrough.d); },
  }), [dirSv, scrollY]); // eslint-disable-line react-hooks/exhaustive-deps -- capture and the shared values are stable

  useEffect(() => {
    const q = pending.current;
    if (q == null) return;
    pending.current = null;
    const id = q.id;
    if (q.ready) {
      const raf = requestAnimationFrame(() => requestAnimationFrame(q.ready!));
      return () => cancelAnimationFrame(raf);
    }
    // the copy of the old rows now covers the list, so the new meal can be set at its start; the list lays its rows out a
    // frame after React commits them, so both move from the second frame on
    p.set(0); o.set(0); g.set(1);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      p.set(withTiming(1, { duration: X.d, easing: emphasized }, (done) => { if (done) runOnJS(drop)(id); }));
      o.set(withTiming(1, { duration: X.d * X.inAt, easing: m2Linear }));
      g.set(withTiming(0, { duration: X.d * X.at, easing: m2Linear }));
    }));
    return () => cancelAnimationFrame(raf);
  }, [data, p, o, g, drop]);

  const enter = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ translateX: dirSv.get() * X.dist * (1 - p.get()) }] }));
  const leave = useAnimatedStyle(() => ({ opacity: g.get() * (holdOn ? holdOn.get() : 1), transform: [{ translateX: -dirSv.get() * X.dist * p.get() }] }));
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
            {ghost.rows.map((el, i) => <View key={i}>{el}</View>)}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}));
