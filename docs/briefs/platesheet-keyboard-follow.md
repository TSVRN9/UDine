# PlateSheet search pane tracks the keyboard's live animation

Goal: opening the keyboard from the food-search field in the plate sheet moves the sheet in
lockstep with the keyboard's own slide animation, instead of the sheet snapping to its final
position in one frame while the OS keyboard is still animating underneath it.

## Spec

UI: none — no artboard covers keyboard-follow motion (checked `Prototype.dc.html`,
`PlateSheetResults.dc.html`, `PlateExpanded.dc.html`, `canvas.json` for "keyboard": no hits).
This is a technical/UX correctness fix, not a spec-conformance fix.
Annotations: none.
States:
- Keyboard opening while the search field is focused — sheet margin tracks the keyboard's live
  height every frame, not a single post-hoc jump.
- Keyboard closing — same, in reverse.
- iOS — the platform that actually shows the desync (`keyboardWillShow` fires at the *start* of
  the native slide, so a discrete state snap visibly leads the keyboard).
- Android — `keyboardDidShow` fires after the keyboard is already shown, so Android was never
  desynced in the same way; verify no regression (sheet still ends up in the right place).
Routes: extend `mobile/scripts/screenshot.sh` with a route that opens `PlateSheet` and taps its
search field, `--record` across the keyboard open/close, reviewed frame-by-frame (iOS).

Backend: none.
Residency: none — pure client-side animation fix, no new client→Supabase call, no new stored
data.
Rationale: `mobile/src/components/PlateSheet.tsx` currently uses a `Keyboard` event listener
(`keyboardWillShow`/`keyboardWillHide` on iOS, `keyboardDidShow`/`keyboardDidHide` on Android,
~lines 232-244) driving a plain `useState<number>` called `keyboardHeight`, applied as a static,
non-animated `View` style (`marginBottom: keyboardHeight`, ~line 591). Because this is a discrete
React state snap with no interpolation, the sheet's margin jumps to its final value in one render
frame instead of following the keyboard's own animation.

`react-native-reanimated` 4.5.1 is already a project dependency. Its `useAnimatedKeyboard()` hook
exposes a live, per-frame `SharedValue` tracking the keyboard's real height across both
platforms — driving an `useAnimatedStyle` off it keeps the sheet visually locked to the actual
keyboard animation with no new dependency and no new duration/easing literal (the motion mirrors
native timing directly; nothing to add to `mobile/src/lib/motion.ts`).

A comment near the current listener explains why a manual approach is used at all:
`KeyboardAvoidingView`'s automatic height-tracking doesn't reach content mounted inside an
Android RN Modal. That reachability constraint must be preserved — do not reintroduce
`KeyboardAvoidingView`; only the animation/interpolation part is being replaced.

Rejected alternative: keep the `Keyboard` listener but animate toward the reported height with
`withTiming`/`Animated.timing`. Rejected because it re-invents a hand-tuned duration/easing for
motion the OS is already animating, and would still lag one JS-thread render behind the native
animation's start — which is the actual bug, not merely the lack of any animation at all.

Explicitly out of scope: the existing interaction between `insets.bottom` and keyboard height on
the sheet's own padding (~line 592 area) — pre-existing, unrelated behavior. Do not touch it.

## Acceptance

- [ ] The sheet's margin is driven by `useAnimatedKeyboard()`'s live shared value, not a
      discrete `useState` snap from a `Keyboard` listener — evidence: test
- [ ] `PlateSheet.test.tsx` has a new test asserting the wrapper's `marginBottom` reflects a
      mocked `useAnimatedKeyboard` return (e.g. `height: { value: 250 }`) — fails against the
      current `useState`-based code (stays 0, no keyboard event fires in Jest), passes once wired
      to the hook — evidence: test (red then green)
- [ ] The Android-Modal-reachability behavior is preserved — `KeyboardAvoidingView` is not
      reintroduced — evidence: code review / diff
- [ ] Screenshot/recording of the search field's keyboard open/close on iOS shows the sheet
      tracking the keyboard's slide, not leading it — evidence: screenshot (`--record`)

## Tasks

1. In `mobile/src/components/PlateSheet.tsx`: remove the `Keyboard` import/listener/`useState`
   (~lines 232-244); add `useAnimatedKeyboard`, `useAnimatedStyle` as named imports alongside the
   existing default `Animated` import from `react-native-reanimated`; replace the plain `View`
   wrapper (~line 591) with `Animated.View style={keyboardStyle}` where `keyboardStyle` is an
   `useAnimatedStyle` reading `keyboard.height.value` (not `.get()` — the reanimated mock's
   default `height` is a bare number with no `.get()`); keep the Android-Modal-reachability
   comment, updated to describe the new hook instead of the deleted listener. Add the red/green
   test in `PlateSheet.test.tsx` (`jest.spyOn(Reanimated, "useAnimatedKeyboard").mockReturnValue`
   pattern). Extend `mobile/scripts/screenshot.sh` with a route reaching PlateSheet's search
   field if one doesn't already exist, and capture a `--record` pass on iOS reviewed
   frame-by-frame. — files: `mobile/src/components/PlateSheet.tsx`,
   `mobile/src/components/PlateSheet.test.tsx`, `mobile/scripts/screenshot.sh` — lanes:
   `cd mobile && npx tsc --noEmit && npx jest && pnpm lint` — blocked by: none — PR:
