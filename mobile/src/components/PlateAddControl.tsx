import { useEffect, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Reanimated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";
import type { MenuItem } from "@udine/shared";
import { HoldSlideAddButton } from "./HoldSlideAddButton";
import { formatServings } from "../lib/servingsStepper";
import { durations } from "../lib/motion";
import { colors, fonts, fs, radii, withOpacity } from "../lib/theme";
import type { PlateEntry } from "../lib/plate";

// Standalone empty-plate "+" circle only (ServingsF.dc.html:69/79 -- 44x44). The in-plate
// stepper's own plus segment is narrower (IN_PLATE_PLUS_WIDTH below) -- the artboards draw them
// at different widths; the slot's height and pinned-right position stay shared, only the width
// differs per state, a 4px shift on the add/remove transition.
const PLUS_SLOT_SIZE = fs(44);
// Literal, not fs(40) -- spec (ServingsF.dc.html:58/60/96/98) pins the in-plate stepper's +/-
// segments at 40px each; touch targets don't scale. Distinct from PLUS_SLOT_SIZE (44px), the
// standalone empty-plate "+" circle.
const IN_PLATE_PLUS_WIDTH = 40;
// Literal, not fs(40) -- spec (ServingsF.dc.html:58) pins the minus slot at 40px; touch targets
// don't scale (see fs()'s own doc comment).
const MINUS_SLOT_WIDTH = 40;
const COUNT_SLOT_WIDTH = fs(34);
// Precomputed outside the worklet below -- withOpacity isn't worklet-marked, and calling a plain
// JS-thread function from inside useAnimatedStyle's UI-thread callback throws. Worklets can
// close over a plain string constant fine; they just can't call out to arbitrary JS per frame.
const MAROON_TRANSPARENT = withOpacity(colors.maroon600, 0);
const STEPPER_FULL_WIDTH = IN_PLATE_PLUS_WIDTH + COUNT_SLOT_WIDTH + MINUS_SLOT_WIDTH;

/** Bowl-with-toppings glyph for a not-yet-composed composite dish's pre-add slot
 * (CompositeDishRowStates.dc.html:37-45) -- distinct from a copy/duplicate glyph and from the
 * FAB's filter-funnel icon (MenuFAB_Active.dc.html:75), reads as "build this" at a glance. Opens
 * CompositeDishComposer instead of the ordinary hold-drag add: composing (N independent toppings)
 * isn't a scalar the hold-drag ladder can represent, see composite-dish-logic's annotation. */
function BowlIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M3 6h12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M3 6c0 4.2 2.7 7 6 7s6-2.8 6-7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={6} cy={4.3} r={1} fill={color} />
      <Circle cx={9} cy={3.6} r={1} fill={color} />
      <Circle cx={12} cy={4.3} r={1} fill={color} />
    </Svg>
  );
}

/** Filled maroon pill -- the dish row's add control. Shared by halls/[slug].tsx's own dish rows
 * AND CompositeDishComposer's add-in rows (composite-dish-logic annotation: "keeps its own
 * pre-add/in-plate hold-drag control, since an individual add-in ... has a well-defined '1 unit'
 * from the start" -- literally the same control, not a lookalike). The empty-plate "+" and the
 * in-plate "− N +" stepper are the SAME persistent element, not two components swapped by a
 * ternary. The "+" slot (`flexDirection: row-reverse`, so it renders pinned to the right) never
 * moves; growing the pill just animates this wrapper's `width` from `PLUS_SLOT_SIZE` to
 * `STEPPER_FULL_WIDTH` with `overflow: hidden` clipping the rest, revealing the "−"/count from
 * the left. The "−"/count are always mounted (so there's no gap when the count drops back to 0)
 * but only hit-testable via `pointerEvents` while actually in the plate -- `overflow: hidden` in
 * RN clips paint, not touch dispatch, so an always-mounted "−" button behind a narrow clip could
 * otherwise still be tapped through it.
 *
 * `composite` (composite-dish-logic annotation) swaps ONLY the pre-add ("!inPlate") branch's
 * contents -- once a composite dish IS on the plate, it falls straight through to the exact same
 * stepper every simple dish uses, unchanged, which is what makes a composed in-plate row pixel-
 * identical to a simple dish's. Neither the bowl button nor the re-add "+" below carries a
 * hold-drag gesture: a not-yet-composed dish has no well-defined "1 unit" to pre-choose (routes
 * to the composer instead), and re-adding a saved recipe is a single deliberate action, not a
 * quantity to drag to. `composite` is never passed for an add-in row -- an add-in is never itself
 * composite. */
