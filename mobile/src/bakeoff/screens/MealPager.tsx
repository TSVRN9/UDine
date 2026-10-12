import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { emphasized, m2Linear, m2Motion } from "../../lib/motion";
import { m2 } from "../../lib/theme";
import { pagerStep, type PagerEvent, type Phase } from "../motion/pagerMachine";
import { mark } from "../perf";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as typeof FlashList;
const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const X = m2Motion.sharedX;

export interface PagerHandle {
  list: () => FlashListRef<any> | null;
  /** Meal change: the old list's visible rows leave as a copy while the new meal comes in (MaterialSharedAxis X). Returns false (and
   * does nothing) while another change is running. */
  shift: (dir: -1 | 1, apply: () => void) => boolean;
  /** Day change: the old rows stay as a copy over the list while `apply` draws the new day; `ready` runs once it is drawn (whatever
   * re-rendered the list first). Returns false (and does nothing) while another change is running. */
  hold: (apply: () => void, ready: () => void) => boolean;
  /** The day change's fade is over: drop the copy `hold` left. */
  release: () => void;
}

interface Ghost { id: number; rows: ReactElement[]; top: number; dir: -1 | 1; curtain?: ReactNode }

/**
 * The menu list, and the meal change's shared axis (M2 sharedAxisX): the old list slides 30 dp toward the side it leaves and
 * is gone by 35% of the time; the new one slides in from the other side and is opaque by 60%. The copy is the rows that were
 * on screen, drawn by the same `renderItem`, so the list never empties to bare ground.
 */
export const MealPager = forwardRef<PagerHandle, {
  data: unknown[]; renderItem: (item: any, index: number) => ReactElement; keyOf: (item: any, index: number) => string; typeOf: (item: any) => string;
  header: ReactElement; footer: ReactElement; onScroll: any; scrollY: { get: () => number }; animatedRef?: any; onViewable?: () => void;
  /** 1 while the copy `hold` made may show; the caller drops it to 0 on the UI thread when the new day takes over */
  holdOn?: { get: () => number };
  /** What covers the list when there is nothing to list (a network state): over the list, under the copy a change holds. `copy` is true
   * for the one the copy carries. */
  curtain?: (copy: boolean) => ReactNode;
}>(function MealPager({ data, renderItem, keyOf, typeOf, header, footer, onScroll, scrollY, animatedRef, onViewable, holdOn, curtain }, ref) {
  const list = useRef<FlashListRef<any>>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const run = useRef(0), dirSv = useSharedValue(1);
  const p = useSharedValue(1), o = useSharedValue(1), g = useSharedValue(0);
  const pending = useRef<{ id: number; ready?: () => void } | null>(null);
  const phase = useRef<Phase>("idle");
  // false when the event is refused in the current phase
  const send = (e: PagerEvent) => { const n = pagerStep(phase.current, e); if (n) phase.current = n; return n !== null; };
  const dataRef = useRef(data);
  dataRef.current = data;
  const renderRef = useRef(renderItem);
  renderRef.current = renderItem;

  // the rows on screen now, as a copy that sits where they are
  const curtainRef = useRef(curtain);
  curtainRef.current = curtain;
  const capture = (dir: -1 | 1): Ghost | null => {
    const l = list.current;
    if (!l) return null;
    // a curtain (loading, offline, failed) is all there is on screen: the copy is the curtain
    const c = curtainRef.current?.(true);
    if (c) return { id: ++run.current, rows: [], top: 0, dir, curtain: c };
    const { startIndex, endIndex } = l.computeVisibleIndices();
    const first = l.getLayout(startIndex);
    return first ? { id: ++run.current, rows: dataRef.current.slice(startIndex, endIndex + 2).map((it, i) => renderRef.current(it, startIndex + i)), top: first.y + l.getFirstItemOffset() - scrollY.get(), dir } : null;
  };
  const drop = useCallback((id: number) => { setGhost((cur) => (cur && cur.id === id ? null : cur)); send("done"); }, []);
  useImperativeHandle(ref, () => ({
    list: () => list.current,
    shift: (dir, apply) => {
      if (!send("shift")) return false;
      const next = capture(dir);
      dirSv.set(dir);
      // nothing moves until the new meal is drawn (see the effect): the old list stays as it is until then
      pending.current = { id: next?.id ?? ++run.current };
      setGhost(next);
      apply();
      return true;
    },
    hold: (apply, ready) => {
      if (!send("hold")) return false;
      mark("hold:start");
      const next = capture(1);
      mark(`hold:captured ${next?.rows.length ?? 0}`);
      dirSv.set(0); // no slide: the copy and the list both stay where they are
      p.set(1); o.set(1); g.set(1);
      pending.current = { id: next?.id ?? ++run.current, ready };
      setGhost(next);
      apply();
      return true;
    },
    release: () => { send("done"); setTimeout(() => setGhost(null), m2Motion.fadeThrough.d); },
  }), [dirSv, scrollY]); // eslint-disable-line react-hooks/exhaustive-deps -- capture and the shared values are stable

  useLayoutEffect(() => { if (pending.current) mark("pager:layout"); }, [data]);
  useEffect(() => {
    const q = pending.current;
    if (q == null) return;
    pending.current = null;
    const id = q.id;
    if (q.ready) {
      mark("pager:effect");
      // not cancelled by a later data change: `ready` is the day change's only way forward, and it runs once
      requestAnimationFrame(() => { mark("pager:raf1"); requestAnimationFrame(() => { mark("pager:raf2"); if (send("ready")) q.ready!(); }); });
      return;
    }
    // the copy of the old rows now covers the list, so the new meal can be set at its start; the list lays its rows out a
    // frame after React commits them, so both move from the second frame on
    p.set(0); o.set(0); g.set(1);
    // not cancelled by a later data change either (Show all, prefs): the slide's end is what returns the pager to idle
    requestAnimationFrame(() => requestAnimationFrame(() => {
      p.set(withTiming(1, { duration: X.d, easing: emphasized }, (done) => { if (done) runOnJS(drop)(id); }));
      o.set(withTiming(1, { duration: X.d * X.inAt, easing: m2Linear }));
      g.set(withTiming(0, { duration: X.d * X.at, easing: m2Linear }));
    }));
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
        {curtain?.(false)}
      </Animated.View>
      {ghost ? (
        <Animated.View pointerEvents="none" style={[fill, { overflow: "hidden", backgroundColor: m2.color.chalk }, leave]}>
          <View style={{ position: "absolute", left: 0, right: 0, top: ghost.top }}>
            {ghost.rows.map((el, i) => <View key={i}>{el}</View>)}
          </View>
          {ghost.curtain}
        </Animated.View>
      ) : null}
    </View>
  );
});
