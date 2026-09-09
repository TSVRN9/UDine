import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { paneDragPosition, paneIndexForSwipe, paneOffsetRange, paneVisibility, settleDuration, tabUnderlineInsets } from "../lib/paneShell";
import { colors, fs } from "../lib/theme";

// Same cubic-bezier PaneStack.tsx uses for its own pane transform -- one shared "how a pane
// crossfades" feel across the app, not a second curve to keep in sync by hand. Smaller offset than
// PaneStack's full-screen 36px (fs(36)): this pager's panes are the tab content area only, not a
// whole screen, so a smaller lateral shift reads proportionate.
const PANE_CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
const PANE_OFFSET = fs(24);

// isHorizontalSwipe's own dominance threshold (10px), reused here so the gesture-handler dominance
// gate matches the original PanResponder-era feel instead of an unrelated new constant.
const HORIZONTAL_DOMINANCE_PX = 10;

/**
 * One windowed pane -- its own component (not an inline `.map()` callback in MealTabPager's body)
 * because `useAnimatedStyle` is a hook: with a variable `panes.length` (1-5 tabs) and windowing that
 * skips all but ~3 indices, calling it directly inside the parent's `.map()` would vary the hook
 * count render to render. A sibling instance per pane sidesteps that -- each one follows the rules
 * of hooks on its own.
 */
function MealTabPane({
  pane,
  index,
  activeIndex,
  panePos,
  paneOpacityPos,
}: {
  pane: ReactNode;
  index: number;
  activeIndex: number;
  panePos: ReturnType<typeof useSharedValue<number>>;
  paneOpacityPos: ReturnType<typeof useSharedValue<number>>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(panePos.value, [index - 1, index, index + 1], paneOffsetRange(PANE_OFFSET), Extrapolation.CLAMP),
      },
    ],
    opacity: interpolate(paneOpacityPos.value, [index - 1, index, index + 1], [0, 1, 0], Extrapolation.CLAMP),
  }));
  const active = index === activeIndex;
  const { zIndex, pointerEvents } = paneVisibility(index, activeIndex);
  return (
    <Animated.View
      pointerEvents={pointerEvents}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      renderToHardwareTextureAndroid={true}
      style={[styles.pane, { zIndex }, style]}
    >
      {pane}
    </Animated.View>
  );
}

/**
 * Swipeable, crossfading tab pager for the hall/café menu screen's meal tabs (Breakfast / Lunch /
 * Dinner / Late Night / Grab 'N Go). Deliberately a sibling of `PaneStack.tsx`, not a reuse of it:
 * `PaneStack` is coupled to `PaneHeader`'s title-dot chrome (Home/Events/You specific), which this
 * screen doesn't want -- its tab row above already renders labels and its own underline, driven off
 * the committed `activeIndex`/`onActiveIndexChange`, not live-tracked during the drag. (`PaneHeader`'s
 * own dot morph used to be commit-only for an unrelated reason -- a JS-thread-only `Animated.Value`
 * that couldn't share a native-driven value with the panes' transform/opacity -- but now shares a
 * Reanimated value the same way its title crossfade always did; this pager's own underline is a
 * separate design choice, by its own tab-row implementation, unaffected by that.)
 *
 * The gesture math itself (`Gesture.Pan()` wiring, shared values, commit/settle) is copied from
 * `PaneStack.tsx`'s established pattern rather than duplicated by hand from scratch -- but the tuned
 * constants and thresholds (`SWIPE_COMMIT_PX`, `PANE_DRAG_PX`, fling velocity, settle-duration curve)
 * stay single-sourced in `lib/paneShell.ts`, now generalized to take this pager's own `panes.length`
 * instead of always assuming the Home shell's 3.
 *
 * Migrated off `PanResponder` to `react-native-gesture-handler`'s `Gesture.Pan()` (native gesture
 * recognition/arbitration instead of JS-thread responder negotiation) driving `react-native-
 * reanimated` shared values (so the drag position updates on the UI thread, not via a JS round trip
 * per touch-move frame -- see PaneStack.tsx's own doc for why plain gesture-handler alone, without
 * Reanimated, doesn't get there). The `Gesture.Pan()` object is rebuilt fresh every render (RNGH's
 * own documented pattern -- their docs explicitly warn against memoizing/ref-caching a gesture
 * object across renders, since that reintroduces exactly the stale-closure bug a `useRef`-once
 * `PanResponder` had) rather than ported forward via the old `countRef`/`onActiveIndexChangeRef`
 * indirection: `count`, `activeIndex`, and `onActiveIndexChange` are just closed over directly, and
 * a fresh render always means a fresh, correctly-scoped closure. `dragStartIndex` is the one piece
 * of state that genuinely needs to survive across a single gesture's begin/update/end -- that's a
 * `useSharedValue`, readable from the worklets these callbacks compile to.
 *
 * Windowed to `activeIndex ± 1` (renders `null` for anything further away): every mounted pane here
 * is a real `SectionList` doing real filtering, not lightweight screen chrome, and `paneDragPosition`
 * already guarantees the animated position -- and therefore anything a crossfade could ever visually
 * reveal -- never leaves that same ±1 neighborhood. This is also what keeps the Grab tab's lazy fetch
 * lazy end-to-end: its pane stays fully unmounted (not just inactive) until the user is on Late Night
 * or Grab itself.
 */
