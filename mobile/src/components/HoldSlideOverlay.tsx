import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { DRAG_STEP_COUNT, DRAG_STEP_PX, cancelBlend, formatServings } from "../lib/servingsStepper";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import type { ButtonAnchor } from "./HoldSlideAddButton";

const TRACK_HEIGHT = 176;
const BUTTON_ZONE = 44;
// The ladder's fixed center -- the always-highlighted "current value" tick lives here; the rest
// of the ladder scrolls past it (see LadderTick below). Matches the design canvas's gold dot
// position (top ~60-66 in a 176-tall track).
const LADDER_TOP = 12;
const LADDER_BOTTOM = TRACK_HEIGHT - BUTTON_ZONE - 12;
const CENTER_Y = (LADDER_TOP + LADDER_BOTTOM) / 2;
const TICK_SIZE = 6;
const CURRENT_SIZE = 12;
const LADDER_OFFSETS = [-2, -1, 0, 1, 2];
// One shared fixed-size box both the "+" and "✕" glyphs sit in (width/height/lineHeight all equal,
// textAlign centered) at the SAME computed left/top -- replaces two independently hand-tuned `left`
// offsets (one per glyph, `-9` vs `-7`) that never actually agreed with each other.
const GLYPH_BOX = 22;
// Spec (ServingsF.dc.html:134) wants an OUTSET ring around the thumb circle -- box-shadow:
// 0 0 0 5px, painting outside the 44px circle, leaving the circle's own fill untouched (it
// needs to stay visible/animatable through the cancel-drag color blend). RN box-shadow doesn't
// reproduce a solid-color ring reliably, so this is a same-size-plus-outset sibling view whose
// OWN BORDER (not fill) sits in that outward band -- borderWidth: PLUS_RING_OUTSET,
// backgroundColor: "transparent" -- so its interior stays see-through over the real circle
// instead of washing over it.
const PLUS_RING_OUTSET = 5;

interface Props {
  anchor: ButtonAnchor;
  /** Plain prop, not a shared value -- the count text only needs to update roughly once per
   * DRAG_STEP_PX of movement (see HoldSlideAddButton's onHoldDrag doc comment), so it's cheap
   * enough to just re-render this small overlay component on change rather than threading it
   * through a UI-thread-only text trick. The ladder position DOES need per-frame smoothness, so
   * that stays on a shared value read via useAnimatedStyle. */
  count: number;
  liveIndex: SharedValue<number>;
}

/** One dot in the hold-and-drag track's tick ladder (canvas: "F: inline vertical slide"). The
 * ladder is a literal, physically-spaced ruler -- ticks sit exactly DRAG_STEP_PX apart, matching
 * real finger travel 1:1 -- not a compressed map of the whole range redrawn to fit the track's
 * height (that range needs 9 addable steps' worth of travel, far taller than the track). Each
 * instance owns a fixed offset `k` from the current value; since the current value by definition
 * always renders at k=0, that slot is permanently the enlarged/gold one -- pr-reviewer worth-a-
 * look note: this means the gold styling visibly hands off from one physical dot to its neighbor
 * at every half-serving crossing (the position itself is smooth, a sawtooth between +/-13px, but
 * which of the 5 instances is "current" is a discrete swap, not a cross-fade) -- confirmed fine
 * on-device (the ladder reads as a ruler, not a glitch), not a smooth morph between dots. Index 0
 * is CANCEL_SERVINGS (0) -- reaching it needs no special-casing here, it renders as an ordinary
 * rung; the pill's glyph/caption/color swap (below) is what actually signals "this releases as
 * cancel". */
function LadderTick({ k, anchorWidth, liveIndex }: { k: number; anchorWidth: number; liveIndex: SharedValue<number> }) {
  const isCurrent = k === 0;
  const size = isCurrent ? CURRENT_SIZE : TICK_SIZE;
  const style = useAnimatedStyle(() => {
    const nearest = Math.round(liveIndex.value);
    const frac = liveIndex.value - nearest;
    const index = nearest + k;
    const outOfRange = index < 0 || index > DRAG_STEP_COUNT;
    return {
      top: CENTER_Y - k * DRAG_STEP_PX + frac * DRAG_STEP_PX - size / 2,
      opacity: outOfRange ? 0 : 1,
    };
  });
  return <Reanimated.View style={[isCurrent ? styles.currentDot : styles.dot, style, { left: anchorWidth / 2 - size / 2 }]} />;
}

