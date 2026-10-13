import { useState } from "react";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { Press, Stepper, thud, thunk } from "../ui";
import { Glyph } from "../ui/Glyph";
import { useMotion } from "../ui/motion";
import { tapBox } from "../ui/tap";
import { findItem, fq, rowCode } from "../logic/plate";
import type { Dish, MealKey, PlaceKey } from "../logic/types";
import { add, getState, step, useStore } from "../state/store";

const Plus = () => <Glyph name="plus" size={m2.size.glyph} tint={m2.color.vm} />;

/** One step on the plate that holds this dish: the + Stepper's two buttons and a plate row's two share it (haptics: Light for more, Rigid for a removal). */
export function stepDish(meal: MealKey, key: string, place: PlaceKey | undefined, dir: 1 | -1) {
  const f = findItem(getState().plates, meal, key, place);
  if (!f) return;
  if (dir < 0 && f.item.qty === 0.5) thunk(); else if (dir > 0) thud();
  step(f.plate.id, key, dir);
}

// The arrival is a layout animation, so it starts on the UI thread when the lane's view mounts: the first frame after the tap is already
// its first frame. (A shared value started from a passive effect waited for the rest of the commit, the plate bar and the sheet's
// snap included, and left the lane empty for two frames; one started from a layout effect first drew the lane whole.)
const settle = m2Motion.settle;
const rmFade = m2Motion.rmFade;
const stepperIn = new Keyframe({ 0: { opacity: 0, transform: [{ scaleX: m2Motion.lane.from }] }, 100: { opacity: 1, transform: [{ scaleX: 1 }], easing: settle.e } }).duration(settle.d);
const plusIn = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: settle.e } }).duration(settle.d);
// reduced motion keeps the opacity and drops the widening (M2 `A`): the 120 ms crossfade, which plays under the system setting
const fadeIn = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: rmFade.e } }).duration(rmFade.d).reduceMotion(ReduceMotion.Never);

/** The stepper arrives where + stood: transparent and `lane.from` wide from the right edge, when this lane is new to a dish whose number just crossed 0. */
function StepperLane({ animate, label, onDec, onInc }: { animate: boolean; label: string; onDec: () => void; onInc: () => void }) {
  const { reduced } = useMotion();
  return (
    <Animated.View entering={animate ? (reduced ? fadeIn : stepperIn) : undefined} style={{ transformOrigin: "100% 50%" }}>
      <Stepper label={label} onDec={onDec} onInc={onInc} />
    </Animated.View>
  );
}

function PlusLane({ animate, ghost, name, onAdd }: { animate: boolean; ghost: boolean; name: string; onAdd: () => void }) {
  const { reduced } = useMotion();
  return (
    <Animated.View entering={animate ? (reduced ? fadeIn : plusIn) : undefined}>
      <Press accessibilityRole="button" accessibilityLabel={`Add ${name}`} onPress={onAdd}
        style={ghost
          ? { ...tapBox, margin: m2.space.ghostMargin, borderRadius: m2.radius.button, borderWidth: m2.size.keyline, borderColor: m2.color.ghost }
          : { width: m2.size.add, height: m2.size.add, borderRadius: m2.radius.button, alignItems: "center", justifyContent: "center" }}>
        <Plus />
      </Press>
    </Animated.View>
  );
}

/**
 * M2's row control in the 114 dp lane: + (outlined when adding would start a second plate), which becomes the stepper where it
 * stands. It subscribes to its own number, so a plate change redraws only the rows it changes. The stepper widens in from the right and
 * a removed stepper is replaced by + fading in (M2 collapses a ghost of it too: not drawn here). `meal` is the plate's meal.
 * Whether the lane that mounts is an arrival is worked out in the render that mounts it (a change of this dish's own number across 0,
 * never a recycled row showing another dish), so nothing is ever drawn whole and then reset.
 */
export function RowControl({ place, meal, dish }: { place: PlaceKey; meal: MealKey; dish: Dish }) {
  const code = useStore((s) => rowCode(s.plates, meal, dish.key, place));
  const [seen, setSeen] = useState({ key: dish.key, code, animate: false });
  let cur = seen;
  if (seen.key !== dish.key || seen.code !== code) {
    cur = { key: dish.key, code, animate: seen.key === dish.key && (seen.code > 0) !== (code > 0) };
    setSeen(cur);
  }
  if (code > 0) {
    return <StepperLane animate={cur.animate} label={fq(code)} onDec={() => stepDish(meal, dish.key, place, -1)} onInc={() => stepDish(meal, dish.key, place, 1)} />;
  }
  return <PlusLane animate={cur.animate} ghost={code < 0} name={dish.name} onAdd={() => { thud(); add(meal, dish.name, { [place]: dish }); }} />;
}
