import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Keyframe, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { m2 } from "../../lib/theme";
import { m2Linear, m2Motion } from "../../lib/motion";
import { Press, Text } from "../ui";
import { arriveOut } from "../ui/arrive";
import type { MenuState } from "../logic/net";
import { retry } from "../state/net";

const S = m2Motion.net.spinner;
// M2 `.spin`: the platform's activity indicator, drawn only after 400 ms (`spinIn`, 1 ms): a layout animation that holds the view at its
// first keyframe until the delay is spent, so it needs no timer of its own
const spinIn = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1 } }).delay(S.delay).duration(S.snap);

function Spinner() {
  const r = useSharedValue(0);
  useEffect(() => {
    r.set(withRepeat(withTiming(1, { duration: S.d, easing: m2Linear }), -1));
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
 * list, below the pinned rows (`top` is their bottom edge), and leaves by fading out where it stands, so the rows beneath arrive as M2's
 * fade-in does. Its text sits 14 dp lower than `.mst`'s 28 (the paragraph keeps the browser's 1 em margin in M2), and the button 16 dp lower again. `copy` is the one the day change holds while the new day draws: it has no exit of its own.
 */
export function StateCurtain({ state, top, text, copy }: { state: Exclude<MenuState, "ok">; top: number; text: string; copy?: boolean }) {
  return (
    <Animated.View exiting={copy ? undefined : arriveOut} pointerEvents={copy ? "none" : "auto"}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: m2.color.chalk }}>
      <View style={{ marginTop: top }}>
        {state === "loading" ? (
          <View style={{ height: 160, alignItems: "center", justifyContent: "center" }}><Spinner /></View>
        ) : (
          <View style={{ paddingHorizontal: m2.space[4], paddingTop: 42, paddingBottom: m2.space[0] }}>
            <Text v="empty" color={m2.color.slate}>{text}</Text>
            {state === "fail" ? (
              <Press accessibilityRole="button" onPress={() => { retry(); }}
                style={{ marginTop: 28, height: 52, borderRadius: m2.radius.button, borderWidth: 1.5, borderColor: m2.color.vm, alignItems: "center", justifyContent: "center" }}>
                <Text v="action" color={m2.color.vm}>Try again</Text>
              </Press>
            ) : null}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
