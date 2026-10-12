import { useLayoutEffect, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { m2 } from "../../lib/theme";
import { m2Motion, m2SettleEasing } from "../../lib/motion";
import { Press, Stepper, thud, thunk } from "../ui";
import { findItem, fq, rowCode } from "../logic/plate";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import { add, getState, step, useStore } from "../state/store";

const Plus = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={m2.color.vm} strokeWidth={2.4} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
);

/** One step on the plate that holds this dish: the + Stepper's two buttons and a plate row's two share it (haptics: Light for more, Rigid for a removal). */
export function stepDish(meal: MealKey, key: string, place: PlaceKey | undefined, dir: 1 | -1) {
  const f = findItem(getState().plates, meal, key, place);
  if (!f) return;
  if (dir < 0 && f.item.qty === 0.5) thunk(); else if (dir > 0) thud();
  step(f.plate.id, key, dir);
}

/**
 * M2's row control in the 114 dp lane: + (outlined when adding would start a second plate), which becomes the stepper where it
 * stands. It subscribes to its own number, so a plate change redraws only the rows it changes. + widens leftward into the stepper; a
 * removed stepper is replaced by + fading in (M2 collapses a ghost of it too: not drawn here). `meal` is the plate's meal.
 */
export function RowControl({ place, meal, dish }: { place: PlaceKey; meal: MealKey; dish: Dish }) {
  const code = useStore((s) => rowCode(s.plates, meal, dish.key, place));
  const was = useRef({ key: dish.key, code });
  const grow = useSharedValue(1), back = useSharedValue(1);
  // a transition is only a change of this dish's own number (a recycled row showing another dish is not one)
  useLayoutEffect(() => {
    const prev = was.current;
    was.current = { key: dish.key, code };
    if (prev.key !== dish.key || (prev.code > 0) === (code > 0)) return;
    const to = { duration: m2Motion.settle.d, easing: m2SettleEasing };
    if (code > 0) { grow.set(0); grow.set(withTiming(1, to)); } else { back.set(0); back.set(withTiming(1, to)); }
  }, [code, dish.key, grow, back]);
  const widen = useAnimatedStyle(() => ({ opacity: grow.get(), transform: [{ scaleX: m2Motion.lane.from + (1 - m2Motion.lane.from) * grow.get() }], transformOrigin: "100% 50%" }));
  const pop = useAnimatedStyle(() => ({ opacity: back.get() }));
  if (code > 0) {
    return (
      <Animated.View style={widen}>
        <Stepper label={fq(code)} onDec={() => stepDish(meal, dish.key, place, -1)} onInc={() => stepDish(meal, dish.key, place, 1)} />
      </Animated.View>
    );
  }
  const ghost = code < 0;
  return (
    <Animated.View style={pop}>
      <Press accessibilityRole="button" accessibilityLabel={`Add ${dish.name}`} onPress={() => { thud(); add(meal, dish.name, { [place]: dish }); }}
        style={ghost
          ? { width: m2.size.tap, height: m2.size.tap, margin: 2, borderRadius: m2.radius.button, borderWidth: 1.5, borderColor: m2.color.ghost, alignItems: "center", justifyContent: "center" }
          : { width: 48, height: 48, borderRadius: m2.radius.button, alignItems: "center", justifyContent: "center" }}>
        <Plus />
      </Press>
    </Animated.View>
  );
};