export function PlateAddControl({
  plateEntry,
  item,
  onStep,
  blocksScrollRefs,
  onQuickAdd,
  onHoldStart,
  onHoldDrag,
  onHoldEnd,
  liveCount,
  liveIndex,
  composite,
}: {
  plateEntry: Pick<PlateEntry, "count"> | undefined;
  item: MenuItem;
  onStep: (delta: number) => void;
  blocksScrollRefs: RefObject<any>[];
  onQuickAdd: () => void;
  onHoldStart: (anchor: { x: number; y: number; width: number; height: number }) => void;
  onHoldDrag: (count: number) => void;
  onHoldEnd: () => void;
  liveCount: SharedValue<number>;
  liveIndex: SharedValue<number>;
  /** Present only for a composite dish's OWN row -- undefined for any ordinary dish or add-in. */
  composite?: { hasSavedRecipe: boolean; onOpenComposer: () => void; onReAddRecipe: () => void };
}) {
  const inPlate = !!plateEntry;
  const widthProgress = useSharedValue(inPlate ? 1 : 0);
  useEffect(() => {
    widthProgress.value = withTiming(inPlate ? 1 : 0, { duration: durations.servingsPill });
  }, [inPlate, widthProgress]);
  const clipStyle = useAnimatedStyle(() => ({
    width: PLUS_SLOT_SIZE + widthProgress.value * (STEPPER_FULL_WIDTH - PLUS_SLOT_SIZE),
    // The empty-plate "+" is a ghost-outline button (maroon border/text on a see-through
    // background) that was never designed to sit on a filled pill. Fade the fill in alongside the
    // width, rather than always having it, or the outline paints invisible on a solid maroon
    // background while empty.
    backgroundColor: interpolateColor(widthProgress.value, [0, 1], [MAROON_TRANSPARENT, colors.maroon600]),
  }));

  return (
    <Reanimated.View style={[styles.stepperClip, clipStyle]}>
      <View style={styles.stepperRow}>
        <View style={[styles.plusSlot, { width: inPlate ? IN_PLATE_PLUS_WIDTH : PLUS_SLOT_SIZE }]}>
          {inPlate ? (
            <Pressable
              style={[styles.plusSlot, { width: IN_PLATE_PLUS_WIDTH }]}
              onPress={() => onStep(1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Add one ${item.dishName}`}
            >
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          ) : composite ? (
            composite.hasSavedRecipe ? (
              <Pressable
                style={styles.compositeCircleButton}
                onPress={composite.onReAddRecipe}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.dishName} with your saved add-ins`}
              >
                <Text style={styles.compositeCircleButtonText}>+</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.compositeCircleButton}
                onPress={composite.onOpenComposer}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Build ${item.dishName}`}
              >
                <BowlIcon color={colors.maroon600} />
              </Pressable>
            )
          ) : (
            <HoldSlideAddButton
              dishName={item.dishName}
              blocksScrollRefs={blocksScrollRefs}
              onQuickAdd={onQuickAdd}
              onHoldStart={onHoldStart}
              onHoldDrag={onHoldDrag}
              onHoldEnd={onHoldEnd}
              liveCount={liveCount}
              liveIndex={liveIndex}
            />
          )}
        </View>
        <Text style={[styles.stepperCount, { width: COUNT_SLOT_WIDTH }]} numberOfLines={1} pointerEvents="none">
          {formatServings(plateEntry?.count ?? 1)}
        </Text>
        <Pressable
          style={[styles.stepperButton, { width: MINUS_SLOT_WIDTH }]}
          onPress={() => onStep(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove one ${item.dishName}`}
          pointerEvents={inPlate ? "auto" : "none"}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden is the whole trick -- see PlateAddControl's own doc comment. alignItems:
  // "flex-end" is load-bearing, not decoration: stepperRow has a fixed width wider than this
  // clip's own (animated, narrower-than-content while collapsed) width, and the default stretch
  // alignment falls back to flex-start for a fixed-width child -- which anchors the row's LEFT
  // edge to the clip's left edge instead of the row's right edge to the clip's right edge. Since
  // the visible window is always [0, clipWidth] measured from the row's own left edge, without
  // this the collapsed clip showed the row-reverse row's OTHER end (the "−" button) instead of
  // the "+" slot -- pr-reviewer catch, verified against RN's actual Yoga layout output.
  stepperClip: { overflow: "hidden", alignItems: "flex-end", borderRadius: radii.pill },
  stepperRow: { flexDirection: "row-reverse", alignItems: "center", width: STEPPER_FULL_WIDTH },
  // No static `width` -- it differs by state (PLUS_SLOT_SIZE vs IN_PLATE_PLUS_WIDTH, see #413),
  // applied inline at each usage.
  plusSlot: { height: PLUS_SLOT_SIZE, alignItems: "center", justifyContent: "center" },
  stepperButton: { height: fs(44), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(18), color: colors.paper50 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(14), fontWeight: "600", textAlign: "center", color: colors.paper50 },
  // A not-yet-composed composite dish's bowl button, and a saved-recipe composite dish's re-add
  // "+" -- both the same 44x44 outline circle any simple dish's pre-add HoldSlideAddButton
  // renders (CompositeDishRowStates.dc.html:37: 44px / border-radius 999 / 1px rgba(124,36,48,0.45)
  // -- literally HoldSlideAddButton's own addButton style, duplicated here rather than imported
  // since that style isn't exported and these two buttons are plain Pressables, not gesture roots).
  compositeCircleButton: {
    width: fs(44),
    height: fs(44),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },
  compositeCircleButtonText: { fontSize: fs(20), color: colors.maroon600, lineHeight: fs(22) },
});