export function MealTabPager({
  panes,
  activeIndex,
  onActiveIndexChange,
  instantRef,
  panePos: externalPanePos,
}: {
  panes: ReactNode[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  /** One-shot flag a caller sets to `true` right before an `activeIndex` change it wants to land
   * without a tween -- e.g. [slug].tsx's own current-meal auto-correction, which isn't a real swipe
   * and shouldn't visibly animate through the tabs in between. Consumed (reset to `false`) by the
   * very next commit below, same lifecycle as `committedIndexRef`. A ref, not a prop value read
   * once, so setting it doesn't itself trigger a re-render. */
  instantRef?: { current: boolean };
  /** Optional: a shared value the CALLER also wants to read this pager's live drag/settle position
   * from -- e.g. [slug].tsx's tab row, to animate its underline in lockstep with the same position
   * driving the pane crossfade (AnimatedTabUnderline below). Created here as a fallback when the
   * caller doesn't need it, same "parent creates it, child takes it as a prop" shape as this
   * session's HoldSlideHost -- but via an unconditional hook call selected by a plain ternary, not
   * a conditional hook call, so every render still calls the same hooks in the same order whether
   * or not a caller passes one. */
  panePos?: SharedValue<number>;
}) {
  const count = panes.length;
  const ownPanePos = useSharedValue(activeIndex);
  const panePos = externalPanePos ?? ownPanePos;
  const paneOpacityPos = useSharedValue(activeIndex);
  // The one piece of state that must survive across a single gesture's onStart -> onUpdate -> onEnd
  // sequence, which can span a re-render (the Gesture.Pan() object below is rebuilt every render --
  // see this component's own doc comment -- but a shared value's identity, like a ref's, persists
  // across that rebuild).
  const dragStartIndex = useSharedValue(activeIndex);
  // "Where did the animated position last land" for THIS effect's own instant-vs-tween decision --
  // deliberately a plain `useRef`, not a shared value: a `useSharedValue` mock/implementation can
  // legitimately re-derive its `.value` from the CURRENT `activeIndex` argument on every render
  // (confirmed against this repo's own Jest reanimated mock, `useSharedValue: (init) => ({value:
  // init})` called fresh every render -- real Reanimated's shared values behave like `useRef`
  // instead, persisting independent of a hook's argument after mount, but nothing here should
  // depend on that subtlety to be correct), which would make "did a gesture already commit this
  // value" untestable and, worse, ambiguous by construction. A ref has no such ambiguity in either
  // environment.
  //
  // Written from TWO places, both eagerly, specifically to avoid the exact race an earlier version
  // of this fix still had: `commitActiveIndex` (below) writes it on the JS thread the INSTANT a
  // gesture's `onEnd` reports a commit -- in the SAME call that triggers `onActiveIndexChange`,
  // before React has re-rendered -- so a run of several rapid gesture commits keeps this ref
  // correctly caught up to the LATEST one even if React coalesces/skips rendering the intermediate
  // `activeIndex` values in between (confirmed: `MealTabPager.test.tsx`'s "5 rapid alternating
  // swipes" case). This effect's own trailing write covers the other path into a commit -- a tab
  // TAP, or the instant auto-correct -- which never touches `commitActiveIndex` at all.
  const committedIndexRef = useRef(activeIndex);
  // JS-thread only (never called from a worklet) -- the single place a gesture's commit reaches
  // `onActiveIndexChange`, so `committedIndexRef` above and the caller's own `activeIndex` state
  // update happen from the exact same synchronous call, in true commit order, however fast commits
  // arrive.
  // Mutates committedIndexRef -- see the eslint-disable-next-line on the .onEnd() call below that
  // reaches this function via runOnJS for why that's safe here.
  function commitActiveIndex(next: number) {
    committedIndexRef.current = next;
    onActiveIndexChange(next);
  }

  useEffect(() => {
    const from = committedIndexRef.current;
    const instant = instantRef?.current === true;
    if (instant) instantRef!.current = false;
    // A swipe's own onEnd already eagerly recorded this exact activeIndex in committedIndexRef AND
    // already started settling panePos/paneOpacityPos there itself (see commitActiveIndex/onEnd) --
    // if this effect fired because THAT commit round-tripped back to a render, `from` already
    // equals `activeIndex` and there is nothing left to animate. Re-triggering a SECOND, independent
    // withTiming here anyway is exactly what caused the on-device rapid-reversal corruption (two
    // competing tweens retargeting the same shared value from different starting points, on top of
    // each other, never cleanly resolving -- symptoms: the pane appearing frozen for several
    // seconds, then two panes' content briefly visible at once). Only a change that did NOT come
    // from a just-completed gesture -- a tab TAP, or the instant auto-correct path -- still needs
    // this effect to do the animating; `instant` always falls through below even if `from` happens
    // to already match, but that's a harmless no-op re-seed, not a race.
    if (!instant && from === activeIndex) return;
    if (instant || Math.abs(activeIndex - from) > 1) {
      panePos.value = activeIndex;
      paneOpacityPos.value = activeIndex;
    } else {
      panePos.value = withTiming(activeIndex, { duration: 340, easing: PANE_CURVE });
      paneOpacityPos.value = withTiming(activeIndex, { duration: 260, easing: Easing.ease });
    }
    committedIndexRef.current = activeIndex;
    dragStartIndex.value = activeIndex;
    // panePos/paneOpacityPos are stable useSharedValue identities; instantRef's identity is stable
    // too (a ref) -- listed so this effect only re-fires on a real activeIndex commit, not on every
    // render.
  }, [activeIndex, panePos, paneOpacityPos, instantRef, dragStartIndex]);

  // Worklet (runs on the UI thread from the gesture callbacks below, and directly as plain JS when
  // called nowhere else needs it) -- mirrors PaneStack.tsx's identical helper.
  function settlePosition(target: number, from: number = target) {
    "worklet";
    panePos.value = withTiming(target, { duration: settleDuration(from, target, 340), easing: PANE_CURVE });
    paneOpacityPos.value = withTiming(target, { duration: settleDuration(from, target, 260), easing: Easing.ease });
  }

  const pan = Gesture.Pan()
    .enabled(count > 1)
    // Native equivalent of the old `onMoveShouldSetPanResponder`'s `isHorizontalSwipe` dominance
    // check: activates only past 10px of horizontal travel -- gesture ARBITRATION happens natively
    // now instead of a per-move JS decision, unlike PanResponder. Deliberately NOT the exact same
    // formula (`isHorizontalSwipe` is `|dx| > 10 && |dx| > |dy|`, a diagonal-dominance test --
    // `activeOffsetX` alone is a plain horizontal-distance threshold, slightly narrower for a
    // sharply diagonal drag): a `failOffsetY` counterpart was tried and dropped, since it fails the
    // gesture permanently past 10px of vertical travel regardless of how large `dx` grows
    // afterward, which is stricter than the old dominance check ever was. `activeOffsetX` alone
    // already lets RNGH's own native arbitration resolve the vertical-scroll-vs-horizontal-swipe
    // conflict (a pane's SectionList only starts scrolling once ITS OWN threshold is crossed; this
    // gesture doesn't activate until 10px of horizontal travel either, so a vertical scroll that
    // never accumulates 10px of horizontal drift never contests it).
    .activeOffsetX([-HORIZONTAL_DOMINANCE_PX, HORIZONTAL_DOMINANCE_PX])
    // `onStart` (fires on transition to ACTIVE, i.e. once `activeOffsetX` is actually crossed) is
    // the analog of `onPanResponderGrant` -- NOT `onBegin`. `onBegin` fires at BEGAN, on every
    // touch-down, before recognition -- capturing `dragStartIndex`/cancelling the in-flight settle
    // there would fire on every tab tap or vertical scroll too (anything that touches this View),
    // and since `onEnd` "will be called only if the handler was previously in the ACTIVE state"
    // (RNGH's own doc comment on `onEnd`), a touch that never activates would cancel a settle
    // animation with nothing to ever restore it (no onEnd fires to call `settlePosition` back).
    .onStart(() => {
      // Deliberately does NOT reseed dragStartIndex.value from the closed-over `activeIndex` prop
      // here -- that prop can still be one render behind if this touch begins before React has
      // committed the previous gesture's onActiveIndexChange (a fast reversal: swipe, release,
      // swipe again, all before the JS round trip lands). dragStartIndex is instead kept
      // authoritative by onEnd's own eager write below (zero-latency, UI thread) and by the effect
      // above (covers a tab tap, which never reaches onEnd) -- so by the time a new gesture can
      // start, it already holds the true last-committed index.
      //
      // A settle from the previous gesture (release/cancel) can still be in flight when a new drag
      // starts -- cancel it so onUpdate's assignment below isn't fighting a running animation.
      cancelAnimation(panePos);
      cancelAnimation(paneOpacityPos);
    })
    .onUpdate((e) => {
      const dragPos = paneDragPosition(dragStartIndex.value, e.translationX, count);
      panePos.value = dragPos;
      paneOpacityPos.value = dragPos;
    })
    // react-hooks/refs flags the .onEnd(...) call below because commitActiveIndex (reached via
    // runOnJS inside it) touches committedIndexRef, and this whole callback is BUILT during render
    // (same as every Gesture.Pan() callback in this file) -- but it's never CALLED during render,
    // only later, by the native gesture runtime, once a real touch sequence ends. Same "function
    // created during render, invoked later by an event" shape as a plain
    // `onPress={() => (ref.current = x)}` handler, which this rule does not flag -- and the same
    // class of false positive this file's own `react-hooks/immutability: off` override (see
    // eslint.config.js) already documents for the shared-value writes throughout this same
    // callback. Disabled per-site, not via a file-wide `react-hooks/refs: off`, so the rule still
    // guards the rest of this file against an actual render-time ref mutation.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((e, success) => {
      // Read once, at the top: this is the drag's true starting point regardless of whether
      // `activeIndex` (the closed-over prop) has caught up to it yet -- see onStart's comment.
      const from = dragStartIndex.value;
      if (!success) {
        // Cancelled/failed mid-drag (e.g. a parent gesture stole it) -- settle back to where the
        // drag started instead of stranding the pane at a fractional offset.
        settlePosition(from, paneDragPosition(from, e.translationX, count));
        return;
      }
      // velocityX: a fast short flick commits even under SWIPE_COMMIT_PX of travel (paneIndexForSwipe's
      // own doc) -- the biggest single source of the swipe reading as unresponsive was a quick
      // flick doing nothing at all because it never crossed the distance threshold.
      const next = paneIndexForSwipe(from, e.translationX, e.velocityX, count);
      settlePosition(next, paneDragPosition(from, e.translationX, count));
      // Eager, UI-thread write -- the very next gesture's onStart (which may begin before this
      // commit's runOnJS below has round-tripped back to a re-render) reads this, not the prop.
      dragStartIndex.value = next;
      // Compare against `from`, not the closed-over `activeIndex` prop: on a fast reversal the
      // prop can still be stale here too, and comparing against it could skip this call entirely
      // (committing the shared-value position to `next` while React never hears about it) --
      // exactly the "skips a tab" symptom. Routed through commitActiveIndex, not
      // onActiveIndexChange directly -- see its own doc comment for why the eager
      // committedIndexRef write has to happen in the exact same JS-thread call as this one.
      if (next !== from) runOnJS(commitActiveIndex)(next);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root}>
        {panes.map((pane, j) => {
          if (Math.abs(j - activeIndex) > 1) return null;
          return <MealTabPane key={j} pane={pane} index={j} activeIndex={activeIndex} panePos={panePos} paneOpacityPos={paneOpacityPos} />;
        })}
      </View>
    </GestureDetector>
  );
}

