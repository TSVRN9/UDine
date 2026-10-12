import { useRef, useState, type RefObject } from "react";
import { runOnJS, useAnimatedStyle, useSharedValue, withSequence, type SharedValue } from "react-native-reanimated";
import type { Labels } from "../ui/labels";
import { dayLegs } from "../motion/dayChange";
import { timed, useMotion } from "../ui/motion";
import { tick } from "../ui";
import { mark } from "../perf";
import type { PagerHandle } from "./MealPager";

/**
 * A day change (M2 `changeDay`): what says the day fades out where it is, then the new day fades in (the list scaling up from .97).
 * The list and the labels commit once, under the old ones (the copy of the old rows, the old labels' layer); the fade out and back in is then
 * only shared values on the UI thread. `setDay` commits the new day; `track(labels)` (the caller says what the labels are after every render) is what the old layer shows.
 */
export function useDayChange({ pager, y, R, origin, setDay }: {
  pager: RefObject<PagerHandle | null>; y: SharedValue<number>; R: number;
  /** the list's vertical centre, the origin of its scale-up (dp from the top of the screen) */
  origin: number; setDay: (i: number) => void;
}) {
  // the labels as they were before a day change (null: they are the current ones)
  const [held, setHeld] = useState<Labels | null>(null);
  const labelsRef = useRef<Labels | null>(null);
  const f = useSharedValue(1), sc = useSharedValue(1), lo = useSharedValue(0), ln = useSharedValue(1), holdOn = useSharedValue(1);
  const { reduced } = useMotion();
  const { out: legOut, in: legIn, scale: landScale } = dayLegs(reduced);
  const newLabels = useAnimatedStyle(() => ({ opacity: ln.get() }));
  const oldLabelsStyle = useAnimatedStyle(() => ({ opacity: lo.get() }));
  const listFade = useAnimatedStyle(() => ({ opacity: f.get(), transform: [{ scale: sc.get() }], transformOrigin: `50% ${origin}px` }));

  const done = () => {
    mark("day:done");
    pager.current?.release();
    setHeld(null);
  };
  const changeDay = (i: number) => {
    const keep = Math.min(y.get(), R);
    // refused (and nothing touched) while another change is running: see motion/pagerMachine
    pager.current?.hold(() => {
      holdOn.set(1);
      lo.set(1); ln.set(0);   // the old layer shows exactly what is on screen: until the commit lands it is the current labels
      setHeld(labelsRef.current);
      setDay(i);
      mark("day:apply");
    }, () => {
      mark("day:ready");
      pager.current?.list()?.scrollToOffset({ offset: keep, animated: false });
      lo.set(timed(0, legOut));
      sc.set(1);
      f.set(withSequence(
        timed(0, legOut, () => {
          "worklet";
          holdOn.set(0);
          sc.set(landScale);
          sc.set(timed(1, legIn));
          ln.set(timed(1, legIn));   // the labels come back in the same frame as the list
        }),
        timed(1, legIn, () => { "worklet"; runOnJS(done)(); }),
      ));
    });
  };
  /**
   * A day was picked in the schedule: the same day only closes it; another starts the change at once and closes it. M2 starts the change when the
   * sheet is half-way out (`isheet.away`); here the JS it costs (the whole screen renders under the old rows) overlaps the sheet's exit instead.
   */
  const pickDay = (i: number, current: number, dismiss: () => void) => {
    if (i === current) { dismiss(); return; }
    mark("day:pick");
    changeDay(i);
    dismiss();
    tick();
  };
  /** What the labels are now: the old layer shows these until the new day lands. */
  const track = (l: Labels) => { labelsRef.current = l; };
  return { held, track, holdOn, newLabels, oldLabelsStyle, listFade, pickDay };
}