/** Screen-level overlay for the hall-menu hold-and-drag add button (canvas: "F: inline vertical
 * slide"). Anchored to the held button's measured window position, not rendered inside the
 * SectionList row itself -- see HoldSlideAddButton's own doc comment for why. The pill is one
 * continuous stadium shape (round 3 of the design workshop: no seam between "button" and
 * "track") the same width as the button it grows out of, with the + glyph staying at the
 * button's original position. Every live value (ladder position, count text, cancel state) reads
 * a Reanimated shared value directly via useAnimatedStyle/useAnimatedProps -- this component
 * never re-renders during a drag, only on mount/unmount. */
export function HoldSlideOverlay({ anchor, count, liveIndex }: Props) {
  const pillLeft = anchor.x;
  const pillBottom = anchor.y + anchor.height;
  const pillTop = pillBottom - TRACK_HEIGHT;

  // Grows the track out of the button on mount instead of popping in at full height -- this
  // component only ever mounts fresh (HoldSlideHost unmounts it on close, see its own doc
  // comment), so a mount-only effect fires exactly once per hold, every hold.
  const heightProgress = useSharedValue(0);
  useEffect(() => {
    heightProgress.value = withTiming(1, { duration: 180 });
  }, [heightProgress]);

  const pillStyle = useAnimatedStyle(() => {
    const height = BUTTON_ZONE + heightProgress.value * (TRACK_HEIGHT - BUTTON_ZONE);
    return {
      height,
      top: pillBottom - height,
      backgroundColor: interpolateColor(cancelBlend(liveIndex.value), [0, 1], [colors.maroon600, colors.ink900]),
    };
  });
  const bubbleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(cancelBlend(liveIndex.value), [0, 1], [colors.maroon900, colors.ink900]),
  }));
  const countOpacityStyle = useAnimatedStyle(() => ({ opacity: 1 - cancelBlend(liveIndex.value) }));
  const cancelOpacityStyle = useAnimatedStyle(() => ({ opacity: cancelBlend(liveIndex.value) }));
  const plusStyle = useAnimatedStyle(() => ({ opacity: 1 - cancelBlend(liveIndex.value) }));
  const cancelGlyphStyle = useAnimatedStyle(() => ({ opacity: cancelBlend(liveIndex.value) }));
  const adjustCaptionStyle = useAnimatedStyle(() => ({ opacity: 1 - cancelBlend(liveIndex.value) }));
  const cancelCaptionStyle = useAnimatedStyle(() => ({ opacity: cancelBlend(liveIndex.value) }));

  const glyphLeft = anchor.width / 2 - GLYPH_BOX / 2;
  const glyphTop = TRACK_HEIGHT - BUTTON_ZONE + (BUTTON_ZONE - GLYPH_BOX) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <View style={[styles.captionWrap, { left: pillLeft + anchor.width / 2 - 80, top: pillTop - 20, width: 160 }]}>
        <Reanimated.Text numberOfLines={1} style={[styles.caption, adjustCaptionStyle]}>Slide to adjust</Reanimated.Text>
        <Reanimated.Text numberOfLines={1} style={[styles.caption, styles.captionOverlay, cancelCaptionStyle]}>Slide down to cancel</Reanimated.Text>
      </View>
      <Reanimated.View style={[styles.pill, { left: pillLeft, width: anchor.width, borderRadius: anchor.width / 2 }, pillStyle]}>
        {LADDER_OFFSETS.map((k) => (
          <LadderTick key={k} k={k} anchorWidth={anchor.width} liveIndex={liveIndex} />
        ))}
        <View
          style={[
            styles.plusRing,
            {
              top: TRACK_HEIGHT - BUTTON_ZONE - PLUS_RING_OUTSET,
              left: -PLUS_RING_OUTSET,
              width: anchor.width + PLUS_RING_OUTSET * 2,
              height: BUTTON_ZONE + PLUS_RING_OUTSET * 2,
              borderRadius: (anchor.width + PLUS_RING_OUTSET * 2) / 2,
            },
          ]}
        />
        <Reanimated.Text style={[styles.plusGlyph, plusStyle, { top: glyphTop, left: glyphLeft }]}>+</Reanimated.Text>
        <Reanimated.Text style={[styles.plusGlyph, cancelGlyphStyle, { top: glyphTop, left: glyphLeft }]}>✕</Reanimated.Text>
      </Reanimated.View>
      <Reanimated.View style={[styles.bubble, bubbleStyle, { left: pillLeft - 98, top: pillTop + CENTER_Y - 12 }]}>
        <Reanimated.View style={[styles.bubbleContent, countOpacityStyle]} pointerEvents="none">
          <Text style={styles.bubbleValue} numberOfLines={1}>{formatServings(count)}</Text>
          <Text style={styles.bubbleLabel}>{count === 1 ? "serving" : "servings"}</Text>
        </Reanimated.View>
        <Reanimated.View style={[styles.bubbleContent, styles.bubbleOverlay, cancelOpacityStyle]} pointerEvents="none">
          <Text style={styles.bubbleValue}>Cancel</Text>
        </Reanimated.View>
      </Reanimated.View>
    </View>
  );
}

export interface HoldSlideHostHandle {
  open: (anchor: ButtonAnchor) => void;
  updateCount: (count: number) => void;
  close: () => void;
}

/** Owns the overlay's mount/unmount state AND its (throttled, see HoldSlideAddButton's onHoldDrag)
 * count text in its own small component, rendered once at the hall screen's top level (a sibling
 * of the SectionLists) -- see [slug].tsx's `holdSlideHostRef` doc comment for why this can't just
 * be state in the screen component itself: this component's own re-renders (on open/close/count-
 * change -- rare, once per hold or once per half-step, never once per drag frame) stay scoped to
 * this tiny tree, never touching the screen's own render (and therefore never touching the
 * SectionList's `renderItem` identity). The screen calls these methods via the ref instead of a
 * state setter for exactly this reason -- a ref call doesn't re-render the caller. */
export const HoldSlideHost = forwardRef<HoldSlideHostHandle, { liveIndex: SharedValue<number> }>(
  function HoldSlideHost({ liveIndex }, ref) {
    const [anchor, setAnchor] = useState<ButtonAnchor | null>(null);
    const [count, setCount] = useState(1);
    useImperativeHandle(ref, () => ({
      open: (a: ButtonAnchor) => {
        setCount(1);
        setAnchor(a);
      },
      updateCount: (c: number) => setCount(c),
      close: () => setAnchor(null),
    }));
    if (!anchor) return null;
    return <HoldSlideOverlay anchor={anchor} count={count} liveIndex={liveIndex} />;
  },
);

const styles = StyleSheet.create({
  scrim: { backgroundColor: withOpacity(colors.ink900, 18) },
  captionWrap: { position: "absolute", alignItems: "center" },
  caption: {
    fontFamily: fonts.display,
    fontWeight: "600",
    fontSize: fs(9),
    letterSpacing: 1,
    textTransform: "uppercase",
    color: withOpacity(colors.ink900, 50),
    textAlign: "center",
  },
  captionOverlay: { position: "absolute", left: 0, right: 0 },
  pill: { position: "absolute", shadowColor: colors.ink900, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  dot: { position: "absolute", width: TICK_SIZE, height: TICK_SIZE, borderRadius: radii.pill, backgroundColor: withOpacity(colors.paper50, 55) },
  currentDot: {
    position: "absolute",
    width: CURRENT_SIZE,
    height: CURRENT_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.gold500,
    shadowColor: colors.gold500,
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  plusRing: {
    position: "absolute",
    backgroundColor: "transparent",
    borderWidth: PLUS_RING_OUTSET,
    borderColor: withOpacity(colors.gold500, 30),
  },
  plusGlyph: {
    position: "absolute",
    width: GLYPH_BOX,
    height: GLYPH_BOX,
    fontSize: fs(20),
    lineHeight: GLYPH_BOX,
    textAlign: "center",
    color: colors.paper50,
  },
  bubble: {
    position: "absolute",
    minWidth: 90,
    borderRadius: radii.pill,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    shadowColor: colors.ink900,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bubbleContent: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  bubbleOverlay: { position: "absolute", left: spacing(3), top: spacing(1.5) },
  bubbleValue: {
    fontFamily: fonts.mono,
    fontSize: fs(16),
    fontWeight: "600",
    color: colors.paper50,
    padding: 0,
    margin: 0,
  },
  bubbleLabel: {
    // Literal, not fs(10) -- spec (ServingsF.dc.html:131) pins this at 10px.
    fontSize: 10,
    color: withOpacity(colors.paper50, 70),
    padding: 0,
    margin: 0,
  },
});