/** The tab row's own active-tab underline, live-tracking the SAME `panePos` a `MealTabPager`
 * reads for its pane crossfade (pass the exact value handed to that pager's own `panePos` prop) --
 * so the underline moves with a swipe instead of snapping only once the swipe commits, and draws
 * in on a tab tap's instant position-snap the same way it does on a swipe's settle tween (both are
 * just this same pure function of whatever `panePos` currently holds). Renders once per tab,
 * absolutely positioned to fill its tab's own underline slot (the caller keeps that slot's layout
 * -- height/margin -- in normal flow; this only paints the animated fill inside it). The actual
 * shrink/draw-in math is `tabUnderlineInsets` in paneShell.ts (unit-tested there) -- see its own
 * doc comment for the visual intent (canvas request: "the left side of the bar should gradually
 * move to the right, with the right side fixed" while swiping away; "draw the bar from left to
 * right" while settling onto a tab). */
export function AnimatedTabUnderline({ index, panePos }: { index: number; panePos: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const { left, right } = tabUnderlineInsets(panePos.value, index);
    return { left: `${left * 100}%`, right: `${right * 100}%` };
  });
  return <Animated.View style={[styles.underlineFill, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Same background as PaneStack.tsx's own pane style -- without it, the outgoing pane's real
  // background (its own View/SectionList content) shows through the incoming pane's transparent gap
  // during the crossfade instead of a solid backdrop.
  pane: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.cream100 },
  underlineFill: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.gold500, borderRadius: 2 },
});
