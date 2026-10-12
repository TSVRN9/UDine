import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Keyframe, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { m2Motion } from "../../lib/motion";
import { timed } from "../ui/motion";
import { Button, Text } from "../ui";
import { useArrive } from "../ui/arrive";
import type { MenuState } from "../logic/net";
import { retry } from "../state/net";

const S = m2Motion.net.spinner;
// M2 `.spin`: the platform's activity indicator, drawn only after 400 ms (`spinIn`, 1 ms): a layout animation that holds the view at its
// first keyframe until the delay is spent, so it needs no timer of its own
const spinIn = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1 } }).delay(S.delay).duration(S.snap);

function Spinner() {
  const r = useSharedValue(0);
  useEffect(() => {
    r.set(withRepeat(timed(1, m2Motion.spin), -1));
    return () => cancelAnimation(r);
  }, [r]);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get() * 360}deg` }] }));
  return (
    <Animated.View entering={spinIn} accessibilityRole="progressbar" accessibilityLabel="Loading the menu"
      style={[{ width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: m2.color.spinTrack, borderTopColor: m2.color.vm }, turn]} />
  );
}

/**
 * What a hall's list says when it has no menu to show (M2 `.mstate`, `.mst`): loading, not saved offline, didn't load. It is chalk over the
 * list, below the pinned rows (`top` is their bottom edge). The words, the button and the spinner are their own layer and are gone at
 * once when the menu arrives; only the bare chalk beneath leaves by fading out, so the rows are drawn at once and come in from chalk as
 * M2's `arrive()` fades `#mlist` in from 0. `copy` is the one the day change holds while the new day draws: it has no exit.
 */
export function StateCurtain({ state, top, text, copy }: { state: Exclude<MenuState, "ok">; top: number; text: string; copy?: boolean }) {
  const { arriveOut } = useArrive();
  return (
    <>
      <Animated.View exiting={copy ? undefined : arriveOut} pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: m2.color.chalk }} />
      <View pointerEvents={copy ? "none" : "box-none"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <View pointerEvents="box-none" style={{ marginTop: top }}>
          {state === "loading" ? (
            <View style={{ height: 160, alignItems: "center", justifyContent: "center" }}><Spinner /></View>
          ) : (
            <View style={{ paddingHorizontal: m2.space.gutter, paddingTop: m2.space.stateTop + m2.space.paragraph, paddingBottom: m2.space.line }}>
              <Text v="empty" color={m2.color.slate}>{text}</Text>
              {state === "fail" ? (
                <Button kind="line" size="lg" label="Try again" onPress={() => { retry(); }} style={{ marginTop: m2.space.stateGap + m2.space.paragraph }} />
              ) : null}
            </View>
          )}
        </View>
      </View>
    </>
  );
}
